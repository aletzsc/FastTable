-- =============================================================================
-- FastTable — Inventario / recetas / stock (ejecutar en SQL Editor después de 01 y 04)
-- Añade tablas, RLS, RPC gerente, reemplaza crear_pedido_cocina (descuenta stock),
-- columna items_menu.sin_stock, sincronización de carta, seed de ingredientes y recetas.
-- =============================================================================

BEGIN;

ALTER TABLE public.items_menu
  ADD COLUMN IF NOT EXISTS sin_stock boolean NOT NULL DEFAULT false;

DO $enum$
BEGIN
  CREATE TYPE public.tipo_movimiento_almacen AS ENUM ('entrada', 'salida_pedido', 'ajuste');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$enum$;

CREATE TABLE IF NOT EXISTS public.ingredientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  cantidad_disponible numeric(14, 4) NOT NULL DEFAULT 0 CHECK (cantidad_disponible >= 0),
  unidad_medida text NOT NULL,
  stock_minimo numeric(14, 4) NULL CHECK (stock_minimo IS NULL OR stock_minimo >= 0),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ingredientes_nombre ON public.ingredientes (lower(nombre));

CREATE TABLE IF NOT EXISTS public.recetas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_item_menu uuid NOT NULL UNIQUE REFERENCES public.items_menu (id) ON DELETE CASCADE,
  notas text,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recetas_item ON public.recetas (id_item_menu);

CREATE TABLE IF NOT EXISTS public.receta_ingredientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_receta uuid NOT NULL REFERENCES public.recetas (id) ON DELETE CASCADE,
  id_ingrediente uuid NOT NULL REFERENCES public.ingredientes (id) ON DELETE RESTRICT,
  cantidad_por_plato numeric(14, 4) NOT NULL CHECK (cantidad_por_plato > 0),
  creado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id_receta, id_ingrediente)
);

CREATE INDEX IF NOT EXISTS idx_receta_ing_receta ON public.receta_ingredientes (id_receta);
CREATE INDEX IF NOT EXISTS idx_receta_ing_ing ON public.receta_ingredientes (id_ingrediente);

CREATE TABLE IF NOT EXISTS public.movimientos_almacen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_ingrediente uuid NOT NULL REFERENCES public.ingredientes (id) ON DELETE CASCADE,
  tipo public.tipo_movimiento_almacen NOT NULL,
  delta_cantidad numeric(14, 4) NOT NULL CHECK (delta_cantidad <> 0),
  id_pedido_cocina uuid NULL REFERENCES public.pedidos_cocina (id) ON DELETE SET NULL,
  nota text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_delta_sign CHECK (
    (tipo = 'entrada' AND delta_cantidad > 0)
    OR (tipo = 'salida_pedido' AND delta_cantidad < 0)
    OR (tipo = 'ajuste')
  )
);

CREATE INDEX IF NOT EXISTS idx_mov_almacen_ing ON public.movimientos_almacen (id_ingrediente, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_mov_almacen_pedido ON public.movimientos_almacen (id_pedido_cocina);

CREATE OR REPLACE FUNCTION public.tr_ingredientes_actualizado()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.actualizado_en := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tr_ingredientes_actualizado ON public.ingredientes;
CREATE TRIGGER tr_ingredientes_actualizado
  BEFORE UPDATE ON public.ingredientes
  FOR EACH ROW
  EXECUTE FUNCTION public.tr_ingredientes_actualizado();

CREATE OR REPLACE FUNCTION public.es_gerente()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.personal p
    WHERE p.id_usuario = auth.uid() AND p.activo = true AND p.rol = 'gerente'::public.rol_personal
  );
$function$;

CREATE OR REPLACE FUNCTION public.refresh_items_menu_sin_stock_flags()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  UPDATE public.items_menu im
  SET sin_stock = false,
      actualizado_en = now()
  WHERE NOT EXISTS (SELECT 1 FROM public.recetas r WHERE r.id_item_menu = im.id);

  UPDATE public.items_menu im
  SET sin_stock = EXISTS (
    SELECT 1
    FROM public.recetas r
    INNER JOIN public.receta_ingredientes ri ON ri.id_receta = r.id
    INNER JOIN public.ingredientes ing ON ing.id = ri.id_ingrediente
    WHERE r.id_item_menu = im.id
      AND ing.cantidad_disponible < ri.cantidad_por_plato
  ),
  actualizado_en = now()
  WHERE EXISTS (SELECT 1 FROM public.recetas r WHERE r.id_item_menu = im.id);
END;
$function$;

