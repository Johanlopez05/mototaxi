// deno test supabase/functions/sos-alert
import { deepStrictEqual as eq, ok } from 'node:assert/strict';
import { buildMessage, notifyContacts, type SosContext, type SosDeps } from './alert.ts';

const PASAJERA = 'aaaaaaaa-0000-0000-0000-000000000001';

const ctx = (over: Partial<SosContext> = {}): SosContext => ({
  alert_id: 'alerta-1',
  raised_by: PASAJERA,
  notified_at: null,
  person_name: 'Lucía Gómez',
  role: 'passenger',
  share_token: 'token-123',
  plate: 'SEG44D',
  moto_color: 'azul',
  lat: 4.65601,
  lng: -74.05702,
  contacts: [
    { name: 'Mamá', phone: '+573001112233' },
    { name: 'Hermano', phone: '+573104445566' },
  ],
  ...over,
});

function fake(context: SosContext | null, over: Partial<SosDeps> = {}) {
  const sms: { to: string; body: string }[] = [];
  const marked: { id: string; count: number }[] = [];
  const deps: SosDeps = {
    loadContext: () => Promise.resolve(context),
    sendSms: (to, body) => {
      sms.push({ to, body });
      return Promise.resolve();
    },
    markNotified: (id, count) => {
      marked.push({ id, count });
      return Promise.resolve();
    },
    smsConfigured: true,
    shareBaseUrl: 'https://panel.ejemplo.co',
    ...over,
  };
  return { deps, sms, marked };
}

Deno.test('envía un SMS a cada contacto con el enlace en vivo y lo marca', async () => {
  const w = fake(ctx());
  eq(await notifyContacts(w.deps, 'alerta-1', PASAJERA), { status: 'sent', sent: 2, failed: 0 });
  eq(w.sms.map((s) => s.to), ['+573001112233', '+573104445566']);
  ok(w.sms[0].body.includes('https://panel.ejemplo.co/v/token-123'));
  eq(w.marked, [{ id: 'alerta-1', count: 2 }]);
});

Deno.test('solo quien activó la alerta puede disparar el aviso', async () => {
  const w = fake(ctx());
  eq(await notifyContacts(w.deps, 'alerta-1', 'otra-persona'), { status: 'forbidden' });
  eq(w.sms.length, 0);
});

Deno.test('no envía dos veces la misma alerta', async () => {
  const w = fake(ctx({ notified_at: '2026-10-15T20:00:00Z' }));
  eq(await notifyContacts(w.deps, 'alerta-1', PASAJERA), { status: 'already_sent' });
  eq(w.sms.length, 0);
});

Deno.test('sin contactos: no envía, pero lo marca', async () => {
  const w = fake(ctx({ contacts: [] }));
  eq(await notifyContacts(w.deps, 'alerta-1', PASAJERA), { status: 'no_contacts' });
  eq(w.marked, [{ id: 'alerta-1', count: 0 }]);
});

Deno.test('sin Twilio configurado: no marca, para poder reintentar luego', async () => {
  const w = fake(ctx(), { smsConfigured: false });
  eq(await notifyContacts(w.deps, 'alerta-1', PASAJERA), { status: 'sms_not_configured' });
  eq(w.marked.length, 0);
});

Deno.test('si un SMS falla, igual envía los demás y cuenta solo los enviados', async () => {
  const w = fake(ctx());
  w.deps.sendSms = (to) => (to.endsWith('2233') ? Promise.reject(new Error('Twilio 400')) : Promise.resolve());
  eq(await notifyContacts(w.deps, 'alerta-1', PASAJERA), { status: 'sent', sent: 1, failed: 1 });
  eq(w.marked, [{ id: 'alerta-1', count: 1 }]);
});

Deno.test('alerta inexistente', async () => {
  const w = fake(null);
  eq(await notifyContacts(w.deps, 'nada', PASAJERA), { status: 'not_found' });
});

Deno.test('mensaje: nombre, placa, color, enlace y 123', () => {
  eq(
    buildMessage(ctx(), 'https://panel.ejemplo.co'),
    'ALERTA: Lucía activó el botón de emergencia en un viaje en mototaxi (placa SEG44D, moto azul). ' +
      'Míralo en vivo: https://panel.ejemplo.co/v/token-123 Si no te responde, llama al 123.',
  );
});

Deno.test('mensaje sin URL pública: manda la última ubicación en Google Maps', () => {
  ok(buildMessage(ctx(), null).includes('https://maps.google.com/?q=4.65601,-74.05702'));
});

Deno.test('mensaje del conductor y sin viaje', () => {
  const body = buildMessage(ctx({ role: 'driver', plate: null, moto_color: null, share_token: null, lat: null, lng: null }), null);
  eq(body, 'ALERTA: Lucía activó el botón de emergencia mientras conducía un mototaxi. Si no te responde, llama al 123.');
});
