// Revisión de documentos de un conductor (panel). Pura, sin dependencias. Pruebas: review.test.ts
import type { DocType } from './index.ts';

export interface DocForReview {
  type: DocType;
  expires_on: string | null;
}

export interface ReviewChecklist {
  /** Se puede aprobar: están los 6, ninguno vencido y SOAT/técnico-mecánica con fecha. */
  canApprove: boolean;
  missing: DocType[];
  expired: DocType[];
  /** Documentos que vencen pero no tienen fecha registrada. */
  noExpiry: DocType[];
  /** Vigentes que vencen dentro de `soonDays` días. */
  expiringSoon: { type: DocType; days: number }[];
}

/**
 * Qué le falta a un conductor para aprobarlo. Es igual o más estricta que
 * admin_review_driver() (que exige 6 documentos sin vencer) y que
 * submit_for_review() (que además exige fecha en SOAT y técnico-mecánica).
 * `today` en ISO ("AAAA-MM-DD") para poder probarla.
 */
export function reviewChecklist(
  docs: readonly DocForReview[],
  required: readonly { type: DocType; expires: boolean }[],
  today: string,
  soonDays = 30,
): ReviewChecklist {
  const byType = new Map(docs.map((d) => [d.type, d]));
  const day = today.slice(0, 10);
  const result: ReviewChecklist = { canApprove: false, missing: [], expired: [], noExpiry: [], expiringSoon: [] };

  for (const { type, expires } of required) {
    const doc = byType.get(type);
    if (!doc) {
      result.missing.push(type);
      continue;
    }
    if (doc.expires_on) {
      const exp = doc.expires_on.slice(0, 10);
      const days = Math.round((Date.parse(`${exp}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000);
      if (days < 0) result.expired.push(type);
      else if (days <= soonDays) result.expiringSoon.push({ type, days });
    } else if (expires) {
      result.noExpiry.push(type);
    }
  }

  result.canApprove = !result.missing.length && !result.expired.length && !result.noExpiry.length;
  return result;
}
