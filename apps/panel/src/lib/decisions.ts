import type { DriverStatus } from "@mototaxi/shared";

export type Decision = Exclude<DriverStatus, "pending">;

export const DECISIONS: readonly { value: Decision; label: string; done: string; needsNote: boolean }[] = [
  { value: "approved", label: "Aprobar", done: "Conductor aprobado. Ya puede conectarse y recibir viajes.", needsNote: false },
  { value: "needs_fix", label: "Pedir corrección", done: "Le pedimos corregir sus documentos.", needsNote: true },
  { value: "suspended", label: "Suspender", done: "Conductor suspendido. Ya no recibe viajes.", needsNote: true },
  { value: "rejected", label: "Rechazar", done: "Conductor rechazado.", needsNote: true },
];

/** Qué decisiones tienen sentido desde cada estado. Solo se suspende a un aprobado. */
export function allowedDecisions(current: DriverStatus): Decision[] {
  return DECISIONS.map((d) => d.value).filter(
    (d) => d !== current && (d !== "suspended" || current === "approved"),
  );
}
