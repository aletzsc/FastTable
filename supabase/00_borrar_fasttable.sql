-- =============================================================================
-- BORRADO COMPLETO de objetos FastTable en el esquema public.
-- No borra auth.users ni tablas del sistema de Supabase.
-- Ejecuta UNA VEZ en SQL Editor, luego 01_reconstruir_db.sql
-- =============================================================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS tr_auth_alta_perfil ON auth.users;

DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.perfiles_tras_alta_usuario() CASCADE;
DROP FUNCTION IF EXISTS public.set_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.actualizar_marca_tiempo() CASCADE;
DROP FUNCTION IF EXISTS public.tr_reservas_mesa_calcular_atencion() CASCADE;
DROP FUNCTION IF EXISTS public.is_staff() CASCADE;
DROP FUNCTION IF EXISTS public.es_personal_activo() CASCADE;
DROP FUNCTION IF EXISTS public.table_reservations_set_waiter_due() CASCADE;
DROP FUNCTION IF EXISTS public.tr_reservas_mesa_set_atencion() CASCADE;
DROP FUNCTION IF EXISTS public.create_table_reservation(uuid, timestamptz, int, text) CASCADE;
DROP FUNCTION IF EXISTS public.cancel_table_reservation(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.waiter_resolve_reservation(uuid, boolean) CASCADE;
DROP FUNCTION IF EXISTS public.crear_reserva_mesa(uuid, timestamptz, int, text) CASCADE;
DROP FUNCTION IF EXISTS public.cancelar_reserva_mesa(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.personal_resolver_reserva(uuid, boolean) CASCADE;
DROP FUNCTION IF EXISTS public.personal_atender_reserva(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.personal_desasignar_mesa(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.personal_liberar_mesa_atendida(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.tr_mesas_al_liberar_mesero() CASCADE;

-- Tablas (nombres en inglés antiguos + español)
DROP TABLE IF EXISTS public.eventos_auditoria CASCADE;
DROP TABLE IF EXISTS public.solicitudes_servicio CASCADE;
DROP TABLE IF EXISTS public.items_menu CASCADE;
DROP TABLE IF EXISTS public.categorias_menu CASCADE;
DROP TABLE IF EXISTS public.menu_items CASCADE;
DROP TABLE IF EXISTS public.menu_categories CASCADE;
DROP TABLE IF EXISTS public.fila_espera CASCADE;
DROP TABLE IF EXISTS public.queue_entries CASCADE;
DROP TABLE IF EXISTS public.reservas_mesa CASCADE;
DROP TABLE IF EXISTS public.table_reservations CASCADE;
DROP TABLE IF EXISTS public.mesas CASCADE;
DROP TABLE IF EXISTS public.dining_tables CASCADE;
DROP TABLE IF EXISTS public.zonas CASCADE;
DROP TABLE IF EXISTS public.zones CASCADE;
DROP TABLE IF EXISTS public.personal CASCADE;
DROP TABLE IF EXISTS public.staff_members CASCADE;
DROP TABLE IF EXISTS public.perfiles CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- Tipos enumerados
DROP TYPE IF EXISTS public.ciclo_reserva CASCADE;
DROP TYPE IF EXISTS public.estado_solicitud CASCADE;
DROP TYPE IF EXISTS public.estado_fila CASCADE;
DROP TYPE IF EXISTS public.estado_mesa CASCADE;
DROP TYPE IF EXISTS public.rol_personal CASCADE;
DROP TYPE IF EXISTS public.reservation_lifecycle CASCADE;
DROP TYPE IF EXISTS public.service_request_status CASCADE;
DROP TYPE IF EXISTS public.queue_status CASCADE;
DROP TYPE IF EXISTS public.table_status CASCADE;
DROP TYPE IF EXISTS public.staff_role CASCADE;
