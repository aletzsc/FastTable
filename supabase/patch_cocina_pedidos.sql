-- Parche: pedidos a cocina, disponibilidad de platos, notificación al mesero al marcar "listo".
-- Ejecutar en SQL Editor (RLS activado). Tras aplicar, reinicia la app.

DO $t$
BEGIN
  CREATE TYPE public.estado_pedido_cocina AS ENUM ('pendiente', 'listo');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$t$;

ALTER TABLE public.items_menu
  ADD COLUMN IF NOT EXISTS imagen_url TEXT;

UPDATE public.items_menu
SET imagen_url = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&q=80'
WHERE imagen_url IS NULL;

CREATE TABLE IF NOT EXISTS public.pedidos_cocina (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_mesa UUID NOT NULL REFERENCES public.mesas (id) ON DELETE CASCADE,
  id_usuario UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  id_item_menu UUID NOT NULL REFERENCES public.items_menu (id) ON DELETE CASCADE,
  cantidad INT NOT NULL CHECK (cantidad >= 1 AND cantidad <= 99),
  nota_cliente TEXT,
  estado public.estado_pedido_cocina NOT NULL DEFAULT 'pendiente',
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  listo_en TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pedidos_cocina_estado ON public.pedidos_cocina (estado, creado_en);
CREATE INDEX IF NOT EXISTS idx_pedidos_cocina_mesa ON public.pedidos_cocina (id_mesa);

ALTER TABLE public.pedidos_cocina ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pedidos_cocina_select ON public.pedidos_cocina;
DROP POLICY IF EXISTS pedidos_cocina_insert_rpc_only ON public.pedidos_cocina;

CREATE OR REPLACE FUNCTION public.es_cocina_o_gerente()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.personal p
    WHERE p.id_usuario = auth.uid() AND p.activo = true
    AND p.rol IN ('cocina'::public.rol_personal, 'gerente'::public.rol_personal)
  );
$function$;

CREATE POLICY pedidos_cocina_select ON public.pedidos_cocina FOR SELECT TO authenticated
  USING (id_usuario = auth.uid() OR public.es_cocina_o_gerente());

CREATE POLICY pedidos_cocina_insert_rpc_only ON public.pedidos_cocina FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.crear_pedido_cocina(p_id_item uuid, p_cantidad int, p_nota text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_mesa uuid;
  v_disp boolean;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'no_autenticado'; END IF;
  IF p_cantidad IS NULL OR p_cantidad < 1 OR p_cantidad > 99 THEN RAISE EXCEPTION 'cantidad_invalida'; END IF;

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
    RAISE EXCEPTION 'sin_mesa_para_pedidos';
  END IF;

  SELECT im.disponible INTO v_disp FROM public.items_menu im WHERE im.id = p_id_item FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'item_no_encontrado'; END IF;
  IF v_disp IS NOT TRUE THEN RAISE EXCEPTION 'item_no_disponible'; END IF;

  INSERT INTO public.pedidos_cocina (id_mesa, id_usuario, id_item_menu, cantidad, nota_cliente, estado)
  VALUES (
    v_mesa,
    v_uid,
    p_id_item,
    p_cantidad,
    NULLIF(trim(COALESCE(p_nota, '')), ''),
    'pendiente'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.marcar_pedido_listo_cocina(p_id_pedido uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_mesa uuid;
  v_codigo text;
  v_cant int;
  v_nombre text;
  v_msg text;
BEGIN
  IF NOT public.es_cocina_o_gerente() THEN RAISE EXCEPTION 'solo_cocina'; END IF;

  PERFORM 1 FROM public.pedidos_cocina pc WHERE pc.id = p_id_pedido FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'pedido_no_encontrado'; END IF;

  IF (SELECT pc.estado FROM public.pedidos_cocina pc WHERE pc.id = p_id_pedido) IS DISTINCT FROM 'pendiente' THEN
    RAISE EXCEPTION 'pedido_ya_procesado';
  END IF;

  SELECT pc.id_mesa, pc.cantidad, im.nombre
  INTO v_mesa, v_cant, v_nombre
  FROM public.pedidos_cocina pc
  INNER JOIN public.items_menu im ON im.id = pc.id_item_menu
  WHERE pc.id = p_id_pedido;

  SELECT m.codigo INTO v_codigo FROM public.mesas m WHERE m.id = v_mesa;

  UPDATE public.pedidos_cocina pc
  SET estado = 'listo', listo_en = now()
  WHERE pc.id = p_id_pedido;

  v_msg := 'Llevar ' || v_cant::text || '× ' || v_nombre || ' a mesa ' || COALESCE(v_codigo, '?');

  INSERT INTO public.solicitudes_servicio (id_mesa, id_usuario, mensaje, estado)
  VALUES (v_mesa, NULL, v_msg, 'abierta');
END;
$function$;

CREATE OR REPLACE FUNCTION public.cocina_set_item_disponible(p_id_item uuid, p_disponible boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NOT public.es_cocina_o_gerente() THEN RAISE EXCEPTION 'solo_cocina'; END IF;

  PERFORM 1 FROM public.items_menu im WHERE im.id = p_id_item FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'item_no_encontrado'; END IF;

  UPDATE public.items_menu im
  SET disponible = p_disponible, actualizado_en = now()
  WHERE im.id = p_id_item;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.crear_pedido_cocina(uuid, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_pedido_listo_cocina(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cocina_set_item_disponible(uuid, boolean) TO authenticated;
