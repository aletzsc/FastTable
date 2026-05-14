-- =============================================================================
-- FastTable — Sesión comensal: cuenta por visita + mesa libre solo sin comensales
-- Ejecutar en Supabase SQL Editor en proyectos YA desplegados (después de 01).
-- Si usas inventario, vuelve a ejecutar 05_inventario.sql después (idempotente).
-- =============================================================================

BEGIN;

ALTER TABLE public.pedidos_cocina
  ADD COLUMN IF NOT EXISTS id_reserva_mesa uuid REFERENCES public.reservas_mesa (id) ON DELETE SET NULL;
ALTER TABLE public.pedidos_cocina
  ADD COLUMN IF NOT EXISTS id_fila_espera uuid REFERENCES public.fila_espera (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pedidos_cocina_reserva ON public.pedidos_cocina (id_reserva_mesa) WHERE id_reserva_mesa IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pedidos_cocina_fila ON public.pedidos_cocina (id_fila_espera) WHERE id_fila_espera IS NOT NULL;

DO $chk$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_pedido_origen_sesion'
      AND conrelid = 'public.pedidos_cocina'::regclass
  ) THEN
    ALTER TABLE public.pedidos_cocina
      ADD CONSTRAINT chk_pedido_origen_sesion CHECK (
        NOT (id_reserva_mesa IS NOT NULL AND id_fila_espera IS NOT NULL)
      );
  END IF;
END
$chk$;

CREATE OR REPLACE FUNCTION public.comensal_terminar_servicio()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_mesa uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'no_autenticado';
  END IF;

  SELECT rm.id_mesa INTO v_mesa
  FROM public.reservas_mesa rm
  INNER JOIN public.mesas m ON m.id = rm.id_mesa
  WHERE rm.id_usuario = v_uid
    AND rm.ciclo = 'completada'
    AND rm.comensal_llego IS TRUE
    AND m.estado = 'ocupada'
  ORDER BY rm.creado_en DESC
  LIMIT 1;

  IF v_mesa IS NULL THEN
    SELECT f.id_mesa_asignada INTO v_mesa
    FROM public.fila_espera f
    INNER JOIN public.mesas m ON m.id = f.id_mesa_asignada
    WHERE f.id_usuario = v_uid
      AND f.estado = 'sentado'
      AND f.id_mesa_asignada IS NOT NULL
      AND m.estado = 'ocupada'
    ORDER BY f.sentado_en DESC NULLS LAST, f.unido_en DESC
    LIMIT 1;
  END IF;

  IF v_mesa IS NULL THEN
    RAISE EXCEPTION 'sin_mesa_activa_para_terminar';
  END IF;

  UPDATE public.fila_espera
  SET estado = 'cancelado',
      cancelado_en = now()
  WHERE id_usuario = v_uid
    AND id_mesa_asignada = v_mesa
    AND estado = 'sentado';

  UPDATE public.reservas_mesa
  SET comensal_llego = false
  WHERE id_usuario = v_uid
    AND id_mesa = v_mesa
    AND ciclo = 'completada'
    AND comensal_llego IS TRUE;

  IF NOT EXISTS (
    SELECT 1
    FROM public.fila_espera f
    WHERE f.id_mesa_asignada = v_mesa
      AND f.estado = 'sentado'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.reservas_mesa rm
    INNER JOIN public.mesas m ON m.id = rm.id_mesa
    WHERE rm.id_mesa = v_mesa
      AND rm.ciclo = 'completada'
      AND rm.comensal_llego IS TRUE
      AND m.estado = 'ocupada'
  ) THEN
    UPDATE public.mesas
    SET estado = 'libre',
        id_personal_atendiendo = NULL,
        actualizado_en = now()
    WHERE id = v_mesa;
  END IF;
END;
$function$;

-- Pedidos con ancla de sesión (sin lógica de inventario; si usas 05, este bloque lo reemplaza al volver a correr 05).
CREATE OR REPLACE FUNCTION public.crear_pedido_cocina(p_id_item uuid, p_cantidad int, p_nota text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_mesa uuid;
  v_id_reserva uuid;
  v_id_fila uuid;
  v_disp boolean;
  v_sin boolean;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'no_autenticado'; END IF;
  IF p_cantidad IS NULL OR p_cantidad < 1 OR p_cantidad > 99 THEN RAISE EXCEPTION 'cantidad_invalida'; END IF;

  v_id_reserva := NULL;
  v_id_fila := NULL;
  v_mesa := NULL;

  SELECT rm.id_mesa, rm.id INTO v_mesa, v_id_reserva
  FROM public.reservas_mesa rm
  INNER JOIN public.mesas m ON m.id = rm.id_mesa
  WHERE rm.id_usuario = v_uid
    AND rm.ciclo = 'completada'
    AND rm.comensal_llego IS TRUE
    AND m.estado = 'ocupada'
  ORDER BY rm.creado_en DESC
  LIMIT 1;

  IF v_mesa IS NULL THEN
    SELECT f.id_mesa_asignada, f.id INTO v_mesa, v_id_fila
    FROM public.fila_espera f
    INNER JOIN public.mesas m ON m.id = f.id_mesa_asignada
    WHERE f.id_usuario = v_uid
      AND f.estado = 'sentado'
      AND f.id_mesa_asignada IS NOT NULL
      AND m.estado = 'ocupada'
    ORDER BY f.sentado_en DESC NULLS LAST, f.unido_en DESC
    LIMIT 1;
  END IF;

  IF v_mesa IS NULL THEN
    RAISE EXCEPTION 'sin_mesa_para_pedidos';
  END IF;

  SELECT im.disponible, COALESCE(im.sin_stock, false)
  INTO v_disp, v_sin
  FROM public.items_menu im
  WHERE im.id = p_id_item
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'item_no_encontrado'; END IF;
  IF v_disp IS NOT TRUE THEN RAISE EXCEPTION 'item_no_disponible'; END IF;
  IF v_sin IS TRUE THEN RAISE EXCEPTION 'item_sin_stock'; END IF;

  INSERT INTO public.pedidos_cocina (
    id_mesa,
    id_usuario,
    id_item_menu,
    id_reserva_mesa,
    id_fila_espera,
    cantidad,
    nota_cliente,
    estado
  )
  VALUES (
    v_mesa,
    v_uid,
    p_id_item,
    v_id_reserva,
    v_id_fila,
    p_cantidad,
    NULLIF(trim(COALESCE(p_nota, '')), ''),
    'pendiente'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

COMMIT;
