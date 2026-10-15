// Lógica del aviso SOS, separada de Supabase y Twilio para poder probarla (alert_test.ts).
//
// Cuando alguien presiona SOS, la app llama raise_sos() y luego esta función:
// se envía un SMS a cada contacto de confianza con el enlace para seguir el
// viaje en vivo. Se envía UNA sola vez por alerta.

export interface SosContact {
  name: string;
  phone: string; // +573XXXXXXXXX
}

/** Resultado de public.sos_alert_context(alert_id) */
export interface SosContext {
  alert_id: string;
  raised_by: string;
  notified_at: string | null;
  person_name: string | null;
  role: 'passenger' | 'driver';
  share_token: string | null;
  plate: string | null;
  moto_color: string | null;
  lat: number | null;
  lng: number | null;
  contacts: SosContact[];
}

export interface SosDeps {
  loadContext(alertId: string): Promise<SosContext | null>;
  sendSms(to: string, body: string): Promise<void>;
  markNotified(alertId: string, count: number): Promise<void>;
  /** false si faltan las credenciales de Twilio */
  smsConfigured: boolean;
  /** URL pública del panel, donde vive la página /v/<token>. Sin barra final. */
  shareBaseUrl: string | null;
  log?(event: string, detail?: Record<string, unknown>): void;
}

export type SosResult =
  | { status: 'sent'; sent: number; failed: number }
  | { status: 'already_sent' | 'no_contacts' | 'sms_not_configured' | 'not_found' | 'forbidden' };

export function buildMessage(ctx: SosContext, shareBaseUrl: string | null): string {
  const name = (ctx.person_name ?? '').trim().split(/\s+/)[0] || 'Tu contacto';
  const moto = [ctx.plate && `placa ${ctx.plate}`, ctx.moto_color && `moto ${ctx.moto_color}`].filter(Boolean).join(', ');
  const where =
    ctx.share_token && shareBaseUrl
      ? ` Míralo en vivo: ${shareBaseUrl}/v/${ctx.share_token}`
      : ctx.lat != null && ctx.lng != null
        ? ` Última ubicación: https://maps.google.com/?q=${ctx.lat.toFixed(5)},${ctx.lng.toFixed(5)}`
        : '';
  const what = ctx.role === 'driver' ? 'mientras conducía un mototaxi' : 'en un viaje en mototaxi';
  return `ALERTA: ${name} activó el botón de emergencia ${what}${moto ? ` (${moto})` : ''}.${where} Si no te responde, llama al 123.`;
}

export async function notifyContacts(deps: SosDeps, alertId: string, callerId: string): Promise<SosResult> {
  const ctx = await deps.loadContext(alertId);
  if (!ctx) return { status: 'not_found' };
  if (ctx.raised_by !== callerId) return { status: 'forbidden' };
  if (ctx.notified_at) return { status: 'already_sent' };
  if (ctx.contacts.length === 0) {
    await deps.markNotified(alertId, 0);
    return { status: 'no_contacts' };
  }
  if (!deps.smsConfigured) {
    deps.log?.('sms_not_configured', { alertId });
    return { status: 'sms_not_configured' };
  }

  const body = buildMessage(ctx, deps.shareBaseUrl);
  const results = await Promise.allSettled(ctx.contacts.map((c) => deps.sendSms(c.phone, body)));
  const sent = results.filter((r) => r.status === 'fulfilled').length;
  results.forEach((r, i) => {
    if (r.status === 'rejected') deps.log?.('sms_error', { alertId, contact: i, error: String(r.reason) });
  });
  await deps.markNotified(alertId, sent);
  return { status: 'sent', sent, failed: results.length - sent };
}
