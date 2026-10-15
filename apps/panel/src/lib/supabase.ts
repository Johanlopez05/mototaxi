import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** true si falta configurar el .env.local (el panel muestra cómo hacerlo). */
export const configMissing = !url || !anonKey;

/**
 * Cliente de Supabase con la sesión del administrador (cookies).
 * Usa solo la anon key: los permisos los ponen RLS e is_admin().
 * Crea uno nuevo en cada petición; nunca lo compartas entre peticiones.
 */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(url || "http://localhost", anonKey || "falta-configurar", {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // En un Server Component no se pueden escribir cookies; proxy.ts renueva la sesión.
        }
      },
    },
  });
}

/** Mensaje de error de Supabase en español, listo para mostrar. */
export function errorMessage(error: unknown): string {
  const msg = (error as { message?: string })?.message ?? String(error);
  if (/network|fetch failed/i.test(msg)) return "Sin conexión con Supabase. Intenta de nuevo.";
  if (/Token has expired|invalid.*otp/i.test(msg)) return "El código no es válido o ya venció. Pide uno nuevo.";
  if (/rate limit|only request this after/i.test(msg)) return "Pediste demasiados códigos. Espera un minuto e intenta de nuevo.";
  return msg;
}
