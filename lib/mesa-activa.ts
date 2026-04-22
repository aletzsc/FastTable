import { supabase } from '@/lib/supabase';

export type MesaActiva = {
  id_mesa: string;
  codigo: string;
};

/**
 * Comensal en mesa activa:
 * 1) Flujo de reserva atendida (histórico)
 * 2) Flujo de fila virtual sentado por anfitrión
 */
export async function fetchMesaActivaComensal(userId: string): Promise<MesaActiva | null> {
  const { data, error } = await supabase
    .from('reservas_mesa')
    .select('id_mesa, mesas ( id, codigo )')
    .eq('id_usuario', userId)
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

  if (!e2 && row && row.estado === 'ocupada') {
    return { id_mesa: row.id, codigo: row.codigo };
  }

  const { data: fromQueue, error: qErr } = await supabase
    .from('fila_espera')
    .select('id_mesa_asignada, mesas:id_mesa_asignada ( id, codigo, estado )')
    .eq('id_usuario', userId)
    .eq('estado', 'sentado')
    .order('sentado_en', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (qErr || !fromQueue) return null;

  const mq = fromQueue.mesas as
    | { id: string; codigo: string; estado: 'libre' | 'ocupada' | 'reservada' }
    | { id: string; codigo: string; estado: 'libre' | 'ocupada' | 'reservada' }[]
    | null;
  const mesaQueue = Array.isArray(mq) ? mq[0] : mq;
  if (!mesaQueue?.id || mesaQueue.estado !== 'ocupada') return null;

  return { id_mesa: mesaQueue.id, codigo: mesaQueue.codigo };
}
