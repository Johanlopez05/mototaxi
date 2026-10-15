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

/** Distancia en línea recta entre dos puntos (metros, fórmula del haverseno). */
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/**
 * Minutos aproximados en moto por la ciudad: línea recta × 1,3 (calles) a 20 km/h.
 * Nunca menos de 1. Es un estimado para el pasajero, no una promesa.
 */
export function etaMinutes(straightLineMeters: number): number {
  return Math.max(1, Math.round((straightLineMeters * 1.3) / (20_000 / 60)));
}
