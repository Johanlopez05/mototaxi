"use server";

import { normalizeColombianPhone } from "@mototaxi/shared";
import { redirect } from "next/navigation";
import { createClient, errorMessage } from "@/lib/supabase";

export interface LoginState {
  step: "phone" | "code";
  phone?: string;
  error?: string;
}

/** Paso 1: enviar el código por SMS. Solo a números ya registrados (no crea cuentas). */
export async function sendCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const phone = normalizeColombianPhone(String(formData.get("phone") ?? ""));
  if (!phone) return { step: "phone", error: "Escribe un celular colombiano de 10 dígitos (empieza por 3)." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({ phone, options: { shouldCreateUser: false } });
  if (error) {
    // No revelamos si el número existe o no
    if (/signups not allowed|user not found/i.test(error.message)) return { step: "code", phone };
    return { step: "phone", error: errorMessage(error) };
  }
  return { step: "code", phone };
}

/** Paso 2: validar el código. La sesión queda en cookies y requireAdmin revisa el rol. */
export async function verifyCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const phone = normalizeColombianPhone(String(formData.get("phone") ?? ""));
  const token = String(formData.get("code") ?? "").replace(/\D/g, "");
  if (!phone) return { step: "phone", error: "Vuelve a escribir tu celular." };
  if (token.length !== 6) return { step: "code", phone, error: "El código tiene 6 dígitos." };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });
  if (error) return { step: "code", phone, error: errorMessage(error) };
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
