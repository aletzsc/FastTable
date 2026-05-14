import { supabase } from '@/lib/supabase';

export type LineaCuenta = {
  id: string;
  cantidad: number;
  nombre: string;
  precio_unit_centavos: number;
  subtotal_centavos: number;
};

function itemNombre(raw: unknown): string {
  if (raw == null) return '—';
  const z = Array.isArray(raw) ? raw[0] : raw;
  return (z as { nombre?: string })?.nombre ?? '—';
}

function itemPrecio(raw: unknown): number {
  if (raw == null) return 0;
  const z = Array.isArray(raw) ? raw[0] : raw;
  return (z as { precio_centavos?: number })?.precio_centavos ?? 0;
}

/** Líneas de pedido del comensal en la visita actual (misma reserva o mismo turno de fila). */
export async function fetchLineasCuentaComensal(
  userId: string,
  idMesa: string,
  ctx: { id_reserva_mesa: string | null; id_fila_espera: string | null },
): Promise<{
  lines: LineaCuenta[];
  total_centavos: number;
}> {
  let q = supabase
    .from('pedidos_cocina')
    .select('id, cantidad, items_menu ( nombre, precio_centavos )')
    .eq('id_mesa', idMesa)
    .eq('id_usuario', userId);

  if (ctx.id_reserva_mesa) {
    q = q.eq('id_reserva_mesa', ctx.id_reserva_mesa);
  } else if (ctx.id_fila_espera) {
    q = q.eq('id_fila_espera', ctx.id_fila_espera);
  } else {
    return { lines: [], total_centavos: 0 };
  }

  const { data, error } = await q.order('creado_en', { ascending: true });

  if (error || !data) {
    return { lines: [], total_centavos: 0 };
  }

  let total = 0;
  const lines: LineaCuenta[] = data.map((row) => {
    const pu = itemPrecio(row.items_menu);
    const nombre = itemNombre(row.items_menu);
    const cantidad = row.cantidad;
    const sub = cantidad * pu;
    total += sub;
    return {
      id: row.id,
      cantidad,
      nombre,
      precio_unit_centavos: pu,
      subtotal_centavos: sub,
    };
  });

  return { lines, total_centavos: total };
}
