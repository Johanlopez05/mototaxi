import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { RideStatus } from "@mototaxi/shared";

/** Resultado de shared_trip(token) */
export interface SharedTrip {
  status: RideStatus;
  passenger_first_name: string;
  driver_name: string | null;
  plate: string | null;
  moto_color: string | null;
  moto_brand: string | null;
  driver_lat: number | null;
  driver_lng: number | null;
  location_at: string | null;
  origin_address: string | null;
  destination_address: string | null;
  destination_lat: number;
  destination_lng: number;
  started_at: string | null;
  completed_at: string | null;
  sos_open: boolean;
}

export const isShareToken = (t: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t);

/**
 * El viaje que alguien compartió. Se consulta SIN sesión (como cualquier
 * familiar con el enlace): la función solo devuelve datos mientras el viaje
 * está activo y hasta 30 min después de llegar.
 */
export async function getSharedTrip(token: string): Promise<SharedTrip | null> {
  if (!isShareToken(token)) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await anon.rpc("shared_trip", { p_token: token });
  if (error) throw error;
  return ((data as SharedTrip[] | null) ?? [])[0] ?? null;
}
