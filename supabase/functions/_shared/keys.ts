// Llaves de Supabase para las Edge Functions.
//
// Supabase reemplaza las llaves anon / service_role (se retiran a finales de 2026) por
// llaves publishable / secret. Las nuevas llegan como JSON en SUPABASE_PUBLISHABLE_KEYS y
// SUPABASE_SECRET_KEYS ({"default": "sb_..."}). Usamos las nuevas y, si no están,
// las anteriores, para que nada se rompa durante el cambio.

export type KeyKind = 'publishable' | 'secret';

const NEW_VAR: Record<KeyKind, string> = { publishable: 'SUPABASE_PUBLISHABLE_KEYS', secret: 'SUPABASE_SECRET_KEYS' };
const LEGACY_VAR: Record<KeyKind, string> = { publishable: 'SUPABASE_ANON_KEY', secret: 'SUPABASE_SERVICE_ROLE_KEY' };

/** Devuelve la llave pedida. `env` se inyecta para poder probarlo (en producción: Deno.env.get). */
export function supabaseKey(kind: KeyKind, env: (name: string) => string | undefined): string {
  const raw = env(NEW_VAR[kind]);
  if (raw) {
    try {
      const keys = JSON.parse(raw) as Record<string, string>;
      const key = keys.default ?? Object.values(keys)[0];
      if (key) return key;
    } catch {
      // Si no es JSON, puede ser la llave sola
      if (raw.startsWith('sb_')) return raw;
    }
  }
  const legacy = env(LEGACY_VAR[kind]);
  if (legacy) return legacy;
  throw new Error(`Falta la llave ${kind} de Supabase (${NEW_VAR[kind]} o ${LEGACY_VAR[kind]})`);
}
