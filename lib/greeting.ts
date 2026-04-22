/**
 * Saludos según hora local y nombre para cortesías en la app comensal.
 */
export function saludoPorHora(d: Date = new Date()): string {
  const h = d.getHours();
  if (h >= 5 && h < 12) return 'Buenos días';
  if (h >= 12 && h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

/** Primera palabra del nombre, con capitalización simple. */
export function primerNombre(raw: string | null | undefined): string {
  if (raw == null || !raw.trim()) return '';
  const first = raw.trim().split(/\s+/)[0];
  if (!first) return '';
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

export function nombreParaSaludo(profileNombre: string | null | undefined, email: string | null | undefined): string {
  const fromProfile = primerNombre(profileNombre);
  if (fromProfile) return fromProfile;
  const local = email?.split('@')[0]?.trim();
  return primerNombre(local ?? '');
}

/** Ej. "Buenas tardes, Ana." o "Buenos días." si no hay nombre. */
export function textoSaludoComensal(
  profileNombre: string | null | undefined,
  email: string | null | undefined,
  now: Date = new Date(),
): string {
  const saludo = saludoPorHora(now);
  const nombre = nombreParaSaludo(profileNombre, email);
  if (!nombre) return `${saludo}.`;
  return `${saludo}, ${nombre}.`;
}

/** Para personal (nombre visible ya viene en una sola cadena). */
export function textoSaludoStaff(nombreVisible: string | null | undefined, now: Date = new Date()): string {
  const saludo = saludoPorHora(now);
  const nombre = primerNombre(nombreVisible);
  if (!nombre) return `${saludo}.`;
  return `${saludo}, ${nombre}.`;
}
