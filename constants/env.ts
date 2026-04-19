/** Variables públicas (EXPO_PUBLIC_*). Defínelas en `.env` en la raíz del proyecto. */
function envStr(key: string): string {
  const v = process.env[key];
  return typeof v === 'string' ? v.trim() : '';
}

export const env = {
  supabaseUrl: envStr('EXPO_PUBLIC_SUPABASE_URL'),
  supabaseAnonKey: envStr('EXPO_PUBLIC_SUPABASE_ANON_KEY'),
};

export function assertSupabaseConfigured(): void {
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    throw new Error(
      'Falta EXPO_PUBLIC_SUPABASE_URL o EXPO_PUBLIC_SUPABASE_ANON_KEY. Crea un archivo .env en la raíz del proyecto.',
    );
  }
}
