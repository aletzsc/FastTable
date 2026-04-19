-- =============================================================================
-- FastTable — esquema completo en español (PostgreSQL / Supabase)
-- DB vacía de un solo golpe: montar_db_desde_cero.sql (ver EJECUCION.txt).
-- RPC de reservas sin SELECT * INTO r (evita 42P01 si el cliente parte el bloque plpgsql).
-- Delimitador de cuerpos: $function$ … $function$
-- Requiere Auth habilitado (auth.users).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Tipos enumerados
CREATE TYPE public.estado_mesa AS ENUM ('libre', 'ocupada', 'reservada');
CREATE TYPE public.estado_fila AS ENUM ('esperando', 'sentado', 'cancelado');
CREATE TYPE public.estado_solicitud AS ENUM ('abierta', 'reconocida', 'cerrada');
CREATE TYPE public.rol_personal AS ENUM ('anfitrion', 'mesero', 'gerente', 'cocina');
CREATE TYPE public.ciclo_reserva AS ENUM ('activa', 'cancelada', 'completada');

-- Perfiles (id = auth.users)
CREATE TABLE public.perfiles (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  nombre_completo TEXT,
  telefono TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.personal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_usuario UUID NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
  nombre_visible TEXT NOT NULL,
  rol public.rol_personal NOT NULL DEFAULT 'mesero',
  codigo_empleado TEXT UNIQUE,
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_personal_id_usuario ON public.personal (id_usuario);

CREATE TABLE public.zonas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  orden INT NOT NULL DEFAULT 0,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.mesas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  id_zona UUID REFERENCES public.zonas (id) ON DELETE SET NULL,
  capacidad INT NOT NULL CHECK (capacidad > 0),
  estado public.estado_mesa NOT NULL DEFAULT 'libre',
  notas TEXT,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mesas_zona ON public.mesas (id_zona);
CREATE INDEX idx_mesas_estado ON public.mesas (estado);

CREATE TABLE public.fila_espera (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_usuario UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  personas_grupo INT NOT NULL CHECK (personas_grupo > 0),
  estado public.estado_fila NOT NULL DEFAULT 'esperando',
  nota TEXT,
  minutos_espera_estimados INT,
  unido_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  sentado_en TIMESTAMPTZ,
  cancelado_en TIMESTAMPTZ,
  id_mesa_asignada UUID REFERENCES public.mesas (id) ON DELETE SET NULL
);

CREATE INDEX idx_fila_estado_unido ON public.fila_espera (estado, unido_en);
CREATE INDEX idx_fila_usuario ON public.fila_espera (id_usuario);

CREATE TABLE public.categorias_menu (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  orden INT NOT NULL DEFAULT 0,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.items_menu (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_categoria UUID NOT NULL REFERENCES public.categorias_menu (id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  precio_centavos INT NOT NULL CHECK (precio_centavos >= 0),
  disponible BOOLEAN NOT NULL DEFAULT true,
  alergenos_json JSONB,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_items_menu_categoria ON public.items_menu (id_categoria);

CREATE TABLE public.solicitudes_servicio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_mesa UUID REFERENCES public.mesas (id) ON DELETE SET NULL,
  id_usuario UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  mensaje TEXT,
  estado public.estado_solicitud NOT NULL DEFAULT 'abierta',
  id_personal_asignado UUID REFERENCES public.personal (id) ON DELETE SET NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_solicitudes_estado ON public.solicitudes_servicio (estado, creado_en);
CREATE INDEX idx_solicitudes_mesa ON public.solicitudes_servicio (id_mesa);

CREATE TABLE public.eventos_auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_entidad TEXT NOT NULL,
  id_entidad UUID NOT NULL,
  accion TEXT NOT NULL,
  payload JSONB,
  id_personal UUID REFERENCES public.personal (id) ON DELETE SET NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_auditoria_entidad ON public.eventos_auditoria (tipo_entidad, id_entidad);

CREATE TABLE public.reservas_mesa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_usuario UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  id_mesa UUID NOT NULL REFERENCES public.mesas (id) ON DELETE CASCADE,
  fecha_hora_reserva TIMESTAMPTZ NOT NULL,
  personas_grupo INT NOT NULL DEFAULT 2 CHECK (personas_grupo > 0),
  nota TEXT,
  ciclo public.ciclo_reserva NOT NULL DEFAULT 'activa',
  comensal_llego BOOLEAN,
  mesero_atender_a_partir_de TIMESTAMPTZ NOT NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reservas_usuario ON public.reservas_mesa (id_usuario);
CREATE INDEX idx_reservas_mesa ON public.reservas_mesa (id_mesa);
CREATE INDEX idx_reservas_cola ON public.reservas_mesa (ciclo, comensal_llego, mesero_atender_a_partir_de);

CREATE UNIQUE INDEX un_reserva_activa_por_usuario
  ON public.reservas_mesa (id_usuario)
  WHERE ciclo = 'activa';

CREATE OR REPLACE FUNCTION public.tr_reservas_mesa_calcular_atencion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.mesero_atender_a_partir_de := NEW.fecha_hora_reserva + INTERVAL '5 minutes';
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tr_reservas_mesa_atencion ON public.reservas_mesa;
CREATE TRIGGER tr_reservas_mesa_atencion
  BEFORE INSERT OR UPDATE OF fecha_hora_reserva ON public.reservas_mesa
  FOR EACH ROW
  EXECUTE FUNCTION public.tr_reservas_mesa_calcular_atencion();

-- updated_at genérico
CREATE OR REPLACE FUNCTION public.actualizar_marca_tiempo()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.actualizado_en := now();
  RETURN NEW;
END;
$function$;

CREATE TRIGGER tr_perfiles_actualizado BEFORE UPDATE ON public.perfiles
  FOR EACH ROW EXECUTE FUNCTION public.actualizar_marca_tiempo();
CREATE TRIGGER tr_personal_actualizado BEFORE UPDATE ON public.personal
  FOR EACH ROW EXECUTE FUNCTION public.actualizar_marca_tiempo();
CREATE TRIGGER tr_items_menu_actualizado BEFORE UPDATE ON public.items_menu
  FOR EACH ROW EXECUTE FUNCTION public.actualizar_marca_tiempo();
CREATE TRIGGER tr_mesas_actualizado BEFORE UPDATE ON public.mesas
  FOR EACH ROW EXECUTE FUNCTION public.actualizar_marca_tiempo();
CREATE TRIGGER tr_solicitudes_actualizado BEFORE UPDATE ON public.solicitudes_servicio
  FOR EACH ROW EXECUTE FUNCTION public.actualizar_marca_tiempo();

-- Alta de perfil al registrarse (metadata: nombre_completo o full_name)
CREATE OR REPLACE FUNCTION public.perfiles_tras_alta_usuario()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  INSERT INTO public.perfiles (id, nombre_completo)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nombre_completo', NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tr_auth_alta_perfil ON auth.users;
CREATE TRIGGER tr_auth_alta_perfil
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.perfiles_tras_alta_usuario();

CREATE OR REPLACE FUNCTION public.es_personal_activo()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.personal p
    WHERE p.id_usuario = auth.uid() AND p.activo = true
  );
$function$;

-- RLS
ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zonas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mesas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fila_espera ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorias_menu ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items_menu ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solicitudes_servicio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eventos_auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservas_mesa ENABLE ROW LEVEL SECURITY;

CREATE POLICY perfiles_select_propios ON public.perfiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY perfiles_update_propios ON public.perfiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY perfiles_select_personal ON public.perfiles FOR SELECT TO authenticated
  USING (public.es_personal_activo());

CREATE POLICY personal_select ON public.personal FOR SELECT TO authenticated
  USING (id_usuario = auth.uid() OR public.es_personal_activo());
CREATE POLICY personal_update_propios ON public.personal FOR UPDATE USING (id_usuario = auth.uid());

CREATE POLICY zonas_select ON public.zonas FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY mesas_select ON public.mesas FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY mesas_update_personal ON public.mesas FOR UPDATE TO authenticated
  USING (public.es_personal_activo());

CREATE POLICY fila_select ON public.fila_espera FOR SELECT
  USING (id_usuario = auth.uid() OR public.es_personal_activo());
CREATE POLICY fila_insert ON public.fila_espera FOR INSERT TO authenticated
  WITH CHECK (id_usuario IS NULL OR id_usuario = auth.uid());
CREATE POLICY fila_update_personal ON public.fila_espera FOR UPDATE TO authenticated
  USING (public.es_personal_activo());
CREATE POLICY fila_update_propio ON public.fila_espera FOR UPDATE TO authenticated
  USING (id_usuario = auth.uid()) WITH CHECK (id_usuario = auth.uid());

CREATE POLICY categorias_select ON public.categorias_menu FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY categorias_write_personal ON public.categorias_menu FOR ALL TO authenticated
  USING (public.es_personal_activo()) WITH CHECK (public.es_personal_activo());

CREATE POLICY items_select ON public.items_menu FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY items_write_personal ON public.items_menu FOR ALL TO authenticated
  USING (public.es_personal_activo()) WITH CHECK (public.es_personal_activo());

CREATE POLICY solicitudes_select ON public.solicitudes_servicio FOR SELECT
  USING (id_usuario = auth.uid() OR public.es_personal_activo());
CREATE POLICY solicitudes_insert ON public.solicitudes_servicio FOR INSERT TO authenticated
  WITH CHECK (id_usuario IS NULL OR id_usuario = auth.uid());
CREATE POLICY solicitudes_update_personal ON public.solicitudes_servicio FOR UPDATE TO authenticated
  USING (public.es_personal_activo());

CREATE POLICY auditoria_personal ON public.eventos_auditoria FOR ALL TO authenticated
  USING (public.es_personal_activo()) WITH CHECK (public.es_personal_activo());

CREATE POLICY reservas_select ON public.reservas_mesa FOR SELECT TO authenticated
  USING (id_usuario = auth.uid() OR public.es_personal_activo());

-- RPC reservas
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
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'no_autenticado'; END IF;
  IF p_personas_grupo IS NULL OR p_personas_grupo < 1 THEN RAISE EXCEPTION 'grupo_invalido'; END IF;
  IF p_fecha_hora <= now() THEN RAISE EXCEPTION 'debe_ser_futuro'; END IF;

  PERFORM 1 FROM public.mesas WHERE id = p_id_mesa FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'mesa_no_encontrada'; END IF;
  IF (SELECT estado FROM public.mesas WHERE id = p_id_mesa) IS DISTINCT FROM 'libre' THEN
    RAISE EXCEPTION 'mesa_no_disponible';
  END IF;

  IF EXISTS (SELECT 1 FROM public.reservas_mesa WHERE id_mesa = p_id_mesa AND ciclo = 'activa') THEN
    RAISE EXCEPTION 'mesa_ya_reservada';
  END IF;
  IF EXISTS (SELECT 1 FROM public.reservas_mesa WHERE id_usuario = v_uid AND ciclo = 'activa') THEN
    RAISE EXCEPTION 'usuario_ya_tiene_reserva';
  END IF;

  RETURN (
    WITH ins AS (
      INSERT INTO public.reservas_mesa (id_usuario, id_mesa, fecha_hora_reserva, personas_grupo, nota)
      VALUES (v_uid, p_id_mesa, p_fecha_hora, p_personas_grupo, NULLIF(trim(p_nota), ''))
      RETURNING id
    ),
    u AS (
      UPDATE public.mesas SET estado = 'reservada', actualizado_en = now() WHERE id = p_id_mesa RETURNING 1
    )
    SELECT i.id FROM ins i CROSS JOIN u
  );
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
  UPDATE public.mesas SET estado = 'libre', actualizado_en = now() WHERE id = id_mesa_cancel;
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
BEGIN
  IF NOT public.es_personal_activo() THEN RAISE EXCEPTION 'solo_personal'; END IF;

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
    UPDATE public.mesas SET estado = 'libre', actualizado_en = now() WHERE id = id_mesa_accion;
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.crear_reserva_mesa(uuid, timestamptz, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_reserva_mesa(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.personal_resolver_reserva(uuid, boolean) TO authenticated;
