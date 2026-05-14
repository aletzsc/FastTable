-- =============================================================================
-- FastTable — Migración incremental: reservas por día + RPC calendario salón
-- Ejecutar en Supabase → SQL Editor → Run (proyecto YA con esquema FastTable).
-- No borra tablas ni datos. Reemplaza solo las funciones listadas + crea RPC.
-- Zona de "día de servicio": America/Mexico_City (misma que app lib/plan-day-ymd.ts).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.crear_reserva_mesa(
  p_id_mesa uuid,
  p_fecha_hora timestamptz,
  p_personas_grupo int,
  p_nota text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'no_autenticado'; END IF;
  IF p_personas_grupo IS NULL OR p_personas_grupo < 1 THEN RAISE EXCEPTION 'grupo_invalido'; END IF;
  IF p_personas_grupo > (SELECT m.capacidad FROM public.mesas m WHERE m.id = p_id_mesa) THEN
    RAISE EXCEPTION 'grupo_excede_capacidad_mesa';
  END IF;
  IF p_fecha_hora <= now() THEN RAISE EXCEPTION 'debe_ser_futuro'; END IF;

  PERFORM 1 FROM public.mesas WHERE id = p_id_mesa FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'mesa_no_encontrada'; END IF;
  IF (SELECT estado FROM public.mesas WHERE id = p_id_mesa) = 'ocupada'::public.estado_mesa THEN
    RAISE EXCEPTION 'mesa_no_disponible';
  END IF;

  -- Maximo una reserva activa por mesa y dia de servicio (zona restaurante).
  IF EXISTS (
    SELECT 1
    FROM public.reservas_mesa r
    WHERE r.id_mesa = p_id_mesa
      AND r.ciclo = 'activa'
      AND (r.fecha_hora_reserva AT TIME ZONE 'America/Mexico_City')::date
        = (p_fecha_hora AT TIME ZONE 'America/Mexico_City')::date
  ) THEN
    RAISE EXCEPTION 'mesa_ya_reservada';
  END IF;
  IF EXISTS (SELECT 1 FROM public.reservas_mesa WHERE id_usuario = v_uid AND ciclo = 'activa') THEN
    RAISE EXCEPTION 'usuario_ya_tiene_reserva';
  END IF;

  INSERT INTO public.reservas_mesa (id_usuario, id_mesa, fecha_hora_reserva, personas_grupo, nota)
  VALUES (v_uid, p_id_mesa, p_fecha_hora, p_personas_grupo, NULLIF(trim(p_nota), ''))
  RETURNING id INTO v_id;

  UPDATE public.mesas AS t
  SET estado = (
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.reservas_mesa r
        WHERE r.id_mesa = p_id_mesa
          AND r.ciclo = 'activa'
          AND (r.fecha_hora_reserva AT TIME ZONE 'America/Mexico_City')::date
            <= (now() AT TIME ZONE 'America/Mexico_City')::date
      ) THEN 'reservada'::public.estado_mesa
      ELSE 'libre'::public.estado_mesa
    END
  ),
  actualizado_en = now()
  WHERE t.id = p_id_mesa;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancelar_reserva_mesa(p_id_reserva uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  id_mesa_cancel uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'no_autenticado'; END IF;

  PERFORM 1 FROM public.reservas_mesa WHERE id = p_id_reserva FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no_encontrada'; END IF;

  IF (SELECT id_usuario FROM public.reservas_mesa WHERE id = p_id_reserva) IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'no_permitido';
  END IF;
  IF (SELECT ciclo FROM public.reservas_mesa WHERE id = p_id_reserva) IS DISTINCT FROM 'activa' THEN
    RAISE EXCEPTION 'no_activa';
  END IF;

  id_mesa_cancel := (SELECT id_mesa FROM public.reservas_mesa WHERE id = p_id_reserva);

  UPDATE public.reservas_mesa SET ciclo = 'cancelada' WHERE id = p_id_reserva;

  UPDATE public.mesas AS t
  SET estado = (
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.reservas_mesa r
        WHERE r.id_mesa = id_mesa_cancel
          AND r.ciclo = 'activa'
          AND (r.fecha_hora_reserva AT TIME ZONE 'America/Mexico_City')::date
            <= (now() AT TIME ZONE 'America/Mexico_City')::date
      ) THEN 'reservada'::public.estado_mesa
      ELSE 'libre'::public.estado_mesa
    END
  ),
  actualizado_en = now()
  WHERE t.id = id_mesa_cancel;
END;
$function$;

