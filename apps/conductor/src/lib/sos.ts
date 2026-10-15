// Botón SOS del conductor: registra la alerta (con la ubicación) y avisa a sus
// contactos de confianza y al panel. Copia de apps/pasajero/src/lib/safety.ts (triggerSos):
// si cambias una, cambia la otra.
import * as Location from 'expo-location';
import { errorMessage, supabase } from './supabase';

export type SosOutcome =
  | { ok: true; notified: number; reason?: 'no_contacts' | 'sms_not_configured' }
  | { ok: false; error: string };

export async function triggerSos(rideId: string | null): Promise<SosOutcome> {
  const point = await Promise.race([
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
      .then((p) => ({ lat: p.coords.latitude, lng: p.coords.longitude }))
      .catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 5_000)),
  ]);

  const { data: alertId, error } = await supabase.rpc('raise_sos', {
    p_ride_id: rideId,
    lat: point?.lat ?? null,
    lng: point?.lng ?? null,
  });
  if (error || typeof alertId !== 'string') return { ok: false, error: errorMessage(error ?? 'Sin respuesta') };

  const { data, error: fnError } = await supabase.functions.invoke('sos-alert', { body: { alert_id: alertId } });
  if (fnError) return { ok: true, notified: 0 };
  const result = data as { status?: string; sent?: number } | null;
  if (result?.status === 'no_contacts' || result?.status === 'sms_not_configured') {
    return { ok: true, notified: 0, reason: result.status };
  }
  return { ok: true, notified: result?.sent ?? 0 };
}
