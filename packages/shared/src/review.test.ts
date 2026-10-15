// node --test packages/shared/src
import { test } from 'node:test';
import { deepStrictEqual as eq } from 'node:assert/strict';
import { reviewChecklist, type DocForReview } from './review.ts';

const REQUIRED = [
  { type: 'cedula', expires: false },
  { type: 'licencia', expires: false },
  { type: 'soat', expires: true },
  { type: 'tecnomecanica', expires: true },
  { type: 'selfie', expires: false },
  { type: 'foto_moto', expires: false },
] as const;

const TODAY = '2026-10-15';
const complete = (overrides: Partial<Record<DocForReview['type'], string | null>> = {}): DocForReview[] =>
  REQUIRED.map(({ type, expires }) => ({
    type,
    expires_on: type in overrides ? (overrides[type] ?? null) : expires ? '2027-06-01' : null,
  }));

test('reviewChecklist: completo y vigente se puede aprobar', () => {
  eq(reviewChecklist(complete(), REQUIRED, TODAY), {
    canApprove: true, missing: [], expired: [], noExpiry: [], expiringSoon: [],
  });
});

test('reviewChecklist: faltan documentos', () => {
  const r = reviewChecklist(complete().filter((d) => d.type !== 'selfie' && d.type !== 'soat'), REQUIRED, TODAY);
  eq(r.canApprove, false);
  eq(r.missing, ['soat', 'selfie']);
});

test('reviewChecklist: vencido ayer bloquea, vence hoy no', () => {
  eq(reviewChecklist(complete({ soat: '2026-10-14' }), REQUIRED, TODAY).expired, ['soat']);
  const hoy = reviewChecklist(complete({ soat: '2026-10-15' }), REQUIRED, TODAY);
  eq(hoy.canApprove, true);
  eq(hoy.expiringSoon, [{ type: 'soat', days: 0 }]);
});

test('reviewChecklist: SOAT sin fecha bloquea; cédula sin fecha no', () => {
  const r = reviewChecklist(complete({ tecnomecanica: null }), REQUIRED, TODAY);
  eq(r.canApprove, false);
  eq(r.noExpiry, ['tecnomecanica']);
});

test('reviewChecklist: avisa lo que vence pronto sin bloquear', () => {
  const r = reviewChecklist(complete({ soat: '2026-11-14', tecnomecanica: '2026-11-15' }), REQUIRED, TODAY);
  eq(r.canApprove, true);
  eq(r.expiringSoon, [{ type: 'soat', days: 30 }]);
});