CREATE OR REPLACE FUNCTION public.personal_resolver_reserva(p_id_reserva uuid, p_comensal_llego boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  id_mesa_accion uuid;
  v_staff_rol public.rol_personal;
BEGIN
  IF NOT public.es_personal_activo() THEN RAISE EXCEPTION 'solo_personal'; END IF;
  SELECT p.rol INTO v_staff_rol
  FROM public.personal AS p
  WHERE p.id_usuario = auth.uid() AND p.activo = true
  LIMIT 1;
  IF v_staff_rol IS DISTINCT FROM 'anfitrion'::public.rol_personal
     AND v_staff_rol IS DISTINCT FROM 'gerente'::public.rol_personal THEN
    RAISE EXCEPTION 'solo_anfitrion_gerente';
  END IF;

  PERFORM 1 FROM public.reservas_mesa WHERE id = p_id_reserva FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no_encontrada'; END IF;

  IF (SELECT ciclo FROM public.reservas_mesa WHERE id = p_id_reserva) IS DISTINCT FROM 'activa' THEN
    RAISE EXCEPTION 'no_activa';
  END IF;
  IF (SELECT comensal_llego FROM public.reservas_mesa WHERE id = p_id_reserva) IS NOT NULL THEN
    RAISE EXCEPTION 'ya_atendida';
  END IF;

  id_mesa_accion := (SELECT id_mesa FROM public.reservas_mesa WHERE id = p_id_reserva);

  UPDATE public.reservas_mesa
  SET comensal_llego = p_comensal_llego, ciclo = 'completada'
  WHERE id = p_id_reserva;

  IF p_comensal_llego THEN
    UPDATE public.mesas SET estado = 'ocupada', actualizado_en = now() WHERE id = id_mesa_accion;
  ELSE
    UPDATE public.mesas AS t
    SET estado = (
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM public.reservas_mesa r
          WHERE r.id_mesa = id_mesa_accion
            AND r.ciclo = 'activa'
            AND (r.fecha_hora_reserva AT TIME ZONE 'America/Mexico_City')::date
              <= (now() AT TIME ZONE 'America/Mexico_City')::date
        ) THEN 'reservada'::public.estado_mesa
        ELSE 'libre'::public.estado_mesa
      END
    ),
    actualizado_en = now()
    WHERE t.id = id_mesa_accion;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.personal_atender_reserva(p_id_reserva uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_staff_id uuid;
  v_staff_rol public.rol_personal;
  v_mesa uuid;
  v_asignado uuid;
  v_estado_mesa public.estado_mesa;
BEGIN
  IF NOT public.es_personal_activo() THEN RAISE EXCEPTION 'solo_personal'; END IF;

  SELECT p.id, p.rol INTO v_staff_id, v_staff_rol FROM public.personal AS p WHERE p.id_usuario = auth.uid() AND p.activo = true LIMIT 1;
  IF v_staff_id IS NULL THEN RAISE EXCEPTION 'sin_personal'; END IF;
  IF v_staff_rol IS DISTINCT FROM 'anfitrion'::public.rol_personal
     AND v_staff_rol IS DISTINCT FROM 'gerente'::public.rol_personal THEN
    RAISE EXCEPTION 'solo_anfitrion_gerente';
  END IF;

  PERFORM 1 FROM public.reservas_mesa AS rm WHERE rm.id = p_id_reserva FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no_encontrada'; END IF;

  IF (SELECT rm.ciclo FROM public.reservas_mesa AS rm WHERE rm.id = p_id_reserva) IS DISTINCT FROM 'activa' THEN
    RAISE EXCEPTION 'no_activa';
  END IF;
  IF (SELECT rm.comensal_llego FROM public.reservas_mesa AS rm WHERE rm.id = p_id_reserva) IS NOT NULL THEN
    RAISE EXCEPTION 'ya_atendida';
  END IF;

  v_mesa := (SELECT rm.id_mesa FROM public.reservas_mesa AS rm WHERE rm.id = p_id_reserva);

  SELECT m.estado INTO v_estado_mesa FROM public.mesas AS m WHERE m.id = v_mesa;
  IF v_estado_mesa = 'ocupada'::public.estado_mesa THEN
    RAISE EXCEPTION 'mesa_ocupada';
  END IF;
  IF v_estado_mesa NOT IN ('reservada'::public.estado_mesa, 'libre'::public.estado_mesa) THEN
    RAISE EXCEPTION 'mesa_no_reservada';
  END IF;
  IF v_estado_mesa = 'libre'::public.estado_mesa THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.reservas_mesa rm
      WHERE rm.id = p_id_reserva AND rm.id_mesa = v_mesa AND rm.ciclo = 'activa'
    ) THEN
      RAISE EXCEPTION 'mesa_no_reservada';
    END IF;
  END IF;

  SELECT m.id_personal_atendiendo INTO v_asignado FROM public.mesas AS m WHERE m.id = v_mesa;
  IF v_asignado IS NOT NULL AND v_asignado <> v_staff_id THEN
    RAISE EXCEPTION 'mesa_asignada_otro_mesero';
  END IF;

  EXECUTE 'UPDATE public.mesas AS t SET id_personal_atendiendo = $1, actualizado_en = now() WHERE t.id = $2'
  USING v_staff_id, v_mesa;
