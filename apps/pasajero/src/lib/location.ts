// Ubicación del pasajero: solo en primer plano (no necesita seguirlo con la app cerrada).
import * as Location from 'expo-location';
import type { Place, Point } from './types';

export type PermissionResult = 'granted' | 'denied';

export async function requestLocation(): Promise<PermissionResult> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted' ? 'granted' : 'denied';
}

/** Posición actual; usa la última conocida si la precisa tarda demasiado. */
export async function currentPosition(): Promise<Point> {
  const last = await Location.getLastKnownPositionAsync({ maxAge: 60_000 });
  const fresh = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  const pos = last ? await Promise.race([fresh, wait(4_000).then(() => last)]) : await fresh;
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}

/** "Calle 10 # 43-12, El Poblado" o null si el teléfono no logra traducir el punto. */
export async function addressFor(point: Point): Promise<string | null> {
  try {
    const [a] = await Location.reverseGeocodeAsync({ latitude: point.lat, longitude: point.lng });
    if (!a) return null;
    const street = a.street && a.streetNumber ? `${a.street} # ${a.streetNumber}` : (a.street ?? a.name);
    return [street, a.district ?? a.subregion ?? a.city].filter(Boolean).join(', ') || null;
  } catch {
    return null;
  }
}

/** Busca una dirección escrita (usa el geocodificador del teléfono, sin llaves de API). */
export async function searchAddress(text: string, near: Point | null): Promise<Place | null> {
  const query = /colombia/i.test(text) ? text : `${text}, Colombia`;
  try {
    const results = await Location.geocodeAsync(query);
    if (!results.length) return null;
    // Si hay varias, la más cercana a donde está el pasajero
    const best = near
      ? results.reduce((a, b) => (sq(a, near) <= sq(b, near) ? a : b))
      : results[0];
    const point = { lat: best.latitude, lng: best.longitude };
    return { ...point, address: (await addressFor(point)) ?? text };
  } catch {
    return null;
  }
}

const sq = (r: { latitude: number; longitude: number }, p: Point) =>
  (r.latitude - p.lat) ** 2 + (r.longitude - p.lng) ** 2;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
