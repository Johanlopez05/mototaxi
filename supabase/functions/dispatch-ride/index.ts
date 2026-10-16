// Edge Function: dispatch-ride
// La llama la app del pasajero justo después de request_ride():
//   await supabase.functions.invoke('dispatch-ride', { body: { ride_id } })
//
// Responde de inmediato (202) y sigue repartiendo en segundo plano. El pasajero
// se entera del resultado escuchando su fila de `rides` por Realtime.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { supabaseKey } from '../_shared/keys.ts';
import { type DispatchDeps, type NextOffer, type PushMessage, runDispatch } from './dispatcher.ts';

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
// Llaves nuevas (publishable/secret) con respaldo en las anteriores: ver ../_shared/keys.ts
const PUBLISHABLE_KEY = supabaseKey('publishable', (name) => Deno.env.get(name));
const SECRET_KEY = supabaseKey('secret', (name) => Deno.env.get(name));
const EXPO_ACCESS_TOKEN = Deno.env.get('EXPO_ACCESS_TOKEN'); // opcional, si activas la seguridad de push en Expo

const admin = createClient(SUPABASE_URL, SECRET_KEY, { auth: { persistSession: false } });

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function sendExpoPush(message: PushMessage): Promise<void> {
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${EXPO_ACCESS_TOKEN}` } : {}),
    },
    body: JSON.stringify({ ...message, sound: 'default', priority: 'high', ttl: 15, channelId: 'ride-offers' }),
  });
  if (!res.ok) throw new Error(`Expo push ${res.status}: ${await res.text()}`);
}

const deps: DispatchDeps = {
  async nextOffer(rideId) {
    const { data, error } = await admin.rpc('dispatch_next_offer', { p_ride_id: rideId });
    if (error) throw error;
    const row = (data as NextOffer[])[0];
    if (!row) throw new Error('dispatch_next_offer no devolvió resultado');
    return row;
  },
  async isOfferPending(rideId, driverId) {
    const { data, error } = await admin
      .from('ride_offers')
      .select('status')
      .eq('ride_id', rideId)
      .eq('driver_id', driverId)
      .single();
    if (error) throw error;
    return data.status === 'pending';
  },
  async passengerPushToken(rideId) {
    const { data: ride } = await admin.from('rides').select('passenger_id').eq('id', rideId).single();
    if (!ride) return null;
    const { data: profile } = await admin.from('profiles').select('push_token').eq('id', ride.passenger_id).single();
    return profile?.push_token ?? null;
  },
  sendPush: sendExpoPush,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
  log: (event, detail) => console.log(JSON.stringify({ fn: 'dispatch-ride', event, ...detail })),
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Usa POST' });

  // 1. ¿Quién llama? (el token de sesión del pasajero)
  const authHeader = req.headers.get('Authorization') ?? '';
  const asUser = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await asUser.auth.getUser();
  if (userError || !userData.user) return json(401, { error: 'Debes iniciar sesión' });

  // 2. ¿El viaje existe, es suyo y sigue buscando?
  const body = await req.json().catch(() => ({}));
  const rideId: unknown = body?.ride_id;
  if (typeof rideId !== 'string' || !/^[0-9a-f-]{36}$/i.test(rideId)) return json(400, { error: 'ride_id no válido' });

  const { data: ride } = await admin.from('rides').select('passenger_id, status').eq('id', rideId).single();
  if (!ride || ride.passenger_id !== userData.user.id) return json(404, { error: 'Viaje no encontrado' });
  if (ride.status !== 'searching') return json(409, { error: 'El viaje ya no está buscando conductor', status: ride.status });

  // 3. Repartir en segundo plano
  const task = runDispatch(deps, rideId).then((result) => deps.log?.('done', { rideId, result }));
  if (typeof EdgeRuntime !== 'undefined') {
    EdgeRuntime.waitUntil(task);
    return json(202, { ride_id: rideId, status: 'dispatching' });
  }
  await task; // entorno local sin EdgeRuntime
  return json(200, { ride_id: rideId, status: 'done' });
});
