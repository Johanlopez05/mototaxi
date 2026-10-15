"use server";

import { REQUIRED_DOCS, reviewChecklist, todayInColombia } from "@mototaxi/shared";
import { refresh } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { DECISIONS, allowedDecisions, type Decision } from "@/lib/decisions";
import { getDriver } from "@/lib/drivers";
import { errorMessage, createClient } from "@/lib/supabase";

export interface ReviewState {
  ok?: string;
  error?: string;
}

const MAX_NOTE = 500;

/** Decide sobre un conductor con admin_review_driver(). Revisa todo en el servidor otra vez. */
export async function reviewDriver(_prev: ReviewState, formData: FormData): Promise<ReviewState> {
  await requireAdmin();
  const driverId = String(formData.get("driverId") ?? "");
  const decision = DECISIONS.find((d) => d.value === formData.get("decision"));
  const note = String(formData.get("note") ?? "").trim();

  if (!decision) return { error: "Elige una decisión." };
  if (decision.needsNote && !note) return { error: "Escribe qué debe corregir o por qué; el conductor lo verá en su app." };
  if (note.length > MAX_NOTE) return { error: `La nota puede tener hasta ${MAX_NOTE} caracteres.` };

  const driver = await getDriver(driverId);
  if (!driver) return { error: "Este conductor ya no existe." };
  if (!allowedDecisions(driver.status).includes(decision.value as Decision)) {
    return { error: "Esa decisión no aplica al estado actual. Recarga la página." };
  }
  if (decision.value === "approved") {
    const check = reviewChecklist(driver.docs, REQUIRED_DOCS, todayInColombia());
    if (!check.canApprove) return { error: "No se puede aprobar: faltan documentos, hay alguno vencido o sin fecha." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_review_driver", {
    p_driver_id: driverId,
    p_decision: decision.value,
    // Siempre texto (aunque sea vacío): con null, la función conservaría la nota anterior
    p_note: note,
  });
  if (error) return { error: errorMessage(error) };

  refresh();
  return { ok: decision.done };
}
