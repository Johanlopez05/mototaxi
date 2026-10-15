import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { countOpenSos } from "@/lib/safety";
import { signOut } from "./login/actions";

export function Topbar() {
  return (
    <header className="topbar">
      <Link href="/" className="brand">Mototaxi · Panel</Link>
      <nav className="mainnav" aria-label="Secciones">
        <Link href="/">Verificación</Link>
        <Link href="/alertas">
          Alertas SOS
          <Suspense fallback={null}>
            <OpenSosCount />
          </Suspense>
        </Link>
        <Link href="/vencimientos">Vencimientos</Link>
      </nav>
      <Suspense fallback={null}>
        <AdminBadge />
      </Suspense>
    </header>
  );
}

async function OpenSosCount() {
  const n = await countOpenSos().catch(() => 0);
  if (n === 0) return null;
  return (
    <span className="count sos-count" aria-label={`${n} sin atender`}>
      {n}
    </span>
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
