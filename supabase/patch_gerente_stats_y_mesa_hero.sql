-- Parche incremental: columnas públicas de mesa + RPC panel gerente.
-- Ejecutar en SQL Editor si ya tienes la BD sin reconstruir desde cero.

ALTER TABLE public.mesas ADD COLUMN IF NOT EXISTS descripcion_publica TEXT;
ALTER TABLE public.mesas ADD COLUMN IF NOT EXISTS imagen_url TEXT;

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
      WHERE disponible = false
    )
  ) INTO r;

  RETURN r;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.gerente_dashboard_stats() TO authenticated;
