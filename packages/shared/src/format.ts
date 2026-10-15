// Utilidades puras (sin dependencias) compartidas por las apps. Pruebas: format.test.ts

/**
 * Celular colombiano a formato E.164 (+57XXXXXXXXXX). Acepta espacios, guiones,
 * paréntesis y el prefijo 57 / +57. Solo celulares (10 dígitos que empiezan por 3).
 */
export function normalizeColombianPhone(input: string): string | null {
  let digits = input.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('57')) digits = digits.slice(2);
  if (!/^3\d{9}$/.test(digits)) return null;
  return `+57${digits}`;
}

/** "3001234567" → "300 123 4567" para mostrar */
export function formatPhone(e164OrDigits: string): string {
  const d = e164OrDigits.replace(/\D/g, '').replace(/^57(?=3\d{9}$)/, '');
  return d.length === 10 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : e164OrDigits;
}

/**
 * Fecha escrita por el usuario como DD/MM/AAAA (también acepta - o .) a ISO "AAAA-MM-DD".
 * Devuelve null si no es una fecha real.
 */
export function parseDateDMY(input: string): string | null {
  const m = input.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!m) return null;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** "2027-03-05" → "05/03/2027" */
export function formatDateDMY(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** Días que faltan para una fecha ISO (negativo si ya pasó). `today` en ISO para poder probarlo. */
export function daysUntil(iso: string, today: string): number {
  const ms = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) - Date.parse(`${today.slice(0, 10)}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** Fecha de hoy en Colombia (UTC-5, sin horario de verano) como "AAAA-MM-DD". */
export function todayInColombia(now: Date = new Date()): string {
  return new Date(now.getTime() - 5 * 3_600_000).toISOString().slice(0, 10);
}

/** 7000 → "$ 7.000" (pesos colombianos, sin decimales). Sin depender de Intl, que varía entre motores. */
export function formatCOP(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '$ —';
  const n = Math.round(value);
  const s = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${n < 0 ? '-' : ''}$ ${s}`;
}

/** 480 → "480 m", 1500 → "1,5 km" */
export function formatDistance(meters: number | null | undefined): string {
  if (meters == null || !Number.isFinite(meters)) return '';
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
}

/** Segundos enteros que quedan hasta `expiresAt` (nunca negativo). */
export function secondsLeft(expiresAt: string, nowMs: number): number {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - nowMs) / 1000));
}
