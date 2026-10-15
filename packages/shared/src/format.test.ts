// node --test packages/shared/src
import { test } from 'node:test';
import { deepStrictEqual as eq } from 'node:assert/strict';
import {
  daysUntil,
  formatCOP,
  formatDateDMY,
  formatDistance,
  formatPhone,
  normalizeColombianPhone,
  parseDateDMY,
  secondsLeft,
  todayInColombia,
} from './format.ts';

test('celular colombiano a E.164', () => {
  eq(normalizeColombianPhone('300 123 4567'), '+573001234567');
  eq(normalizeColombianPhone('(310)-555-0000'), '+573105550000');
  eq(normalizeColombianPhone('+57 321 000 1111'), '+573210001111');
  eq(normalizeColombianPhone('573210001111'), '+573210001111');
  eq(normalizeColombianPhone('601 555 1234'), null); // fijo, no celular
  eq(normalizeColombianPhone('300 123 456'), null); // le falta un dígito
  eq(normalizeColombianPhone(''), null);
});

test('mostrar teléfono', () => {
  eq(formatPhone('+573001234567'), '300 123 4567');
  eq(formatPhone('573001234567'), '300 123 4567');
});

test('fechas DD/MM/AAAA', () => {
  eq(parseDateDMY('05/03/2027'), '2027-03-05');
  eq(parseDateDMY('5-3-2027'), '2027-03-05');
  eq(parseDateDMY('29/02/2028'), '2028-02-29'); // bisiesto
  eq(parseDateDMY('29/02/2027'), null);
  eq(parseDateDMY('31/04/2027'), null);
  eq(parseDateDMY('2027-03-05'), null);
  eq(formatDateDMY('2027-03-05'), '05/03/2027');
});

test('días hasta vencer', () => {
  eq(daysUntil('2026-10-30', '2026-10-15'), 15);
  eq(daysUntil('2026-10-14', '2026-10-15'), -1);
  eq(daysUntil('2026-10-15', '2026-10-15T23:00:00Z'), 0);
});

test('hoy en Colombia', () => {
  eq(todayInColombia(new Date('2026-10-15T03:00:00Z')), '2026-10-14'); // 10 p. m. del 14 en Bogotá
  eq(todayInColombia(new Date('2026-10-15T06:00:00Z')), '2026-10-15');
});

test('pesos y distancias', () => {
  eq(formatCOP(7000), '$ 7.000');
  eq(formatCOP(1250000), '$ 1.250.000');
  eq(formatCOP(500), '$ 500');
  eq(formatCOP(null), '$ —');
  eq(formatDistance(480), '480 m');
  eq(formatDistance(1500), '1,5 km');
});

test('cuenta regresiva', () => {
  const now = Date.parse('2026-10-15T00:00:00.000Z');
  eq(secondsLeft('2026-10-15T00:00:15.000Z', now), 15);
  eq(secondsLeft('2026-10-15T00:00:14.200Z', now), 15);
  eq(secondsLeft('2026-10-14T23:59:59.000Z', now), 0);
});
