-- FastTable: corregir posicion de fila para comensales bajo RLS
-- Ejecutar en Supabase SQL Editor con rol administrador.

CREATE OR REPLACE FUNCTION public.comensal_mi_posicion_fila()
RETURNS TABLE(entry_id uuid, queue_position int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'no_autenticado';
  END IF;

  RETURN QUERY
  WITH mine AS (
    SELECT f.id, f.unido_en
    FROM public.fila_espera f
    WHERE f.id_usuario = v_user_id
      AND f.estado = 'esperando'::public.estado_fila
    ORDER BY f.unido_en ASC
    LIMIT 1
  )
  SELECT
    m.id AS entry_id,
    (
      SELECT COUNT(*)::int
      FROM public.fila_espera f2
      WHERE f2.estado = 'esperando'::public.estado_fila
        AND (
          f2.unido_en < m.unido_en
          OR (f2.unido_en = m.unido_en AND f2.id <= m.id)
        )
    ) AS queue_position
  FROM mine m;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.comensal_mi_posicion_fila() TO authenticated;
