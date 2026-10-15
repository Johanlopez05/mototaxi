"use server";

import { refresh } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { errorMessage, createClient } from "@/lib/supabase";

export interface SosActionState {
  ok?: string;
  error?: string;
}

const MAX_NOTE = 1000;

/** Atender o cerrar una alerta con admin_update_sos(). */
export async function updateSos(_prev: SosActionState, formData: FormData): Promise<SosActionState> {
  await requireAdmin();
  const alertId = String(formData.get("alertId") ?? "");
  const status = String(formData.get("status") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  if (!/^[0-9a-f-]{36}$/i.test(alertId)) return { error: "Alerta no válida." };
  if (status !== "attending" && status !== "closed") return { error: "Acción no válida." };
  if (status === "closed" && !note) return { error: "Para cerrar, escribe qué pasó y qué se hizo." };
  if (note.length > MAX_NOTE) return { error: `La nota puede tener hasta ${MAX_NOTE} caracteres.` };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_sos", { p_alert_id: alertId, p_status: status, p_note: note });
  if (error) return { error: errorMessage(error) };

  refresh();
  return { ok: status === "closed" ? "Alerta cerrada." : "Marcada en atención: quedas como responsable." };
}
