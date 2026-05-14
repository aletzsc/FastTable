/**
 * Día civil para planificación de mesas (debe coincidir con la zona usada en
 * `mesas_con_reserva_activa_en_dia_servicio` y `crear_reserva_mesa` en Supabase).
 */
export const RESTAURANT_PLAN_TIMEZONE = 'America/Mexico_City';

export function restaurantTodayYmd(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: RESTAURANT_PLAN_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Suma días a un Y-M-D civil (Gregorian). */
export function addDaysToYmd(ymd: string, delta: number): string {
  const [y0, m0, d0] = ymd.split('-').map(Number);
  const dim = (y: number, m: number) => new Date(y, m, 0).getDate();
  let y = y0;
  let m = m0;
  let d = d0 + delta;
  while (d > dim(y, m)) {
    d -= dim(y, m);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  while (d < 1) {
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    d += dim(y, m);
  }
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function ymdToLabelEs(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const ref = new Date(y, m - 1, d, 12, 0, 0, 0);
  return new Intl.DateTimeFormat('es', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(ref);
}

export function reservationYmdInRestaurantTz(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: RESTAURANT_PLAN_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}