END;
$function$;

CREATE OR REPLACE FUNCTION public.personal_desasignar_mesa(p_id_mesa uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_staff_id uuid;
  v_asignado uuid;
  v_estado public.estado_mesa;
BEGIN
  IF NOT public.es_personal_activo() THEN RAISE EXCEPTION 'solo_personal'; END IF;
  SELECT p.id INTO v_staff_id FROM public.personal AS p WHERE p.id_usuario = auth.uid() AND p.activo = true LIMIT 1;
  IF v_staff_id IS NULL THEN RAISE EXCEPTION 'sin_personal'; END IF;

  PERFORM 1 FROM public.mesas AS m WHERE m.id = p_id_mesa FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no_encontrada'; END IF;

  SELECT m.id_personal_atendiendo, m.estado INTO v_asignado, v_estado FROM public.mesas AS m WHERE m.id = p_id_mesa;
  IF v_asignado IS NULL OR v_asignado <> v_staff_id THEN
    RAISE EXCEPTION 'no_tu_mesa';
  END IF;
  IF v_estado NOT IN ('reservada'::public.estado_mesa, 'libre'::public.estado_mesa) THEN
    RAISE EXCEPTION 'solo_reservada_desasignar';
  END IF;

  UPDATE public.mesas AS t
  SET id_personal_atendiendo = NULL, actualizado_en = now()
  WHERE t.id = p_id_mesa;
END;
$function$;

CREATE OR REPLACE FUNCTION public.personal_liberar_mesa_atendida(p_id_mesa uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_staff_id uuid;
  v_asignado uuid;
BEGIN
  IF NOT public.es_personal_activo() THEN RAISE EXCEPTION 'solo_personal'; END IF;
  SELECT p.id INTO v_staff_id FROM public.personal AS p WHERE p.id_usuario = auth.uid() AND p.activo = true LIMIT 1;
  IF v_staff_id IS NULL THEN RAISE EXCEPTION 'sin_personal'; END IF;

  PERFORM 1 FROM public.mesas AS m WHERE m.id = p_id_mesa FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no_encontrada'; END IF;

  SELECT m.id_personal_atendiendo INTO v_asignado FROM public.mesas AS m WHERE m.id = p_id_mesa;
  IF v_asignado IS NULL OR v_asignado <> v_staff_id THEN
    RAISE EXCEPTION 'no_tu_mesa';
  END IF;
  IF (SELECT m.estado FROM public.mesas AS m WHERE m.id = p_id_mesa) IS DISTINCT FROM 'ocupada' THEN
    RAISE EXCEPTION 'solo_ocupada_liberar';
  END IF;

  UPDATE public.mesas AS t
  SET estado = 'libre', actualizado_en = now()
  WHERE t.id = p_id_mesa;

  UPDATE public.fila_espera AS f
  SET estado = 'cancelado',
      cancelado_en = now()
  WHERE f.id_mesa_asignada = p_id_mesa
    AND f.estado = 'sentado';
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
  v_staff_rol public.rol_personal;
  v_mesa uuid;
  v_asignado uuid;
  v_estado_mesa public.estado_mesa;
BEGIN
  IF NOT public.es_personal_activo() THEN RAISE EXCEPTION 'solo_personal'; END IF;

  SELECT p.id, p.rol INTO v_staff_id, v_staff_rol FROM public.personal AS p WHERE p.id_usuario = auth.uid() AND p.activo = true LIMIT 1;
  IF v_staff_id IS NULL THEN RAISE EXCEPTION 'sin_personal'; END IF;
  IF v_staff_rol IS DISTINCT FROM 'anfitrion'::public.rol_personal
     AND v_staff_rol IS DISTINCT FROM 'gerente'::public.rol_personal THEN
    RAISE EXCEPTION 'solo_anfitrion_gerente';
  END IF;

  PERFORM 1 FROM public.reservas_mesa AS rm WHERE rm.id = p_id_reserva FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no_encontrada'; END IF;

  IF (SELECT rm.ciclo FROM public.reservas_mesa AS rm WHERE rm.id = p_id_reserva) IS DISTINCT FROM 'activa' THEN
    RAISE EXCEPTION 'no_activa';
  END IF;
  IF (SELECT rm.comensal_llego FROM public.reservas_mesa AS rm WHERE rm.id = p_id_reserva) IS NOT NULL THEN
    RAISE EXCEPTION 'ya_atendida';
  END IF;

  v_mesa := (SELECT rm.id_mesa FROM public.reservas_mesa AS rm WHERE rm.id = p_id_reserva);

  SELECT m.estado INTO v_estado_mesa FROM public.mesas AS m WHERE m.id = v_mesa;
  IF v_estado_mesa = 'ocupada'::public.estado_mesa THEN
    RAISE EXCEPTION 'mesa_ocupada';
  END IF;
  IF v_estado_mesa NOT IN ('reservada'::public.estado_mesa, 'libre'::public.estado_mesa) THEN
    RAISE EXCEPTION 'mesa_no_reservada';
  END IF;
  IF v_estado_mesa = 'libre'::public.estado_mesa THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.reservas_mesa rm
      WHERE rm.id = p_id_reserva AND rm.id_mesa = v_mesa AND rm.ciclo = 'activa'
    ) THEN
      RAISE EXCEPTION 'mesa_no_reservada';
    END IF;
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

CREATE OR REPLACE FUNCTION public.personal_atender_reserva_completa_asignando_mesero(
  p_id_reserva uuid,
  p_id_mesero uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_staff_id uuid;
  v_staff_rol public.rol_personal;
  v_mesa uuid;
  v_estado_mesa public.estado_mesa;
BEGIN
  IF NOT public.es_personal_activo() THEN RAISE EXCEPTION 'solo_personal'; END IF;

  SELECT p.id, p.rol INTO v_staff_id, v_staff_rol
  FROM public.personal AS p
  WHERE p.id_usuario = auth.uid() AND p.activo = true
  LIMIT 1;
  IF v_staff_id IS NULL THEN RAISE EXCEPTION 'sin_personal'; END IF;
  IF v_staff_rol IS DISTINCT FROM 'anfitrion'::public.rol_personal
     AND v_staff_rol IS DISTINCT FROM 'gerente'::public.rol_personal THEN
    RAISE EXCEPTION 'solo_anfitrion_gerente';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.personal p
    WHERE p.id = p_id_mesero
      AND p.rol = 'mesero'::public.rol_personal
      AND p.activo = true
  ) THEN
    RAISE EXCEPTION 'mesero_inactivo_o_inexistente';
  END IF;

  PERFORM 1 FROM public.reservas_mesa AS rm WHERE rm.id = p_id_reserva FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no_encontrada'; END IF;

  IF (SELECT rm.ciclo FROM public.reservas_mesa AS rm WHERE rm.id = p_id_reserva) IS DISTINCT FROM 'activa' THEN
    RAISE EXCEPTION 'no_activa';
  END IF;
  IF (SELECT rm.comensal_llego FROM public.reservas_mesa AS rm WHERE rm.id = p_id_reserva) IS NOT NULL THEN
    RAISE EXCEPTION 'ya_atendida';
  END IF;

  v_mesa := (SELECT rm.id_mesa FROM public.reservas_mesa AS rm WHERE rm.id = p_id_reserva);

  SELECT m.estado INTO v_estado_mesa FROM public.mesas AS m WHERE m.id = v_mesa;
  IF v_estado_mesa = 'ocupada'::public.estado_mesa THEN
    RAISE EXCEPTION 'mesa_ocupada';
  END IF;
  IF v_estado_mesa NOT IN ('reservada'::public.estado_mesa, 'libre'::public.estado_mesa) THEN
    RAISE EXCEPTION 'mesa_no_reservada';
  END IF;
  IF v_estado_mesa = 'libre'::public.estado_mesa THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.reservas_mesa rm
      WHERE rm.id = p_id_reserva AND rm.id_mesa = v_mesa AND rm.ciclo = 'activa'
    ) THEN
      RAISE EXCEPTION 'mesa_no_reservada';
    END IF;
  END IF;

  UPDATE public.reservas_mesa
  SET comensal_llego = true, ciclo = 'completada'
  WHERE id = p_id_reserva;

  UPDATE public.mesas AS t
  SET estado = 'ocupada',
      id_personal_atendiendo = p_id_mesero,
      actualizado_en = now()
  WHERE t.id = v_mesa;
END;
$function$;

-- Dia de servicio = fecha local en America/Mexico_City (ajustar si el restaurante usa otra zona).
CREATE OR REPLACE FUNCTION public.mesas_con_reserva_activa_en_dia_servicio(p_dia date)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT DISTINCT r.id_mesa
  FROM public.reservas_mesa r
  WHERE r.ciclo = 'activa'
    AND (r.fecha_hora_reserva AT TIME ZONE 'America/Mexico_City')::date = p_dia;
$function$;

REVOKE ALL ON FUNCTION public.mesas_con_reserva_activa_en_dia_servicio(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mesas_con_reserva_activa_en_dia_servicio(date) TO authenticated;
