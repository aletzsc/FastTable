export type EstadoMesa = 'libre' | 'ocupada' | 'reservada';

export type ReservaStaffRow = {
  id: string;
  id_usuario: string;
  fecha_hora_reserva: string;
  mesero_atender_a_partir_de: string;
  personas_grupo: number;
  nota: string | null;
  comensal_llego: boolean | null;
  ciclo: string;
  mesas: {
    id: string;
    codigo: string;
    estado: EstadoMesa;
    id_personal_atendiendo: string | null;
  } | null;
};

export function mapReservaRows(rawList: Record<string, unknown>[]): ReservaStaffRow[] {
  return rawList.map((raw) => {
    const dt = raw.mesas as
      | {
          id: string;
          codigo: string;
          estado: EstadoMesa;
          id_personal_atendiendo: string | null;
        }
      | {
          id: string;
          codigo: string;
          estado: EstadoMesa;
          id_personal_atendiendo: string | null;
        }[]
      | null;
    const mesas = Array.isArray(dt) ? (dt[0] ?? null) : dt;
    return {
      id: raw.id as string,
      id_usuario: raw.id_usuario as string,
      fecha_hora_reserva: raw.fecha_hora_reserva as string,
      mesero_atender_a_partir_de: raw.mesero_atender_a_partir_de as string,
      personas_grupo: raw.personas_grupo as number,
      nota: (raw.nota as string | null) ?? null,
      comensal_llego: (raw.comensal_llego as boolean | null) ?? null,
      ciclo: raw.ciclo as string,
      mesas,
    };
  });
}

/** Desde la hora acordada: “ir a atender”. Antes: “próximas”. */
export function splitReservationsByTime(rows: ReservaStaffRow[], now: Date) {
  const t = now.getTime();
  const upcoming: ReservaStaffRow[] = [];
  const attend: ReservaStaffRow[] = [];
  for (const r of rows) {
    if (new Date(r.fecha_hora_reserva).getTime() > t) upcoming.push(r);
    else attend.push(r);
  }
  return { upcoming, attend };
}

/** Tras 5 min desde la hora reservada (coincide con mesero_atender_a_partir_de en BD). */
export function canShowNoShow(r: ReservaStaffRow, now: Date): boolean {
  return now.getTime() >= new Date(r.mesero_atender_a_partir_de).getTime();
}

export function mapStaffRpcError(message: string): string {
  if (message.includes('solo_personal') || message.includes('staff_only')) return 'Sin permiso de personal.';
  if (message.includes('solo_anfitrion_gerente')) return 'Solo anfitrión o gerencia pueden gestionar reservas.';
  if (message.includes('ya_atendida') || message.includes('already_resolved')) return 'Esta reserva ya fue atendida.';
  if (message.includes('mesa_asignada_otro_mesero')) return 'Otro mesero ya está atendiendo esta mesa.';
  if (message.includes('fila_no_esperando')) return 'Ese comensal ya no está esperando en fila.';
  if (message.includes('mesa_no_libre')) return 'La mesa ya no está disponible.';
  if (message.includes('mesero_inactivo_o_inexistente')) return 'El mesero seleccionado no está activo.';
  if (message.includes('mesa_no_reservada')) return 'La mesa ya no está en estado reservada.';
  if (message.includes('no_tu_mesa')) return 'Esta mesa no está asignada a ti.';
  if (message.includes('solo_reservada_desasignar')) return 'Solo puedes dejar de atender mesas reservadas.';
  if (message.includes('solo_ocupada_liberar')) return 'Solo puedes liberar mesas ocupadas que te correspondan.';
  if (message.includes('mesa_en_reserva_panel')) return 'Esa mesa está reservada; gestiónala desde reservas.';
  if (message.includes('solo_libre_a_ocupada')) return 'Solo puedes ocupar mesas libres.';
  if (message.includes('solo_ocupada_a_libre_toggle')) return 'Solo puedes liberar mesas ocupadas.';
  if (message.includes('no_tu_mesa_toggle')) return 'Otro mesero tiene asignada esa mesa.';
  return message;
}
