import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "./supabase";

export interface Admin {
  id: string;
  name: string;
}

/**
 * Exige una sesión de administrador. Sin sesión manda a /login; con sesión
 * pero sin rol admin, a /login?motivo=no-admin. Llámala en cada página y en
 * cada Server Action: la interfaz sola no protege nada.
 */
export async function requireAdmin(): Promise<Admin> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, phone, role")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.role !== "admin") redirect("/login?motivo=no-admin");

  return { id: userId, name: profile.full_name || profile.phone || "Administrador" };
}
