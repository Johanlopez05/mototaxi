// Lógica del reparto, separada de Supabase para poder probarla (dispatcher_test.ts).
//
// Repite: pedir la siguiente oferta → enviar push → esperar a que el conductor
// responda o se venza la oferta (15 s). Termina cuando el viaje se asigna, se
// queda sin motos, o se agota el tiempo máximo.

export type Outcome = 'offered' | 'waiting' | 'assigned' | 'no_drivers';

export interface NextOffer {
  outcome: Outcome;
  driver_id: string | null;
  push_token: string | null;
  expires_at: string | null;
  distance_m: number | null;
  origin_address: string | null;
  destination_address: string | null;
  fare: number | null;
}

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
}

export interface DispatchDeps {
  /** Llama a public.dispatch_next_offer(ride_id) con la service role. */
  nextOffer(rideId: string): Promise<NextOffer>;
  /** ¿La oferta de este conductor sigue pendiente? */
  isOfferPending(rideId: string, driverId: string): Promise<boolean>;
  /** Push token del pasajero, para avisarle si no hay motos. */
  passengerPushToken(rideId: string): Promise<string | null>;
  sendPush(message: PushMessage): Promise<void>;
  sleep(ms: number): Promise<void>;
  now(): number;
  log?(event: string, detail?: Record<string, unknown>): void;
}

export type DispatchResult = 'assigned' | 'no_drivers' | 'timeout';

const POLL_MS = 1_000;

/** Tiempo máximo del reparto: 6 ofertas de 15 s + margen. */
export const MAX_DISPATCH_MS = 110_000;

export const formatFare = (fare: number | null): string =>
  fare == null
    ? 'Tarifa por confirmar'
    : new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(fare);

export const formatDistance = (meters: number | null): string =>
  meters == null ? '' : meters < 1000 ? `${meters} m` : `${(meters / 1000).toFixed(1).replace('.', ',')} km`;

export function offerPush(rideId: string, offer: NextOffer): PushMessage | null {
  if (!offer.push_token) return null;
  return {
    to: offer.push_token,
    title: `Nueva solicitud · ${formatFare(offer.fare)}`,
    body: `Recoger a ${formatDistance(offer.distance_m)}: ${offer.origin_address ?? 'ver en el mapa'}`,
    data: { type: 'ride_offer', ride_id: rideId, expires_at: offer.expires_at },
  };
}

/** Espera hasta que la oferta deje de estar pendiente o venza. */
async function waitForAnswer(deps: DispatchDeps, rideId: string, offer: NextOffer, deadline: number) {
  const expiresAt = offer.expires_at ? Date.parse(offer.expires_at) : deps.now() + 15_000;
  const until = Math.min(expiresAt + 500, deadline);
  while (deps.now() < until) {
    await deps.sleep(POLL_MS);
    if (offer.driver_id && !(await deps.isOfferPending(rideId, offer.driver_id))) return;
  }
}

export async function runDispatch(deps: DispatchDeps, rideId: string): Promise<DispatchResult> {
  const deadline = deps.now() + MAX_DISPATCH_MS;

  while (deps.now() < deadline) {
    const offer = await deps.nextOffer(rideId);
    deps.log?.(offer.outcome, { rideId, driver: offer.driver_id, distance: offer.distance_m });

    switch (offer.outcome) {
      case 'assigned':
        return 'assigned';

      case 'no_drivers': {
        const token = await deps.passengerPushToken(rideId);
        if (token) {
          await deps.sendPush({
            to: token,
            title: 'No hay mototaxis disponibles',
            body: 'Ningún conductor cercano pudo tomar tu viaje. Intenta de nuevo en unos minutos.',
            data: { type: 'ride_no_drivers', ride_id: rideId },
          });
        }
        return 'no_drivers';
      }

      case 'offered': {
        const message = offerPush(rideId, offer);
        if (message) {
          // Si el push falla, el conductor igual ve la oferta en la app (Realtime / current_offer)
          await deps.sendPush(message).catch((e) => deps.log?.('push_error', { error: String(e) }));
        }
        await waitForAnswer(deps, rideId, offer, deadline);
        break;
      }

      case 'waiting':
        await waitForAnswer(deps, rideId, offer, deadline);
        break;
    }
  }
  return 'timeout';
}
