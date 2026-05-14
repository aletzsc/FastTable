import { supabase } from '@/lib/supabase';

export type MesaActiva = {
  id_mesa: string;
  codigo: string;
  /** Reserva atendida (ciclo completada + en mesa); ancla pedidos a esta visita. */
  id_reserva_mesa: string | null;
  /** Fila sentado en mesa; ancla pedidos a esta visita. */
  id_fila_espera: string | null;
};

/**
 * Comensal en mesa activa:
 * 1) Flujo de reserva atendida (histórico)
 * 2) Flujo de fila virtual sentado por anfitrión
 */
export async function fetchMesaActivaComensal(userId: string): Promise<MesaActiva | null> {
  const { data, error } = await supabase
    .from('reservas_mesa')
    .select('id, id_mesa, mesas ( id, codigo )')
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
    return {
      id_mesa: row.id,
      codigo: row.codigo,
      id_reserva_mesa: data.id as string,
      id_fila_espera: null,
    };
  }

  const { data: fromQueue, error: qErr } = await supabase
    .from('fila_espera')
    .select('id, id_mesa_asignada, mesas:id_mesa_asignada ( id, codigo, estado )')
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

  return {
    id_mesa: mesaQueue.id,
    codigo: mesaQueue.codigo,
    id_reserva_mesa: null,
    id_fila_espera: fromQueue.id as string,
  };
}