ALTER TABLE public.ingredientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recetas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receta_ingredientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos_almacen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ingredientes_select_staff ON public.ingredientes;
CREATE POLICY ingredientes_select_staff ON public.ingredientes FOR SELECT TO authenticated
  USING (public.es_cocina_o_gerente());

DROP POLICY IF EXISTS ingredientes_write_gerente ON public.ingredientes;
CREATE POLICY ingredientes_write_gerente ON public.ingredientes FOR ALL TO authenticated
  USING (public.es_gerente()) WITH CHECK (public.es_gerente());

DROP POLICY IF EXISTS recetas_select_staff ON public.recetas;
CREATE POLICY recetas_select_staff ON public.recetas FOR SELECT TO authenticated
  USING (public.es_cocina_o_gerente());

DROP POLICY IF EXISTS recetas_write_gerente ON public.recetas;
CREATE POLICY recetas_write_gerente ON public.recetas FOR ALL TO authenticated
  USING (public.es_gerente()) WITH CHECK (public.es_gerente());

DROP POLICY IF EXISTS receta_ing_select_staff ON public.receta_ingredientes;
CREATE POLICY receta_ing_select_staff ON public.receta_ingredientes FOR SELECT TO authenticated
  USING (public.es_cocina_o_gerente());

DROP POLICY IF EXISTS receta_ing_write_gerente ON public.receta_ingredientes;
CREATE POLICY receta_ing_write_gerente ON public.receta_ingredientes FOR ALL TO authenticated
  USING (public.es_gerente()) WITH CHECK (public.es_gerente());

DROP POLICY IF EXISTS mov_almacen_select_gerente ON public.movimientos_almacen;
CREATE POLICY mov_almacen_select_gerente ON public.movimientos_almacen FOR SELECT TO authenticated
  USING (public.es_gerente());

DROP POLICY IF EXISTS mov_almacen_no_direct_insert ON public.movimientos_almacen;
DROP POLICY IF EXISTS mov_almacen_no_direct_update ON public.movimientos_almacen;
DROP POLICY IF EXISTS mov_almacen_no_direct_delete ON public.movimientos_almacen;
CREATE POLICY mov_almacen_no_direct_insert ON public.movimientos_almacen FOR INSERT TO authenticated
  WITH CHECK (false);
CREATE POLICY mov_almacen_no_direct_update ON public.movimientos_almacen FOR UPDATE TO authenticated
  USING (false);
CREATE POLICY mov_almacen_no_direct_delete ON public.movimientos_almacen FOR DELETE TO authenticated
  USING (false);

