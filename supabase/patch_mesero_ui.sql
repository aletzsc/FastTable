-- Parche para proyectos que ya tienen la base montada (ejecutar en SQL Editor, una vez).
-- Añade visibilidad de solicitudes por mesero asignado + RPCs de atención completa y toggle mesas.
-- RLS: ejecútalo con RLS activado; no desactives políticas. Ver supabase/EJECUCION.txt (sección RLS).
-- Los UPDATE con id_personal_atendiendo usan EXECUTE … USING para evitar error 42P01 (v_staff_id).

CREATE OR REPLACE FUNCTION public.puede_ver_solicitud_servicio(p_id_mesa uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN NOT EXISTS (
      SELECT 1 FROM public.personal p
      WHERE p.id_usuario = auth.uid() AND p.activo = true
    ) THEN false
    WHEN EXISTS (
      SELECT 1 FROM public.personal p
      WHERE p.id_usuario = auth.uid() AND p.activo = true
      AND p.rol IS DISTINCT FROM 'mesero'::public.rol_personal
    ) THEN true
    WHEN p_id_mesa IS NULL THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.mesas m
      INNER JOIN public.personal p ON p.id = m.id_personal_atendiendo
      WHERE m.id = p_id_mesa AND p.id_usuario = auth.uid() AND p.activo = true
    )
  END;
$function$;

DROP POLICY IF EXISTS solicitudes_select ON public.solicitudes_servicio;
DROP POLICY IF EXISTS solicitudes_insert ON public.solicitudes_servicio;
DROP POLICY IF EXISTS solicitudes_update_personal ON public.solicitudes_servicio;
DROP POLICY IF EXISTS solicitudes_delete_personal ON public.solicitudes_servicio;

CREATE POLICY solicitudes_select ON public.solicitudes_servicio FOR SELECT TO authenticated
  USING (id_usuario = auth.uid() OR public.puede_ver_solicitud_servicio(id_mesa));
CREATE POLICY solicitudes_insert ON public.solicitudes_servicio FOR INSERT TO authenticated
  WITH CHECK (id_usuario IS NULL OR id_usuario = auth.uid());
CREATE POLICY solicitudes_update_personal ON public.solicitudes_servicio FOR UPDATE TO authenticated
  USING (public.puede_ver_solicitud_servicio(id_mesa));
CREATE POLICY solicitudes_delete_personal ON public.solicitudes_servicio FOR DELETE TO authenticated
  USING (public.puede_ver_solicitud_servicio(id_mesa));

