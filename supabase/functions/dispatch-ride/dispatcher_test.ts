// deno test supabase/functions/dispatch-ride
import { deepStrictEqual as assertEquals, ok } from 'node:assert/strict';
import { type DispatchDeps, formatDistance, formatFare, type NextOffer, type PushMessage, runDispatch } from './dispatcher.ts';

const RIDE = '11111111-1111-1111-1111-111111111111';

/** Simula la base de datos y el reloj: cada oferta dura 15 s. */
function fakeWorld(script: Array<{ outcome: NextOffer['outcome']; driver?: string; token?: string; answersAfterMs?: number }>) {
  let clock = 0;
  const pushes: PushMessage[] = [];
  const offers = new Map<string, { answeredAt: number | null }>();
  let step = 0;

  const deps: DispatchDeps = {
    nextOffer: () => {
      const s = script[Math.min(step++, script.length - 1)];
      if (s.outcome === 'offered' && s.driver) {
        offers.set(s.driver, { answeredAt: s.answersAfterMs == null ? null : clock + s.answersAfterMs });
      }
      return Promise.resolve({
        outcome: s.outcome,
        driver_id: s.driver ?? null,
        push_token: s.token ?? null,
        expires_at: new Date(clock + 15_000).toISOString(),
        distance_m: 480,
        origin_address: 'Parque principal',
        destination_address: 'Terminal',
        fare: 7000,
      });
    },
    isOfferPending: (_ride, driver) => {
      const o = offers.get(driver);
      return Promise.resolve(!(o?.answeredAt != null && clock >= o.answeredAt));
    },
    passengerPushToken: () => Promise.resolve('ExponentPushToken[pasajero]'),
    sendPush: (m) => {
      pushes.push(m);
      return Promise.resolve();
    },
    sleep: (ms) => {
      clock += ms;
      return Promise.resolve();
    },
    now: () => clock, // misma escala que expires_at
  };
  return { deps, pushes, elapsed: () => clock };
}

Deno.test('el primer conductor acepta: termina asignado sin esperar los 15 s', async () => {
  const w = fakeWorld([
    { outcome: 'offered', driver: 'd1', token: 'ExponentPushToken[d1]', answersAfterMs: 4_000 },
    { outcome: 'assigned' },
  ]);
  assertEquals(await runDispatch(w.deps, RIDE), 'assigned');
  assertEquals(w.pushes.length, 1);
  assertEquals(w.pushes[0].to, 'ExponentPushToken[d1]');
  assertEquals(w.pushes[0].data.ride_id, RIDE);
  assertEquals(w.elapsed() <= 5_000, true);
});

Deno.test('si el primero no responde, a los 15 s se ofrece al siguiente', async () => {
  const w = fakeWorld([
    { outcome: 'offered', driver: 'd1', token: 'ExponentPushToken[d1]' },
    { outcome: 'offered', driver: 'd2', token: 'ExponentPushToken[d2]', answersAfterMs: 2_000 },
    { outcome: 'assigned' },
  ]);
  assertEquals(await runDispatch(w.deps, RIDE), 'assigned');
  assertEquals(w.pushes.map((p) => p.to), ['ExponentPushToken[d1]', 'ExponentPushToken[d2]']);
  assertEquals(w.elapsed() >= 15_000 && w.elapsed() <= 19_000, true);
});

Deno.test('sin motos: avisa al pasajero y termina', async () => {
  const w = fakeWorld([{ outcome: 'no_drivers' }]);
  assertEquals(await runDispatch(w.deps, RIDE), 'no_drivers');
  assertEquals(w.pushes[0].to, 'ExponentPushToken[pasajero]');
  ok(w.pushes[0].title.includes('No hay mototaxis'));
});

Deno.test('un conductor sin push token igual recibe la oferta (sin enviar push)', async () => {
  const w = fakeWorld([
    { outcome: 'offered', driver: 'd1', answersAfterMs: 1_000 },
    { outcome: 'assigned' },
  ]);
  assertEquals(await runDispatch(w.deps, RIDE), 'assigned');
  assertEquals(w.pushes.length, 0);
});

Deno.test('si el push falla, el reparto sigue', async () => {
  const w = fakeWorld([
    { outcome: 'offered', driver: 'd1', token: 'ExponentPushToken[d1]', answersAfterMs: 1_000 },
    { outcome: 'assigned' },
  ]);
  w.deps.sendPush = () => Promise.reject(new Error('Expo caído'));
  assertEquals(await runDispatch(w.deps, RIDE), 'assigned');
});

Deno.test('nunca pasa del tiempo máximo', async () => {
  const w = fakeWorld([{ outcome: 'waiting', driver: 'd1' }]);
  assertEquals(await runDispatch(w.deps, RIDE), 'timeout');
  assertEquals(w.elapsed() <= 111_000, true);
});

Deno.test('formatos en español de Colombia', () => {
  assertEquals(formatFare(7000).replace(/\s/g, ' '), '$ 7.000');
  assertEquals(formatDistance(480), '480 m');
  assertEquals(formatDistance(1500), '1,5 km');
});