CREATE OR REPLACE FUNCTION public.gerente_almacen_entrada(
  p_id_ingrediente uuid,
  p_cantidad numeric,
  p_nota text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NOT public.es_gerente() THEN
    RAISE EXCEPTION 'solo_gerente';
  END IF;
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'cantidad_invalida_almacen';
  END IF;

  PERFORM 1 FROM public.ingredientes i WHERE i.id = p_id_ingrediente FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ingrediente_no_encontrado';
  END IF;

  UPDATE public.ingredientes i
  SET cantidad_disponible = i.cantidad_disponible + p_cantidad
  WHERE i.id = p_id_ingrediente;

  INSERT INTO public.movimientos_almacen (id_ingrediente, tipo, delta_cantidad, nota)
  VALUES (p_id_ingrediente, 'entrada'::public.tipo_movimiento_almacen, p_cantidad, NULLIF(trim(COALESCE(p_nota, '')), ''));

  PERFORM public.refresh_items_menu_sin_stock_flags();
END;
$function$;

CREATE OR REPLACE FUNCTION public.gerente_almacen_ajuste(
  p_id_ingrediente uuid,
  p_nueva_cantidad numeric,
  p_nota text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_actual numeric;
  v_delta numeric;
BEGIN
  IF NOT public.es_gerente() THEN
    RAISE EXCEPTION 'solo_gerente';
  END IF;
  IF p_nueva_cantidad IS NULL OR p_nueva_cantidad < 0 THEN
    RAISE EXCEPTION 'cantidad_negativa';
  END IF;

  SELECT i.cantidad_disponible INTO v_actual
  FROM public.ingredientes i
  WHERE i.id = p_id_ingrediente
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ingrediente_no_encontrado';
  END IF;

  v_delta := p_nueva_cantidad - v_actual;
  IF v_delta = 0 THEN
    RETURN;
  END IF;

  UPDATE public.ingredientes i
  SET cantidad_disponible = p_nueva_cantidad
  WHERE i.id = p_id_ingrediente;

  INSERT INTO public.movimientos_almacen (id_ingrediente, tipo, delta_cantidad, nota)
  VALUES (
    p_id_ingrediente,
    'ajuste'::public.tipo_movimiento_almacen,
    v_delta,
    NULLIF(trim(COALESCE(p_nota, '')), '')
  );

  PERFORM public.refresh_items_menu_sin_stock_flags();
END;
$function$;

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
  v_sin boolean;
  v_id uuid;
  v_id_receta uuid;
  r RECORD;
  v_need numeric;
  v_errors text[] := ARRAY[]::text[];
  v_err text;
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

  SELECT r.id INTO v_id_receta FROM public.recetas r WHERE r.id_item_menu = p_id_item LIMIT 1;

  IF v_id_receta IS NULL THEN
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
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.receta_ingredientes ri WHERE ri.id_receta = v_id_receta) THEN
    RAISE EXCEPTION 'item_sin_receta';
  END IF;

  FOR r IN
    SELECT ri.id_ingrediente, ri.cantidad_por_plato, i.nombre, i.cantidad_disponible, i.unidad_medida
    FROM public.receta_ingredientes ri
    INNER JOIN public.ingredientes i ON i.id = ri.id_ingrediente
    WHERE ri.id_receta = v_id_receta
    FOR UPDATE OF i
  LOOP
    v_need := r.cantidad_por_plato * p_cantidad::numeric;
    IF r.cantidad_disponible < v_need THEN
      v_errors := array_append(
        v_errors,
        format(
          '%s: necesita %s %s, hay %s',
          r.nombre,
          trim(to_char(v_need, 'FM9999999999990.9999')),
          r.unidad_medida,
          trim(to_char(r.cantidad_disponible, 'FM9999999999990.9999'))
        )
      );
    END IF;
  END LOOP;

  IF cardinality(v_errors) > 0 THEN
    v_err := array_to_string(v_errors, ' · ');
    RAISE EXCEPTION 'inventario_insuficiente: %', v_err;
  END IF;

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

  FOR r IN
    SELECT ri.id_ingrediente, ri.cantidad_por_plato
    FROM public.receta_ingredientes ri
    WHERE ri.id_receta = v_id_receta
  LOOP
    v_need := r.cantidad_por_plato * p_cantidad::numeric;
    UPDATE public.ingredientes i
    SET cantidad_disponible = i.cantidad_disponible - v_need
    WHERE i.id = r.id_ingrediente;

    INSERT INTO public.movimientos_almacen (id_ingrediente, tipo, delta_cantidad, id_pedido_cocina, nota)
    VALUES (
      r.id_ingrediente,
      'salida_pedido'::public.tipo_movimiento_almacen,
      -v_need,
      v_id,
      'Consumo por pedido cocina'
    );
  END LOOP;

  PERFORM public.refresh_items_menu_sin_stock_flags();
  RETURN v_id;
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

  PERFORM public.refresh_items_menu_sin_stock_flags();
END;
$function$;

CREATE OR REPLACE FUNCTION public.gerente_dashboard_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  r json;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.personal p
    WHERE p.id_usuario = auth.uid() AND p.activo = true AND p.rol = 'gerente'::public.rol_personal
  ) THEN
    RAISE EXCEPTION 'solo_gerente';
  END IF;

  SELECT json_build_object(
    'total_centavos', (
      SELECT COALESCE(SUM(pc.cantidad * im.precio_centavos), 0)::bigint
      FROM public.pedidos_cocina pc
      INNER JOIN public.items_menu im ON im.id = pc.id_item_menu
    ),
    'plato_top', (
      SELECT json_build_object('nombre', sq.nombre, 'unidades', sq.u)
      FROM (
        SELECT im.nombre, SUM(pc.cantidad)::bigint AS u
        FROM public.pedidos_cocina pc
        INNER JOIN public.items_menu im ON im.id = pc.id_item_menu
        GROUP BY im.id, im.nombre
        ORDER BY u DESC NULLS LAST
        LIMIT 1
      ) sq
    ),
    'equipo', (
      SELECT COALESCE(
        json_agg(json_build_object('nombre', nombre_visible, 'rol', rol::text) ORDER BY rol::text, nombre_visible),
        '[]'::json
      )
      FROM public.personal
      WHERE activo = true
    ),
    'no_disponibles', (
      SELECT COALESCE(
        json_agg(json_build_object('nombre', nombre) ORDER BY nombre),
        '[]'::json
      )
      FROM public.items_menu
      WHERE disponible = false OR COALESCE(sin_stock, false) = true
    )
  ) INTO r;

  RETURN r;
END;
$function$;

