-- =============================================================================
-- Enlazar public.personal a usuarios que YA existan en Authentication.
-- Ejecutar DESPUÉS de 01_reconstruir_db.sql y de crear las cuentas demo.
-- Los correos deben coincidir con 02_DEMO_CUENTAS.txt.
-- (ver 02_DEMO_CUENTAS.txt)
--
-- Roles: anfitrión, mesero, gerente, cocina (public.rol_personal).
-- =============================================================================

INSERT INTO public.personal (id_usuario, nombre_visible, rol, activo)
SELECT
  u.id,
  'Demo ' || v.rol::text,
  v.rol,
  true
FROM auth.users u
JOIN (
  VALUES
    ('demo-anfitrion@ftdemo.local', 'anfitrion'::public.rol_personal),
    ('demo-mesero@ftdemo.local', 'mesero'::public.rol_personal),
    ('demo-gerente@ftdemo.local', 'gerente'::public.rol_personal),
    ('demo-cocina@ftdemo.local', 'cocina'::public.rol_personal)
) AS v(email, rol) ON lower(u.email) = lower(v.email)
ON CONFLICT (id_usuario) DO UPDATE SET
  nombre_visible = EXCLUDED.nombre_visible,
  rol = EXCLUDED.rol,
  activo = true;
