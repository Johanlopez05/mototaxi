"use client";

import { useActionState } from "react";
import { DECISIONS, type Decision } from "@/lib/decisions";
import { reviewDriver, type ReviewState } from "./actions";

const BUTTON_CLASS: Record<Decision, string> = {
  approved: "btn ok",
  needs_fix: "btn",
  suspended: "btn bad",
  rejected: "btn bad",
};

export function ReviewForm({ driverId, allowed, canApprove }: {
  driverId: string;
  allowed: Decision[];
  canApprove: boolean;
}) {
  const [state, action, pending] = useActionState(reviewDriver, {} as ReviewState);

  return (
    <form action={action} className="stack">
      <input type="hidden" name="driverId" value={driverId} />
      <label className="field">
        <span>Nota para el conductor</span>
        <textarea name="note" rows={4} maxLength={500}
                  placeholder="Ej.: la foto del SOAT está borrosa, tómala de nuevo con buena luz." />
        <span className="muted" style={{ fontWeight: 400 }}>
          Obligatoria si pides corrección, suspendes o rechazas. Se guarda en todos sus documentos.
        </span>
      </label>
      {state.error && <p className="notice bad" role="alert">{state.error}</p>}
      {state.ok && <p className="notice ok" role="status">{state.ok}</p>}
      <div className="decisions">
        {DECISIONS.filter((d) => allowed.includes(d.value)).map((d) => (
          <button key={d.value} name="decision" value={d.value} className={BUTTON_CLASS[d.value]}
                  disabled={pending || (d.value === "approved" && !canApprove)}>
            {d.label}
          </button>
        ))}
      </div>
    </form>
  );
}
