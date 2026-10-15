"use client";

import { useActionState } from "react";
import { updateSos, type SosActionState } from "./actions";

export function SosForm({ alertId, status }: { alertId: string; status: "open" | "attending" }) {
  const [state, action, pending] = useActionState(updateSos, {} as SosActionState);

  return (
    <form action={action} className="stack">
      <input type="hidden" name="alertId" value={alertId} />
      <label className="field">
        <span>Qué pasó y qué se hizo</span>
        <textarea name="note" rows={3} maxLength={1000}
                  placeholder="Ej.: llamamos a la pasajera, estaba bien; se activó por error." />
      </label>
      {state.error && <p className="notice bad" role="alert">{state.error}</p>}
      {state.ok && <p className="notice ok" role="status">{state.ok}</p>}
      <div className="decisions">
        {status === "open" && (
          <button name="status" value="attending" className="btn primary" disabled={pending}>
            Yo la atiendo
          </button>
        )}
        <button name="status" value="closed" className="btn" disabled={pending}>
          Cerrar alerta
        </button>
      </div>
    </form>
  );
}
