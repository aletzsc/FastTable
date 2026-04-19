export function mapCocinaRpcError(message: string): string {
  if (message.includes('sin_mesa_para_pedidos')) {
    return 'Solo puedes pedir cuando estás en mesa tras tu reserva (mesa ocupada).';
  }
  if (message.includes('item_no_disponible')) return 'Ese plato no está disponible ahora.';
  if (message.includes('item_no_encontrado')) return 'Plato no encontrado.';
  if (message.includes('cantidad_invalida')) return 'Indica una cantidad entre 1 y 99.';
  if (message.includes('solo_cocina')) return 'Solo personal de cocina o gerencia.';
  if (message.includes('pedido_ya_procesado')) return 'Este pedido ya fue marcado.';
  if (message.includes('pedido_no_encontrado')) return 'Pedido no encontrado.';
  return message;
}