CREATE OR REPLACE FUNCTION public.personal_atender_reserva(p_id_reserva uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_staff_id uuid;
  v_mesa uuid;
  v_asignado uuid;
BEGIN
  IF NOT public.es_personal_activo() THEN RAISE EXCEPTION 'solo_personal'; END IF;

  SELECT p.id INTO v_staff_id FROM public.personal AS p WHERE p.id_usuario = auth.uid() AND p.activo = true LIMIT 1;
  IF v_staff_id IS NULL THEN RAISE EXCEPTION 'sin_personal'; END IF;

  PERFORM 1 FROM public.reservas_mesa AS rm WHERE rm.id = p_id_reserva FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no_encontrada'; END IF;

  IF (SELECT rm.ciclo FROM public.reservas_mesa AS rm WHERE rm.id = p_id_reserva) IS DISTINCT FROM 'activa' THEN
    RAISE EXCEPTION 'no_activa';
  END IF;
  IF (SELECT rm.comensal_llego FROM public.reservas_mesa AS rm WHERE rm.id = p_id_reserva) IS NOT NULL THEN
    RAISE EXCEPTION 'ya_atendida';
  END IF;

  v_mesa := (SELECT rm.id_mesa FROM public.reservas_mesa AS rm WHERE rm.id = p_id_reserva);

  IF (SELECT m.estado FROM public.mesas AS m WHERE m.id = v_mesa) IS DISTINCT FROM 'reservada' THEN
    RAISE EXCEPTION 'mesa_no_reservada';
  END IF;

  SELECT m.id_personal_atendiendo INTO v_asignado FROM public.mesas AS m WHERE m.id = v_mesa;
  IF v_asignado IS NOT NULL AND v_asignado IS DISTINCT FROM v_staff_id THEN
    RAISE EXCEPTION 'mesa_asignada_otro_mesero';
  END IF;

  EXECUTE 'UPDATE public.mesas AS t SET id_personal_atendiendo = $1, actualizado_en = now() WHERE t.id = $2'
  USING v_staff_id, v_mesa;
END;
$function$;

CREATE OR REPLACE FUNCTION public.personal_atender_reserva_completa(p_id_reserva uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_staff_id uuid;
  v_mesa uuid;
  v_asignado uuid;
BEGIN
  IF NOT public.es_personal_activo() THEN RAISE EXCEPTION 'solo_personal'; END IF;

  SELECT p.id INTO v_staff_id FROM public.personal AS p WHERE p.id_usuario = auth.uid() AND p.activo = true LIMIT 1;
  IF v_staff_id IS NULL THEN RAISE EXCEPTION 'sin_personal'; END IF;

  PERFORM 1 FROM public.reservas_mesa AS rm WHERE rm.id = p_id_reserva FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no_encontrada'; END IF;

  IF (SELECT rm.ciclo FROM public.reservas_mesa AS rm WHERE rm.id = p_id_reserva) IS DISTINCT FROM 'activa' THEN
    RAISE EXCEPTION 'no_activa';
  END IF;
  IF (SELECT rm.comensal_llego FROM public.reservas_mesa AS rm WHERE rm.id = p_id_reserva) IS NOT NULL THEN
    RAISE EXCEPTION 'ya_atendida';
  END IF;

  v_mesa := (SELECT rm.id_mesa FROM public.reservas_mesa AS rm WHERE rm.id = p_id_reserva);

  IF (SELECT m.estado FROM public.mesas AS m WHERE m.id = v_mesa) IS DISTINCT FROM 'reservada' THEN
    RAISE EXCEPTION 'mesa_no_reservada';
  END IF;

  SELECT m.id_personal_atendiendo INTO v_asignado FROM public.mesas AS m WHERE m.id = v_mesa;
  IF v_asignado IS NOT NULL AND v_asignado IS DISTINCT FROM v_staff_id THEN
    RAISE EXCEPTION 'mesa_asignada_otro_mesero';
  END IF;

  UPDATE public.reservas_mesa
  SET comensal_llego = true, ciclo = 'completada'
  WHERE id = p_id_reserva;

  EXECUTE
    'UPDATE public.mesas AS t SET estado = ''ocupada''::public.estado_mesa, id_personal_atendiendo = $1, actualizado_en = now() WHERE t.id = $2'
  USING v_staff_id, v_mesa;
END;
$function$;

CREATE OR REPLACE FUNCTION public.personal_marcar_mesa_libre_ocupada(p_id_mesa uuid, p_ocupar boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_staff_id uuid;
  v_estado public.estado_mesa;
  v_asignado uuid;
BEGIN
  IF NOT public.es_personal_activo() THEN RAISE EXCEPTION 'solo_personal'; END IF;

  SELECT p.id INTO v_staff_id FROM public.personal AS p WHERE p.id_usuario = auth.uid() AND p.activo = true LIMIT 1;
  IF v_staff_id IS NULL THEN RAISE EXCEPTION 'sin_personal'; END IF;

  PERFORM 1 FROM public.mesas AS m WHERE m.id = p_id_mesa FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no_encontrada'; END IF;

  SELECT m.estado, m.id_personal_atendiendo
  INTO v_estado, v_asignado
  FROM public.mesas AS m WHERE m.id = p_id_mesa;

  IF v_estado = 'reservada' THEN
    RAISE EXCEPTION 'mesa_en_reserva_panel';
  END IF;

  IF p_ocupar THEN
    IF v_estado IS DISTINCT FROM 'libre' THEN
      RAISE EXCEPTION 'solo_libre_a_ocupada';
    END IF;
    EXECUTE
      'UPDATE public.mesas AS t SET estado = ''ocupada''::public.estado_mesa, id_personal_atendiendo = $1, actualizado_en = now() WHERE t.id = $2'
    USING v_staff_id, p_id_mesa;
  ELSE
    IF v_estado IS DISTINCT FROM 'ocupada' THEN
      RAISE EXCEPTION 'solo_ocupada_a_libre_toggle';
    END IF;
    IF v_asignado IS NOT NULL AND v_asignado IS DISTINCT FROM v_staff_id THEN
      RAISE EXCEPTION 'no_tu_mesa_toggle';
    END IF;
    UPDATE public.mesas AS t
    SET estado = 'libre',
        actualizado_en = now()
    WHERE t.id = p_id_mesa;
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.personal_atender_reserva_completa(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.personal_marcar_mesa_libre_ocupada(uuid, boolean) TO authenticated;
