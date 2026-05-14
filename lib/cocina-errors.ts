export function mapCocinaRpcError(message: string): string {
  if (message.includes('sin_mesa_para_pedidos')) {
    return 'Solo puedes pedir cuando estás sentado en una mesa ocupada (por reserva o por asignación de fila).';
  }
  if (message.includes('sin_mesa_activa_para_terminar')) {
    return 'No tienes una mesa activa para terminar el servicio.';
  }
  if (message.includes('item_no_disponible')) return 'Ese plato no está disponible ahora.';
  if (message.includes('item_no_encontrado')) return 'Plato no encontrado.';
  if (message.includes('cantidad_invalida')) return 'Indica una cantidad entre 1 y 99.';
  if (message.includes('solo_cocina')) return 'Solo personal de cocina o gerencia.';
  if (message.includes('pedido_ya_procesado')) return 'Este pedido ya fue marcado.';
  if (message.includes('pedido_no_encontrado')) return 'Pedido no encontrado.';
  if (message.includes('item_sin_stock')) return 'Ese plato no tiene stock en almacén por ahora.';
  if (message.includes('item_sin_receta')) return 'El plato no tiene receta de inventario configurada.';
  if (message.includes('inventario_insuficiente')) {
    const idx = message.indexOf(':');
    const detail = idx >= 0 ? message.slice(idx + 1).trim() : '';
    return detail.length > 0
      ? `No alcanza el inventario para preparar ese pedido: ${detail}`
      : 'No alcanza el inventario para preparar ese pedido.';
  }
  return message;
}
