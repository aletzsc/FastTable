#!/usr/bin/env node
/**
 * FastTable — consola local de personal (independiente de la app).
 *
 * Requiere en .env (raíz del proyecto) o variables de entorno:
 *   EXPO_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Uso: npm run staff:console
 *      node scripts/ft-staff-console.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { createInterface } from 'readline';
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Paleta “terminal ops” — sin verde. */
const t = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  cyan: '\x1b[38;2;72;201;232m',
  magenta: '\x1b[38;2;192;132;252m',
  amber: '\x1b[38;2;230;190;120m',
  rose: '\x1b[38;2;248;150;180m',
  red: '\x1b[38;2;240;100;110m',
  white: '\x1b[37m',
  line: '\x1b[38;2;90;85;95m',
};

function loadEnv() {
  const p = join(__dirname, '..', '.env');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const i = s.indexOf('=');
    if (i <= 0) continue;
    const k = s.slice(0, i).trim();
    let v = s.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnv();

const ROLES = ['anfitrion', 'mesero', 'gerente', 'cocina'];

function roleLabel(r) {
  const m = { anfitrion: 'Anfitrión', mesero: 'Mesero', gerente: 'Gerente', cocina: 'Cocina' };
  return m[r] ?? r;
}

function banner() {
  const b = [
    '',
    `${t.line}  ╭${'─'.repeat(58)}╮${t.reset}`,
    `  ${t.cyan}│${t.reset}  ${t.bold}${t.amber}FASTTABLE${t.reset} ${t.dim}·${t.reset} ${t.magenta}staff control matrix${t.reset}${' '.repeat(18)}${t.cyan}│${t.reset}`,
    `  ${t.cyan}│${t.reset}  ${t.dim}auth.users ↔ public.personal  (service role local)${t.reset}     ${t.cyan}│${t.reset}`,
    `${t.line}  ╰${'─'.repeat(58)}╯${t.reset}`,
    '',
  ];
  console.log(b.join('\n'));
}

function hr() {
  console.log(`${t.line}${'─'.repeat(62)}${t.reset}`);
}

/** @param {import('readline').Interface} rl */
function ask(rl, q) {
  return new Promise((resolve) => {
    rl.question(q, (ans) => resolve(ans.trim()));
  });
}

async function getSupabase() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error(
      `${t.red}✖${t.reset} Falta ${t.amber}EXPO_PUBLIC_SUPABASE_URL${t.reset} o ${t.amber}SUPABASE_SERVICE_ROLE_KEY${t.reset} en .env`,
    );
    process.exit(1);
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
async function fetchAuthEmailMap(supabase) {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  /** @type {Map<string, string>} */
  const idToEmail = new Map();
  for (const u of data.users) {
    if (u.email) idToEmail.set(u.id, u.email);
  }
  return idToEmail;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
async function listStaffRows(supabase) {
  const { data, error } = await supabase
    .from('personal')
    .select('id, id_usuario, nombre_visible, rol, activo, codigo_empleado, creado_en')
    .order('creado_en', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
async function printStaffTable(supabase) {
  const [rows, idToEmail] = await Promise.all([listStaffRows(supabase), fetchAuthEmailMap(supabase)]);
  hr();
  console.log(
    `  ${t.bold}${t.amber}#${t.reset}  ${t.bold}${t.cyan}nombre${t.reset}          ${t.bold}${t.magenta}rol${t.reset}         ${t.bold}${t.rose}estado${t.reset}   ${t.dim}correo / id${t.reset}`,
  );
  hr();
  if (rows.length === 0) {
    console.log(`  ${t.dim}(sin registros en public.personal)${t.reset}\n`);
    return rows;
  }
  rows.forEach((r, i) => {
    const email = idToEmail.get(r.id_usuario) ?? `${t.red}〈sin correo en Auth〉${t.reset}`;
    const st = r.activo ? `${t.cyan}ACTIVO${t.reset}` : `${t.red}BAJA ${t.reset}`;
    const num = `${t.amber}${String(i + 1).padStart(2, '0')}${t.reset}`;
    const name = (r.nombre_visible || '—').slice(0, 18).padEnd(18);
    const rol = roleLabel(r.rol).slice(0, 11).padEnd(11);
    console.log(` ${num}  ${t.white}${name}${t.reset}  ${rol}  ${st}   ${t.dim}${typeof email === 'string' && !email.includes('〈') ? email : email}${t.reset}`);
    console.log(`      ${t.dim}uuid personal: ${r.id}${t.reset}`);
  });
  console.log('');
  return rows;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {import('readline').Interface} rl
 */
async function menuDarBaja(supabase, rl) {
  const [rows, idToEmail] = await Promise.all([listStaffRows(supabase), fetchAuthEmailMap(supabase)]);
  const activos = rows.filter((r) => r.activo);
  if (activos.length === 0) {
    console.log(`  ${t.rose}No hay personal activo para dar de baja.${t.reset}\n`);
    return;
  }
  hr();
  console.log(`  ${t.bold}${t.red}Dar de baja${t.reset} ${t.dim}(solo ACTIVOS)${t.reset}`);
  hr();
  activos.forEach((r, i) => {
    const mail = idToEmail.get(r.id_usuario) ?? '—';
    console.log(
      `  ${t.amber}${String(i + 1).padStart(2, '0')}${t.reset}  ${t.white}${r.nombre_visible}${t.reset}  ${t.magenta}${roleLabel(r.rol)}${t.reset}  ${t.dim}${mail}${t.reset}`,
    );
  });
  console.log('');
  const n = await ask(rl, `  ${t.amber}Número a dar de baja (1-${activos.length}), o Enter cancelar:${t.reset} `);
  if (!n) return;
  const idx = parseInt(n, 10) - 1;
  if (idx < 0 || idx >= activos.length) {
    console.log(`  ${t.red}Índice inválido.${t.reset}\n`);
    return;
  }
  const row = activos[idx];
  const ok = (await ask(rl, `  ${t.red}Confirmar BAJA de «${row.nombre_visible}» [s/N]:${t.reset} `)).toLowerCase();
  if (ok !== 's' && ok !== 'si' && ok !== 'y') {
    console.log(`  ${t.dim}Cancelado.${t.reset}\n`);
    return;
  }
  const { error } = await supabase.from('personal').update({ activo: false }).eq('id', row.id);
  if (error) {
    console.log(`  ${t.red}Error: ${error.message}${t.reset}\n`);
    return;
  }
  console.log(`  ${t.cyan}Hecho.${t.reset} Ficha marcada como inactiva (Auth sigue existiendo).\n`);
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {import('readline').Interface} rl
 */
async function menuReactivar(supabase, rl) {
  const rows = await listStaffRows(supabase);
  const inactivos = rows.filter((r) => !r.activo);
  if (inactivos.length === 0) {
    console.log(`  ${t.rose}No hay personal inactivo.${t.reset}\n`);
    return;
  }
  console.log(`  ${t.dim}Personal inactivo:${t.reset}`);
  inactivos.forEach((r, i) => {
    console.log(`    ${t.amber}${i + 1}${t.reset}. ${r.nombre_visible} (${roleLabel(r.rol)})`);
  });
  const n = await ask(rl, `  ${t.amber}Número a reactivar, o Enter cancelar:${t.reset} `);
  if (!n) return;
  const idx = parseInt(n, 10) - 1;
  if (idx < 0 || idx >= inactivos.length) {
    console.log(`  ${t.red}Índice inválido.${t.reset}\n`);
    return;
  }
  const row = inactivos[idx];
  const { error } = await supabase.from('personal').update({ activo: true }).eq('id', row.id);
  if (error) {
    console.log(`  ${t.red}Error: ${error.message}${t.reset}\n`);
    return;
  }
  console.log(`  ${t.cyan}Hecho.${t.reset} ${row.nombre_visible} activo de nuevo.\n`);
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {import('readline').Interface} rl
 */
async function menuAlta(supabase, rl) {
  console.log(`\n  ${t.magenta}── Nueva ficha + usuario Auth ──${t.reset}\n`);
  const email = (await ask(rl, `  ${t.cyan}Correo:${t.reset} `)).toLowerCase();
  if (!email.includes('@')) {
    console.log(`  ${t.red}Correo inválido.${t.reset}\n`);
    return;
  }
  const password = await ask(rl, `  ${t.cyan}Contraseña (mín. 6):${t.reset} `);
  if (password.length < 6) {
    console.log(`  ${t.red}Contraseña demasiado corta.${t.reset}\n`);
    return;
  }
  const nombre = await ask(rl, `  ${t.cyan}Nombre visible (en app):${t.reset} `);
  if (!nombre) {
    console.log(`  ${t.red}Nombre obligatorio.${t.reset}\n`);
    return;
  }
  console.log(`\n  ${t.dim}Roles: 1 anfitrión · 2 mesero · 3 gerente · 4 cocina${t.reset}`);
  const rPick = await ask(rl, `  ${t.amber}Rol [1-4]:${t.reset} `);
  const ri = parseInt(rPick, 10);
  if (ri < 1 || ri > 4) {
    console.log(`  ${t.red}Rol inválido.${t.reset}\n`);
    return;
  }
  const rol = ROLES[ri - 1];
  const codigo = await ask(rl, `  ${t.dim}Código empleado (opcional, Enter omitir):${t.reset} `);

  const idToEmail = await fetchAuthEmailMap(supabase);
  let uid = [...idToEmail.entries()].find(([, e]) => e.toLowerCase() === email)?.[0];

  if (uid) {
    console.log(`\n  ${t.amber}El correo ya existe en Auth.${t.reset} Se actualizará / vinculará solo la ficha personal.\n`);
    const go = (await ask(rl, `  ${t.rose}¿Continuar? [s/N]:${t.reset} `)).toLowerCase();
    if (go !== 's' && go !== 'si') {
      console.log(`  ${t.dim}Cancelado.${t.reset}\n`);
      return;
    }
    const { error: upErr } = await supabase.from('personal').upsert(
      {
        id_usuario: uid,
        nombre_visible: nombre,
        rol,
        activo: true,
        codigo_empleado: codigo || null,
      },
      { onConflict: 'id_usuario' },
    );
    if (upErr) {
      console.log(`  ${t.red}Error personal: ${upErr.message}${t.reset}\n`);
      return;
    }
    const { error: pwErr } = await supabase.auth.admin.updateUserById(uid, { password });
    if (pwErr) console.log(`  ${t.dim}Aviso contraseña: ${pwErr.message}${t.reset}`);
    console.log(`  ${t.cyan}Listo.${t.reset} Ficha personal enlazada a ${t.white}${email}${t.reset} (${roleLabel(rol)}).\n`);
    return;
  }

  const { data: created, error: cErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre_completo: nombre },
  });
  if (cErr) {
    console.log(`  ${t.red}Auth: ${cErr.message}${t.reset}\n`);
    return;
  }
  uid = created.user.id;

  const { error: pErr } = await supabase.from('personal').upsert(
    {
      id_usuario: uid,
      nombre_visible: nombre,
      rol,
      activo: true,
      codigo_empleado: codigo || null,
    },
    { onConflict: 'id_usuario' },
  );
  if (pErr) {
    console.log(`  ${t.red}Usuario creado pero error en personal: ${pErr.message}${t.reset}`);
    console.log(`  ${t.dim}Revisa Auth y borra el usuario huérfano si hace falta.${t.reset}\n`);
    return;
  }
  console.log(`\n  ${t.cyan}● Alta completada${t.reset}`);
  console.log(`     ${t.dim}correo:${t.reset} ${email}`);
  console.log(`     ${t.dim}rol:${t.reset}   ${roleLabel(rol)}`);
  console.log('');
}

async function main() {
  banner();
  const supabase = await getSupabase();

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    for (;;) {
      console.log(`  ${t.bold}${t.amber}〉${t.reset} ${t.dim}menú${t.reset}`);
      console.log(`    ${t.cyan}1${t.reset}  Ver trabajadores`);
      console.log(`    ${t.rose}2${t.reset}  Dar de baja (desactivar ficha)`);
      console.log(`    ${t.magenta}3${t.reset}  Reactivar ficha`);
      console.log(`    ${t.cyan}4${t.reset}  Alta nueva (Auth + personal)`);
      console.log(`    ${t.dim}0  Salir${t.reset}`);
      const opt = await ask(rl, `\n  ${t.amber}Opción:${t.reset} `);

      if (opt === '0' || opt.toLowerCase() === 'q' || opt.toLowerCase() === 'salir') {
        console.log(`\n  ${t.dim}~ sesión cerrada${t.reset}\n`);
        break;
      }
      if (opt === '1') {
        await printStaffTable(supabase);
      } else if (opt === '2') {
        await menuDarBaja(supabase, rl);
      } else if (opt === '3') {
        await menuReactivar(supabase, rl);
      } else if (opt === '4') {
        await menuAlta(supabase, rl);
      } else {
        console.log(`  ${t.red}Opción no válida.${t.reset}\n`);
      }
    }
  } finally {
    rl.close();
  }
}

main().catch((e) => {
  console.error(`${t.red}✖${t.reset}`, e.message || e);
  process.exit(1);
});
