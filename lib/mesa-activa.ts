import { supabase } from '@/lib/supabase';

export type MesaActiva = {
  id_mesa: string;
  codigo: string;
};

/** Comensal sentado: reserva completada con llegada y mesa ocupada (última sesión). */
export async function fetchMesaActivaComensal(): Promise<MesaActiva | null> {
  const { data, error } = await supabase
    .from('reservas_mesa')
    .select('id_mesa, mesas ( id, codigo )')
    .eq('ciclo', 'completada')
    .eq('comensal_llego', true)
    .order('creado_en', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const m = data.mesas as { id: string; codigo: string } | { id: string; codigo: string }[] | null;
  const mesa = Array.isArray(m) ? m[0] : m;
  if (!mesa?.id) return null;

  const { data: row, error: e2 } = await supabase
    .from('mesas')
    .select('id, codigo, estado')
    .eq('id', mesa.id)
    .maybeSingle();

  if (e2 || !row || row.estado !== 'ocupada') return null;

  return { id_mesa: row.id, codigo: row.codigo };
}
