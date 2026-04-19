/** Mensajes en español para errores frecuentes de Supabase Auth. */
export function formatAuthErrorMessage(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('email rate limit') || m.includes('rate limit')) {
    return (
      'Demasiados intentos con este correo o desde esta red en poco tiempo. ' +
      'Espera varios minutos, prueba otra red Wi‑Fi o datos móviles, o usa «Recuperar contraseña» si ya tienes cuenta.'
    );
  }
  if (m.includes('user already registered') || m.includes('already been registered')) {
    return 'Ese correo ya está registrado. Usa «Ya tengo cuenta» o «¿Olvidaste tu contraseña?».';
  }
  if (m.includes('invalid login credentials')) {
    return 'Correo o contraseña incorrectos.';
  }
  if (m.includes('email not confirmed')) {
    return 'Confirma tu correo con el enlace que te enviamos antes de entrar.';
  }
  return message;
}
