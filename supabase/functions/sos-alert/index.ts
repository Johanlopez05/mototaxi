// Edge Function: sos-alert
// La llama la app justo después de raise_sos():
//   await supabase.functions.invoke('sos-alert', { body: { alert_id } })
//
// Envía un SMS por Twilio a los contactos de confianza de quien activó el SOS.
// Secretos (supabase secrets set ...):
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
//   TWILIO_FROM  → número (+1…) o Messaging Service SID (MG…)
//   SHARE_BASE_URL → URL pública del panel, p. ej. https://panel.tumototaxi.co

import { createClient } from 'npm:@supabase/supabase-js@2';
import { supabaseKey } from '../_shared/keys.ts';
import { notifyContacts, type SosContext, type SosDeps } from './alert.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
// Llaves nuevas (publishable/secret) con respaldo en las anteriores: ver ../_shared/keys.ts
const PUBLISHABLE_KEY = supabaseKey('publishable', (name) => Deno.env.get(name));
const SECRET_KEY = supabaseKey('secret', (name) => Deno.env.get(name));
const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
const TWILIO_FROM = Deno.env.get('TWILIO_FROM');
const SHARE_BASE_URL = Deno.env.get('SHARE_BASE_URL')?.replace(/\/+$/, '') || null;

const admin = createClient(SUPABASE_URL, SECRET_KEY, { auth: { persistSession: false } });

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function sendTwilioSms(to: string, body: string): Promise<void> {
  const form = new URLSearchParams({ To: to, Body: body });
  form.set(TWILIO_FROM!.startsWith('MG') ? 'MessagingServiceSid' : 'From', TWILIO_FROM!);
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
  });
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${await res.text()}`);
}

const deps: SosDeps = {
  async loadContext(alertId) {
    const { data, error } = await admin.rpc('sos_alert_context', { p_alert_id: alertId });
    if (error) throw error;
    return (data as SosContext | null) ?? null;
  },
  sendSms: sendTwilioSms,
  async markNotified(alertId, count) {
    const { error } = await admin.rpc('mark_sos_notified', { p_alert_id: alertId, p_count: count });
    if (error) throw error;
  },
  smsConfigured: Boolean(TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM),
  shareBaseUrl: SHARE_BASE_URL,
  log: (event, detail) => console.log(JSON.stringify({ fn: 'sos-alert', event, ...detail })),
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Usa POST' });

  const asUser = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await asUser.auth.getUser();
  if (userError || !userData.user) return json(401, { error: 'Debes iniciar sesión' });

  const body = await req.json().catch(() => ({}));
  const alertId: unknown = body?.alert_id;
  if (typeof alertId !== 'string' || !/^[0-9a-f-]{36}$/i.test(alertId)) return json(400, { error: 'alert_id no válido' });

  try {
    const result = await notifyContacts(deps, alertId, userData.user.id);
    deps.log?.('done', { alertId, ...result });
    const code = result.status === 'not_found' ? 404 : result.status === 'forbidden' ? 403 : 200;
    return json(code, result);
  } catch (e) {
    deps.log?.('error', { alertId, error: String(e) });
    return json(500, { error: 'No pudimos avisar a tus contactos. Llama al 123.' });
  }
});
