/**
 * Crea 4 usuarios Auth + filas en public.personal (un rol cada uno).
 * En Supabase alojado NO se puede hacer solo con SQL (auth.users).
 *
 * Requisitos en .env (raíz del proyecto):
 *   EXPO_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   ← Project Settings → API → service_role (secreto)
 *
 * Uso: node scripts/crear-cuentas-demo-trabajadores.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const p = join(__dirname, '..', '.env');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnv();

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    'Falta EXPO_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env (ver comentario al inicio del script).',
  );
  process.exit(1);
}

const urlNorm = url.trim().replace(/\/$/, '');
if (urlNorm.includes('.supabase.com')) {
  console.error(
    'EXPO_PUBLIC_SUPABASE_URL parece incorrecta: debe terminar en .supabase.co (no .supabase.com).\n' +
      'Cópiala de Supabase → Project Settings → API → Project URL.',
  );
  process.exit(1);
}
if (!urlNorm.includes('supabase.co')) {
  console.warn(
    'Aviso: la URL de Supabase suele ser https://<ref>.supabase.co — revisa Project Settings → API.',
  );
}

const supabase = createClient(urlNorm, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ROLES = ['anfitrion', 'mesero', 'gerente', 'cocina'];
/** Misma para todas; cámbiala en el script si quieres */
const PASSWORD = 'DemoftRoles1';
const emailFor = (rol) => `demo-${rol}@ftdemo.local`;

async function getOrCreateUser(email, password, nombreMeta) {
  const { data: list, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) throw listErr;
  const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (existing) return existing.id;

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre_completo: nombreMeta },
  });
  if (error) throw error;
  return data.user.id;
}

async function main() {
  console.log('Creando cuentas demo de trabajador…\n');

  const rows = [];
  for (const rol of ROLES) {
    const email = emailFor(rol);
    const uid = await getOrCreateUser(email, PASSWORD, `Demo ${rol}`);
    const { error } = await supabase.from('personal').upsert(
      {
        id_usuario: uid,
        nombre_visible: `Demo ${rol}`,
        rol,
        activo: true,
      },
      { onConflict: 'id_usuario' },
    );
    if (error) throw error;
    rows.push({ rol, email, password: PASSWORD });
  }

  console.log('Listo. Entra en la app como trabajador con:\n');
  console.log('Rol          Email                         Contraseña');
  console.log('-----------  ----------------------------  ------------');
  for (const r of rows) {
    console.log(`${r.rol.padEnd(11)}  ${r.email.padEnd(28)}  ${r.password}`);
  }
  console.log('\nPara borrarlas: Authentication → Users, y tabla public.personal (o solo borra usuarios y cascada si aplica).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
