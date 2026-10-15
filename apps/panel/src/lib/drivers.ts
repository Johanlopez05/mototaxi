import "server-only";
import { DOCUMENTS_BUCKET, type DocStatus, type DocType, type DriverStatus } from "@mototaxi/shared";
import { requireAdmin } from "./auth";
import { createClient } from "./supabase";

/** Cuánto duran los enlaces firmados a las fotos de documentos (s). */
const SIGNED_URL_TTL_S = 10 * 60;

/** Pestañas de la cola, en orden. La primera es la de entrada. */
export const QUEUE_TABS: readonly { status: DriverStatus; label: string }[] = [
  { status: "pending", label: "Por revisar" },
  { status: "needs_fix", label: "Por corregir" },
  { status: "approved", label: "Aprobados" },
  { status: "suspended", label: "Suspendidos" },
  { status: "rejected", label: "Rechazados" },
];

/** Estado del conductor como lo lee el administrador (DRIVER_STATUS_LABEL le habla al conductor). */
export const STATUS_LABEL: Record<DriverStatus, string> = {
  pending: "Por revisar",
  needs_fix: "Por corregir",
  approved: "Aprobado",
  suspended: "Suspendido",
  rejected: "Rechazado",
};

export const isDriverStatus =(s: unknown): s is DriverStatus => QUEUE_TABS.some((t) => t.status === s);

export interface QueueDriver {
  id: string;
  plate: string;
  moto_brand: string | null;
  moto_color: string | null;
  status: DriverStatus;
  created_at: string;
  full_name: string | null;
  phone: string | null;
  docs: { type: DocType; status: DocStatus; expires_on: string | null; created_at: string }[];
}

export interface DriverDocument {
  type: DocType;
  status: DocStatus;
  expires_on: string | null;
  reviewer_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  /** Enlace firmado y temporal a la foto; null si no se pudo firmar. */
  url: string | null;
}

export interface DriverDetail extends Omit<QueueDriver, "docs"> {
  rating_avg: number;
  rating_count: number;
  docs: DriverDocument[];
}

type ProfileJoin = { full_name: string | null; phone: string | null } | null;

const DRIVER_COLUMNS = "id, plate, moto_brand, moto_color, status, created_at, profile:profiles!drivers_id_fkey(full_name, phone)";

/** Conductores en un estado, los más antiguos primero (orden de llegada). */
export async function listDrivers(status: DriverStatus): Promise<QueueDriver[]> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("drivers")
    .select(`${DRIVER_COLUMNS}, docs:driver_documents(type, status, expires_on, created_at)`)
    .eq("status", status)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw error;
  return data.map(({ profile, ...d }) => ({ ...d, ...flattenProfile(profile as unknown as ProfileJoin) })) as QueueDriver[];
}

/** Cuántos conductores hay en cada estado (para las pestañas). */
export async function countByStatus(): Promise<Record<DriverStatus, number>> {
  await requireAdmin();
  const supabase = await createClient();
  const counts = await Promise.all(
    QUEUE_TABS.map(({ status }) =>
      supabase.from("drivers").select("id", { count: "exact", head: true }).eq("status", status),
    ),
  );
  return Object.fromEntries(QUEUE_TABS.map(({ status }, i) => [status, counts[i].count ?? 0])) as Record<DriverStatus, number>;
}

/** Un conductor con sus documentos y enlaces firmados a las fotos. null si no existe. */
export async function getDriver(id: string): Promise<DriverDetail | null> {
  await requireAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("drivers")
    .select(
      `${DRIVER_COLUMNS}, rating_avg, rating_count, docs:driver_documents(type, status, expires_on, reviewer_note, reviewed_at, created_at, file_path)`,
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const { profile, docs, ...driver } = data;
  const rows = docs as unknown as (Omit<DriverDocument, "url"> & { file_path: string })[];
  const paths = rows.map((d) => d.file_path);
  const signed = paths.length
    ? await supabase.storage.from(DOCUMENTS_BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_S)
    : { data: [], error: null };
  const urlByPath = new Map((signed.data ?? []).map((s) => [s.path, s.error ? null : s.signedUrl]));

  return {
    ...(driver as Omit<DriverDetail, "docs" | "full_name" | "phone">),
    ...flattenProfile(profile as unknown as ProfileJoin),
    docs: rows.map(({ file_path, ...d }) => ({ ...d, url: urlByPath.get(file_path) ?? null })),
  };
}

function flattenProfile(profile: ProfileJoin) {
  return { full_name: profile?.full_name ?? null, phone: profile?.phone ?? null };
}
