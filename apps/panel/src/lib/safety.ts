import "server-only";
import type { DocType, DriverStatus, RideStatus } from "@mototaxi/shared";
import { requireAdmin } from "./auth";
import { createClient } from "./supabase";

export type SosStatus = "open" | "attending" | "closed";

/** Resultado de admin_sos_alerts() */
export interface SosAlert {
  alert_id: string;
  status: SosStatus;
  created_at: string;
  closed_at: string | null;
  handler_note: string | null;
  handled_by_name: string | null;
  notified_count: number;
  notified_at: string | null;
  raised_by_name: string | null;
  raised_by_phone: string | null;
  raised_by_role: "passenger" | "driver";
  lat: number | null;
  lng: number | null;
  ride_id: string | null;
  ride_status: RideStatus | null;
  origin_address: string | null;
  destination_address: string | null;
  passenger_name: string | null;
  passenger_phone: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  plate: string | null;
  moto_color: string | null;
  driver_lat: number | null;
  driver_lng: number | null;
  driver_location_at: string | null;
  share_token: string | null;
}

/** Resultado de admin_expiring_documents() */
export interface ExpiringDocument {
  driver_id: string;
  full_name: string | null;
  phone: string | null;
  plate: string;
  driver_status: DriverStatus;
  doc_type: DocType;
  expires_on: string;
  days_left: number;
}

export const SOS_STATUS_LABEL: Record<SosStatus, string> = {
  open: "Sin atender",
  attending: "En atención",
  closed: "Cerrada",
};

/** Alertas SOS: abiertas primero, las más recientes arriba. */
export async function listSosAlerts(includeClosed = false): Promise<SosAlert[]> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_sos_alerts", { p_include_closed: includeClosed });
  if (error) throw error;
  return (data as SosAlert[] | null) ?? [];
}

/** Cuántas alertas siguen sin atender (para la barra superior). */
export async function countOpenSos(): Promise<number> {
  return (await listSosAlerts(false)).filter((a) => a.status === "open").length;
}

/** SOAT y técnico-mecánica vencidos o que vencen en los próximos `days` días. */
export async function listExpiring(days = 15): Promise<ExpiringDocument[]> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_expiring_documents", { p_days: days });
  if (error) throw error;
  return (data as ExpiringDocument[] | null) ?? [];
}
