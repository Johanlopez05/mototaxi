// Capa de seguridad del pasajero: compartir el viaje en vivo y el botón SOS.
import { Share } from 'react-native';
import { currentPosition } from './location';
import { errorMessage, supabase } from './supabase';

/** URL pública del panel, donde vive la página /v/<token>. Sin barra final. */
const SHARE_BASE_URL = (process.env.EXPO_PUBLIC_SHARE_BASE_URL ?? '').replace(/\/+$/, '');

/** Enlace para que un familiar siga el viaje en vivo (sin instalar nada). */
export async function shareLink(rideId: string): Promise<string> {
  if (!SHARE_BASE_URL) throw new Error('Falta configurar EXPO_PUBLIC_SHARE_BASE_URL en el .env de la app.');
  const { data, error } = await supabase.from('rides').select('share_token').eq('id', rideId).single();
  if (error) throw error;
  return `${SHARE_BASE_URL}/v/${data.share_token}`;
}

/** Abre el menú de compartir del teléfono (WhatsApp, SMS…) con el enlace del viaje. */
export async function shareTrip(rideId: string, plate: string | null): Promise<void> {
  const url = await shareLink(rideId);
  await Share.share({
    message: `Voy en un mototaxi${plate ? ` de placa ${plate}` : ''}. Sigue mi viaje en vivo: ${url}`,
  });
}

export type SosOutcome =
  /** Alerta registrada; `notified` = contactos a los que se les envió SMS */
  | { ok: true; notified: number; reason?: 'no_contacts' | 'sms_not_configured' }
  | { ok: false; error: string };

/**
 * Registra la alerta (con la ubicación si se consigue en 5 s) y avisa a los
 * contactos de confianza. Nunca lanza: si algo falla, la app igual ofrece llamar al 123.
 */
export async function triggerSos(rideId: string | null): Promise<SosOutcome> {
  const point = await Promise.race([
    currentPosition().catch(() => null),
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
