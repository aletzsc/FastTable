/** Formato simple en MXN (ajusta si multi-moneda). */
export function formatPriceFromCents(cents: number): string {
  const n = cents / 100;
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
}
