import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { signOut } from "./login/actions";

export function Topbar() {
  return (
    <header className="topbar">
      <Link href="/" className="brand">Mototaxi · Panel</Link>
      <Suspense fallback={null}>
        <AdminBadge />
      </Suspense>
    </header>
  );
}

async function AdminBadge() {
  const admin = await requireAdmin();
  return (
    <form action={signOut} className="row">
      <span className="muted">{admin.name}</span>
      <button className="btn">Salir</button>
    </form>
  );
}