REVOKE ALL ON FUNCTION public.refresh_items_menu_sin_stock_flags() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gerente_almacen_entrada(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gerente_almacen_ajuste(uuid, numeric, text) TO authenticated;

DO $realtime$
DECLARE
  t text;
  tables text[] := ARRAY['ingredientes', 'recetas', 'receta_ingredientes', 'movimientos_almacen'];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END
$realtime$;

-- ---------- Seed ingredientes ----------
INSERT INTO public.ingredientes (nombre, unidad_medida, cantidad_disponible, stock_minimo)
SELECT 'Pan hamburguesa', 'piezas', 80, 20 WHERE NOT EXISTS (SELECT 1 FROM public.ingredientes i WHERE i.nombre = 'Pan hamburguesa');
INSERT INTO public.ingredientes (nombre, unidad_medida, cantidad_disponible, stock_minimo)
SELECT 'Carne de hamburguesa', 'g', 5000, 800 WHERE NOT EXISTS (SELECT 1 FROM public.ingredientes i WHERE i.nombre = 'Carne de hamburguesa');
INSERT INTO public.ingredientes (nombre, unidad_medida, cantidad_disponible, stock_minimo)
SELECT 'Queso cheddar', 'piezas', 200, 40 WHERE NOT EXISTS (SELECT 1 FROM public.ingredientes i WHERE i.nombre = 'Queso cheddar');
INSERT INTO public.ingredientes (nombre, unidad_medida, cantidad_disponible, stock_minimo)
SELECT 'Bacon', 'g', 3000, 400 WHERE NOT EXISTS (SELECT 1 FROM public.ingredientes i WHERE i.nombre = 'Bacon');
INSERT INTO public.ingredientes (nombre, unidad_medida, cantidad_disponible, stock_minimo)
SELECT 'Bechamel', 'ml', 4000, 600 WHERE NOT EXISTS (SELECT 1 FROM public.ingredientes i WHERE i.nombre = 'Bechamel');
INSERT INTO public.ingredientes (nombre, unidad_medida, cantidad_disponible, stock_minimo)
SELECT 'Jamón serrano', 'g', 2500, 300 WHERE NOT EXISTS (SELECT 1 FROM public.ingredientes i WHERE i.nombre = 'Jamón serrano');
INSERT INTO public.ingredientes (nombre, unidad_medida, cantidad_disponible, stock_minimo)
SELECT 'Pan rallado', 'g', 1500, 200 WHERE NOT EXISTS (SELECT 1 FROM public.ingredientes i WHERE i.nombre = 'Pan rallado');
INSERT INTO public.ingredientes (nombre, unidad_medida, cantidad_disponible, stock_minimo)
SELECT 'Costilla de cerdo', 'g', 8000, 1200 WHERE NOT EXISTS (SELECT 1 FROM public.ingredientes i WHERE i.nombre = 'Costilla de cerdo');
INSERT INTO public.ingredientes (nombre, unidad_medida, cantidad_disponible, stock_minimo)
SELECT 'Salsa BBQ', 'ml', 6000, 800 WHERE NOT EXISTS (SELECT 1 FROM public.ingredientes i WHERE i.nombre = 'Salsa BBQ');
INSERT INTO public.ingredientes (nombre, unidad_medida, cantidad_disponible, stock_minimo)
SELECT 'Papas', 'g', 12000, 2000 WHERE NOT EXISTS (SELECT 1 FROM public.ingredientes i WHERE i.nombre = 'Papas');
INSERT INTO public.ingredientes (nombre, unidad_medida, cantidad_disponible, stock_minimo)
SELECT 'Mascarpone', 'g', 4000, 500 WHERE NOT EXISTS (SELECT 1 FROM public.ingredientes i WHERE i.nombre = 'Mascarpone');
INSERT INTO public.ingredientes (nombre, unidad_medida, cantidad_disponible, stock_minimo)
SELECT 'Café espresso', 'ml', 8000, 1000 WHERE NOT EXISTS (SELECT 1 FROM public.ingredientes i WHERE i.nombre = 'Café espresso');
INSERT INTO public.ingredientes (nombre, unidad_medida, cantidad_disponible, stock_minimo)
SELECT 'Bizcocho savoiardi', 'piezas', 300, 40 WHERE NOT EXISTS (SELECT 1 FROM public.ingredientes i WHERE i.nombre = 'Bizcocho savoiardi');
INSERT INTO public.ingredientes (nombre, unidad_medida, cantidad_disponible, stock_minimo)
SELECT 'Cacao en polvo', 'g', 2000, 200 WHERE NOT EXISTS (SELECT 1 FROM public.ingredientes i WHERE i.nombre = 'Cacao en polvo');
INSERT INTO public.ingredientes (nombre, unidad_medida, cantidad_disponible, stock_minimo)
SELECT 'Limón', 'piezas', 120, 24 WHERE NOT EXISTS (SELECT 1 FROM public.ingredientes i WHERE i.nombre = 'Limón');
INSERT INTO public.ingredientes (nombre, unidad_medida, cantidad_disponible, stock_minimo)
SELECT 'Hierbabuena fresca', 'g', 800, 100 WHERE NOT EXISTS (SELECT 1 FROM public.ingredientes i WHERE i.nombre = 'Hierbabuena fresca');
INSERT INTO public.ingredientes (nombre, unidad_medida, cantidad_disponible, stock_minimo)
SELECT 'Agua filtrada', 'ml', 50000, 5000 WHERE NOT EXISTS (SELECT 1 FROM public.ingredientes i WHERE i.nombre = 'Agua filtrada');
INSERT INTO public.ingredientes (nombre, unidad_medida, cantidad_disponible, stock_minimo)
SELECT 'Azúcar', 'g', 10000, 1000 WHERE NOT EXISTS (SELECT 1 FROM public.ingredientes i WHERE i.nombre = 'Azúcar');
INSERT INTO public.ingredientes (nombre, unidad_medida, cantidad_disponible, stock_minimo)
SELECT 'Hielo', 'g', 20000, 2000 WHERE NOT EXISTS (SELECT 1 FROM public.ingredientes i WHERE i.nombre = 'Hielo');
INSERT INTO public.ingredientes (nombre, unidad_medida, cantidad_disponible, stock_minimo)
SELECT 'Burrata', 'piezas', 40, 6 WHERE NOT EXISTS (SELECT 1 FROM public.ingredientes i WHERE i.nombre = 'Burrata');
INSERT INTO public.ingredientes (nombre, unidad_medida, cantidad_disponible, stock_minimo)
SELECT 'Tomate', 'g', 8000, 1000 WHERE NOT EXISTS (SELECT 1 FROM public.ingredientes i WHERE i.nombre = 'Tomate');
INSERT INTO public.ingredientes (nombre, unidad_medida, cantidad_disponible, stock_minimo)
SELECT 'Albahaca', 'g', 300, 40 WHERE NOT EXISTS (SELECT 1 FROM public.ingredientes i WHERE i.nombre = 'Albahaca');
INSERT INTO public.ingredientes (nombre, unidad_medida, cantidad_disponible, stock_minimo)
SELECT 'Atún fresco', 'g', 5000, 600 WHERE NOT EXISTS (SELECT 1 FROM public.ingredientes i WHERE i.nombre = 'Atún fresco');
INSERT INTO public.ingredientes (nombre, unidad_medida, cantidad_disponible, stock_minimo)
SELECT 'Aguacate', 'g', 4000, 500 WHERE NOT EXISTS (SELECT 1 FROM public.ingredientes i WHERE i.nombre = 'Aguacate');
INSERT INTO public.ingredientes (nombre, unidad_medida, cantidad_disponible, stock_minimo)
SELECT 'Arroz arborio', 'g', 6000, 800 WHERE NOT EXISTS (SELECT 1 FROM public.ingredientes i WHERE i.nombre = 'Arroz arborio');
INSERT INTO public.ingredientes (nombre, unidad_medida, cantidad_disponible, stock_minimo)
SELECT 'Hongos', 'g', 5000, 600 WHERE NOT EXISTS (SELECT 1 FROM public.ingredientes i WHERE i.nombre = 'Hongos');
INSERT INTO public.ingredientes (nombre, unidad_medida, cantidad_disponible, stock_minimo)
SELECT 'Parmesano', 'g', 3500, 400 WHERE NOT EXISTS (SELECT 1 FROM public.ingredientes i WHERE i.nombre = 'Parmesano');
INSERT INTO public.ingredientes (nombre, unidad_medida, cantidad_disponible, stock_minimo)
SELECT 'Pescado blanco', 'g', 6000, 800 WHERE NOT EXISTS (SELECT 1 FROM public.ingredientes i WHERE i.nombre = 'Pescado blanco');
INSERT INTO public.ingredientes (nombre, unidad_medida, cantidad_disponible, stock_minimo)
SELECT 'Verduras de temporada', 'g', 7000, 900 WHERE NOT EXISTS (SELECT 1 FROM public.ingredientes i WHERE i.nombre = 'Verduras de temporada');
INSERT INTO public.ingredientes (nombre, unidad_medida, cantidad_disponible, stock_minimo)
SELECT 'Agua embotellada', 'ml', 30000, 4000 WHERE NOT EXISTS (SELECT 1 FROM public.ingredientes i WHERE i.nombre = 'Agua embotellada');
INSERT INTO public.ingredientes (nombre, unidad_medida, cantidad_disponible, stock_minimo)
SELECT 'Malta cervecera', 'ml', 20000, 3000 WHERE NOT EXISTS (SELECT 1 FROM public.ingredientes i WHERE i.nombre = 'Malta cervecera');
INSERT INTO public.ingredientes (nombre, unidad_medida, cantidad_disponible, stock_minimo)
SELECT 'Lata refresco', 'piezas', 200, 24 WHERE NOT EXISTS (SELECT 1 FROM public.ingredientes i WHERE i.nombre = 'Lata refresco');
INSERT INTO public.ingredientes (nombre, unidad_medida, cantidad_disponible, stock_minimo)
SELECT 'Chocolate postres', 'g', 5000, 600 WHERE NOT EXISTS (SELECT 1 FROM public.ingredientes i WHERE i.nombre = 'Chocolate postres');
INSERT INTO public.ingredientes (nombre, unidad_medida, cantidad_disponible, stock_minimo)
SELECT 'Helado vainilla', 'g', 8000, 1000 WHERE NOT EXISTS (SELECT 1 FROM public.ingredientes i WHERE i.nombre = 'Helado vainilla');
INSERT INTO public.ingredientes (nombre, unidad_medida, cantidad_disponible, stock_minimo)
SELECT 'Huevos', 'piezas', 200, 30 WHERE NOT EXISTS (SELECT 1 FROM public.ingredientes i WHERE i.nombre = 'Huevos');
INSERT INTO public.ingredientes (nombre, unidad_medida, cantidad_disponible, stock_minimo)
SELECT 'Leche', 'ml', 20000, 2500 WHERE NOT EXISTS (SELECT 1 FROM public.ingredientes i WHERE i.nombre = 'Leche');
INSERT INTO public.ingredientes (nombre, unidad_medida, cantidad_disponible, stock_minimo)
SELECT 'Caramelo', 'ml', 2000, 200 WHERE NOT EXISTS (SELECT 1 FROM public.ingredientes i WHERE i.nombre = 'Caramelo');

INSERT INTO public.recetas (id_item_menu, notas)
SELECT im.id, 'Receta FastTable'
FROM public.items_menu im
WHERE NOT EXISTS (SELECT 1 FROM public.recetas r WHERE r.id_item_menu = im.id);

INSERT INTO public.receta_ingredientes (id_receta, id_ingrediente, cantidad_por_plato)
SELECT r.id, i.id, v.cant
FROM public.recetas r
JOIN public.items_menu im ON im.id = r.id_item_menu AND im.nombre = 'Burger clásica'
CROSS JOIN (VALUES
  ('Pan hamburguesa', 1::numeric),
  ('Carne de hamburguesa', 150::numeric),
  ('Queso cheddar', 1::numeric),
  ('Bacon', 30::numeric)
) AS v(nombre, cant)
JOIN public.ingredientes i ON i.nombre = v.nombre
WHERE NOT EXISTS (SELECT 1 FROM public.receta_ingredientes ri2 WHERE ri2.id_receta = r.id AND ri2.id_ingrediente = i.id);

INSERT INTO public.receta_ingredientes (id_receta, id_ingrediente, cantidad_por_plato)
SELECT r.id, i.id, v.cant
FROM public.recetas r
JOIN public.items_menu im ON im.id = r.id_item_menu AND im.nombre = 'Croquetas de jamón'
CROSS JOIN (VALUES
  ('Bechamel', 40::numeric),
  ('Jamón serrano', 35::numeric),
  ('Pan rallado', 15::numeric)
) AS v(nombre, cant)
JOIN public.ingredientes i ON i.nombre = v.nombre
WHERE NOT EXISTS (SELECT 1 FROM public.receta_ingredientes ri2 WHERE ri2.id_receta = r.id AND ri2.id_ingrediente = i.id);

INSERT INTO public.receta_ingredientes (id_receta, id_ingrediente, cantidad_por_plato)
SELECT r.id, i.id, v.cant
FROM public.recetas r
JOIN public.items_menu im ON im.id = r.id_item_menu AND im.nombre = 'Costillas BBQ'
CROSS JOIN (VALUES
  ('Costilla de cerdo', 420::numeric),
  ('Salsa BBQ', 80::numeric),
  ('Papas', 180::numeric)
) AS v(nombre, cant)
JOIN public.ingredientes i ON i.nombre = v.nombre
WHERE NOT EXISTS (SELECT 1 FROM public.receta_ingredientes ri2 WHERE ri2.id_receta = r.id AND ri2.id_ingrediente = i.id);

INSERT INTO public.receta_ingredientes (id_receta, id_ingrediente, cantidad_por_plato)
SELECT r.id, i.id, v.cant
FROM public.recetas r
JOIN public.items_menu im ON im.id = r.id_item_menu AND im.nombre = 'Tiramisú'
CROSS JOIN (VALUES
  ('Mascarpone', 70::numeric),
  ('Café espresso', 25::numeric),
  ('Bizcocho savoiardi', 3::numeric),
  ('Cacao en polvo', 8::numeric)
) AS v(nombre, cant)
JOIN public.ingredientes i ON i.nombre = v.nombre
WHERE NOT EXISTS (SELECT 1 FROM public.receta_ingredientes ri2 WHERE ri2.id_receta = r.id AND ri2.id_ingrediente = i.id);

INSERT INTO public.receta_ingredientes (id_receta, id_ingrediente, cantidad_por_plato)
SELECT r.id, i.id, v.cant
FROM public.recetas r
JOIN public.items_menu im ON im.id = r.id_item_menu AND im.nombre = 'Limonada de hierbabuena'
CROSS JOIN (VALUES
  ('Limón', 2::numeric),
  ('Hierbabuena fresca', 12::numeric),
  ('Agua filtrada', 900::numeric),
  ('Azúcar', 40::numeric),
  ('Hielo', 120::numeric)
) AS v(nombre, cant)
JOIN public.ingredientes i ON i.nombre = v.nombre
WHERE NOT EXISTS (SELECT 1 FROM public.receta_ingredientes ri2 WHERE ri2.id_receta = r.id AND ri2.id_ingrediente = i.id);

INSERT INTO public.receta_ingredientes (id_receta, id_ingrediente, cantidad_por_plato)
SELECT r.id, i.id, v.cant
FROM public.recetas r
JOIN public.items_menu im ON im.id = r.id_item_menu AND im.nombre = 'Ensalada de burrata'
CROSS JOIN (VALUES
  ('Burrata', 1::numeric),
  ('Tomate', 120::numeric),
  ('Albahaca', 4::numeric)
) AS v(nombre, cant)
JOIN public.ingredientes i ON i.nombre = v.nombre
WHERE NOT EXISTS (SELECT 1 FROM public.receta_ingredientes ri2 WHERE ri2.id_receta = r.id AND ri2.id_ingrediente = i.id);

INSERT INTO public.receta_ingredientes (id_receta, id_ingrediente, cantidad_por_plato)
SELECT r.id, i.id, v.cant
FROM public.recetas r
JOIN public.items_menu im ON im.id = r.id_item_menu AND im.nombre = 'Tartar de atún'
CROSS JOIN (VALUES
  ('Atún fresco', 140::numeric),
  ('Aguacate', 40::numeric),
  ('Limón', 0.5::numeric)
) AS v(nombre, cant)
JOIN public.ingredientes i ON i.nombre = v.nombre
WHERE NOT EXISTS (SELECT 1 FROM public.receta_ingredientes ri2 WHERE ri2.id_receta = r.id AND ri2.id_ingrediente = i.id);

INSERT INTO public.receta_ingredientes (id_receta, id_ingrediente, cantidad_por_plato)
SELECT r.id, i.id, v.cant
FROM public.recetas r
JOIN public.items_menu im ON im.id = r.id_item_menu AND im.nombre = 'Risotto de hongos'
CROSS JOIN (VALUES
  ('Arroz arborio', 90::numeric),
  ('Hongos', 80::numeric),
  ('Parmesano', 15::numeric)
) AS v(nombre, cant)
JOIN public.ingredientes i ON i.nombre = v.nombre
WHERE NOT EXISTS (SELECT 1 FROM public.receta_ingredientes ri2 WHERE ri2.id_receta = r.id AND ri2.id_ingrediente = i.id);

INSERT INTO public.receta_ingredientes (id_receta, id_ingrediente, cantidad_por_plato)
SELECT r.id, i.id, v.cant
FROM public.recetas r
JOIN public.items_menu im ON im.id = r.id_item_menu AND im.nombre = 'Pescado del día'
CROSS JOIN (VALUES
  ('Pescado blanco', 200::numeric),
  ('Verduras de temporada', 100::numeric)
) AS v(nombre, cant)
JOIN public.ingredientes i ON i.nombre = v.nombre
WHERE NOT EXISTS (SELECT 1 FROM public.receta_ingredientes ri2 WHERE ri2.id_receta = r.id AND ri2.id_ingrediente = i.id);

INSERT INTO public.receta_ingredientes (id_receta, id_ingrediente, cantidad_por_plato)
SELECT r.id, i.id, v.cant
FROM public.recetas r
JOIN public.items_menu im ON im.id = r.id_item_menu AND im.nombre = 'Agua mineral'
CROSS JOIN (VALUES
  ('Agua embotellada', 750::numeric)
) AS v(nombre, cant)
JOIN public.ingredientes i ON i.nombre = v.nombre
WHERE NOT EXISTS (SELECT 1 FROM public.receta_ingredientes ri2 WHERE ri2.id_receta = r.id AND ri2.id_ingrediente = i.id);

INSERT INTO public.receta_ingredientes (id_receta, id_ingrediente, cantidad_por_plato)
SELECT r.id, i.id, v.cant
FROM public.recetas r
JOIN public.items_menu im ON im.id = r.id_item_menu AND im.nombre = 'Cerveza artesanal'
CROSS JOIN (VALUES
  ('Malta cervecera', 473::numeric)
) AS v(nombre, cant)
JOIN public.ingredientes i ON i.nombre = v.nombre
WHERE NOT EXISTS (SELECT 1 FROM public.receta_ingredientes ri2 WHERE ri2.id_receta = r.id AND ri2.id_ingrediente = i.id);

INSERT INTO public.receta_ingredientes (id_receta, id_ingrediente, cantidad_por_plato)
SELECT r.id, i.id, v.cant
FROM public.recetas r
JOIN public.items_menu im ON im.id = r.id_item_menu AND im.nombre = 'Refresco'
CROSS JOIN (VALUES
  ('Lata refresco', 1::numeric)
) AS v(nombre, cant)
JOIN public.ingredientes i ON i.nombre = v.nombre
WHERE NOT EXISTS (SELECT 1 FROM public.receta_ingredientes ri2 WHERE ri2.id_receta = r.id AND ri2.id_ingrediente = i.id);

INSERT INTO public.receta_ingredientes (id_receta, id_ingrediente, cantidad_por_plato)
SELECT r.id, i.id, v.cant
FROM public.recetas r
JOIN public.items_menu im ON im.id = r.id_item_menu AND im.nombre = 'Brownie con helado'
CROSS JOIN (VALUES
  ('Chocolate postres', 55::numeric),
  ('Helado vainilla', 70::numeric)
) AS v(nombre, cant)
JOIN public.ingredientes i ON i.nombre = v.nombre
WHERE NOT EXISTS (SELECT 1 FROM public.receta_ingredientes ri2 WHERE ri2.id_receta = r.id AND ri2.id_ingrediente = i.id);

INSERT INTO public.receta_ingredientes (id_receta, id_ingrediente, cantidad_por_plato)
SELECT r.id, i.id, v.cant
FROM public.recetas r
JOIN public.items_menu im ON im.id = r.id_item_menu AND im.nombre = 'Flan de la casa'
CROSS JOIN (VALUES
  ('Huevos', 2::numeric),
  ('Leche', 120::numeric),
  ('Azúcar', 25::numeric),
  ('Caramelo', 15::numeric)
) AS v(nombre, cant)
JOIN public.ingredientes i ON i.nombre = v.nombre
WHERE NOT EXISTS (SELECT 1 FROM public.receta_ingredientes ri2 WHERE ri2.id_receta = r.id AND ri2.id_ingrediente = i.id);

INSERT INTO public.receta_ingredientes (id_receta, id_ingrediente, cantidad_por_plato)
SELECT r.id, ing.id, 1::numeric
FROM public.recetas r
JOIN public.items_menu im ON im.id = r.id_item_menu
JOIN public.ingredientes ing ON ing.nombre = 'Agua embotellada'
WHERE NOT EXISTS (SELECT 1 FROM public.receta_ingredientes x WHERE x.id_receta = r.id)
  AND im.nombre NOT IN (
    'Burger clásica', 'Croquetas de jamón', 'Costillas BBQ', 'Tiramisú', 'Limonada de hierbabuena',
    'Ensalada de burrata', 'Tartar de atún', 'Risotto de hongos', 'Pescado del día', 'Agua mineral',
    'Cerveza artesanal', 'Refresco', 'Brownie con helado', 'Flan de la casa'
  );

SELECT public.refresh_items_menu_sin_stock_flags();

COMMIT;
