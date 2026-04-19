-- Habilita Supabase Realtime en tablas usadas por la app (mesero, cocina, gerente, comensal).
-- Ejecutar una vez en SQL Editor si el proyecto ya existía sin estos pasos.
-- En proyectos nuevos también está incluido al final de 01_reconstruir_db.sql.

DO $block$
DECLARE
  t text;
  tables text[] := ARRAY[
    'mesas',
    'fila_espera',
    'solicitudes_servicio',
    'reservas_mesa',
    'pedidos_cocina',
    'items_menu',
    'personal'
  ];
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
$block$;
