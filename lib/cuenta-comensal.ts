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

/** Líneas de pedido del comensal en la mesa activa (RLS: solo filas propias). */
export async function fetchLineasCuentaComensal(idMesa: string): Promise<{
  lines: LineaCuenta[];
  total_centavos: number;
}> {
  const { data, error } = await supabase
    .from('pedidos_cocina')
    .select('id, cantidad, items_menu ( nombre, precio_centavos )')
    .eq('id_mesa', idMesa)
    .order('creado_en', { ascending: true });

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
