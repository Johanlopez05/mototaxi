import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** true si falta configurar el .env (la app muestra cómo hacerlo). */
export const configMissing = !url || !anonKey;

export const supabase = createClient(url || 'http://localhost', anonKey || 'falta-configurar', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Renovar la sesión solo mientras la app está en primer plano
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

/** Mensaje de error de Supabase en español, listo para mostrar. */
export function errorMessage(error: unknown): string {
  const msg = (error as { message?: string })?.message ?? String(error);
  if (/network|fetch/i.test(msg)) return 'Sin conexión. Revisa tu internet e intenta de nuevo.';
  if (/Token has expired|invalid.*otp/i.test(msg)) return 'El código no es válido o ya venció. Pide uno nuevo.';
  if (/FunctionsFetchError|Failed to send a request to the Edge Function/i.test(msg)) {
    return 'No pudimos avisar a los conductores. Revisa tu internet e intenta de nuevo.';
  }
  return msg;
}
