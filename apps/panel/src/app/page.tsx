import {
  REQUIRED_DOCS,
  formatDateDMY,
  formatPhone,
  reviewChecklist,
  todayInColombia,
  type DriverStatus,
} from "@mototaxi/shared";
import Link from "next/link";
import { Suspense } from "react";
import { QUEUE_TABS, STATUS_LABEL, countByStatus, isDriverStatus, listDrivers, type QueueDriver } from "@/lib/drivers";
import { Topbar } from "./topbar";

export default function QueuePage({ searchParams }: PageProps<"/">) {
  return (
    <>
      <Topbar />
      <main className="page">
        <div>
          <h1>Verificación de conductores</h1>
          <p className="muted">Ningún conductor recibe viajes hasta que lo apruebes.</p>
        </div>
        <Suspense fallback={<p className="muted">Cargando conductores…</p>}>
          <Queue searchParams={searchParams} />
        </Suspense>
      </main>
    </>
  );
}

async function Queue({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  const { estado } = await searchParams;
  const status: DriverStatus = isDriverStatus(estado) ? estado : "pending";
  const [drivers, counts] = await Promise.all([listDrivers(status), countByStatus()]);
  const today = todayInColombia();

  return (
    <div className="stack">
      <nav className="tabs" aria-label="Estado del conductor">
        {QUEUE_TABS.map((tab) => (
          <Link key={tab.status} href={tab.status === "pending" ? "/" : `/?estado=${tab.status}`}
                aria-current={tab.status === status ? "page" : undefined}>
            {tab.label}
            <span className="count">{counts[tab.status]}</span>
          </Link>
        ))}
      </nav>

      {drivers.length === 0 ? (
        <p className="empty">
          {status === "pending" ? "No hay conductores esperando revisión." : "No hay conductores en este estado."}
        </p>
      ) : (
        <ul className="queue">
          {drivers.map((d) => (
            <li key={d.id}>
              <DriverRow driver={d} today={today} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DriverRow({ driver: d, today }: { driver: QueueDriver; today: string }) {
  const check = reviewChecklist(d.docs, REQUIRED_DOCS, today);
  const uploaded = REQUIRED_DOCS.length - check.missing.length;
  const moto = [d.moto_brand, d.moto_color].filter(Boolean).join(" · ");

  return (
    <Link href={`/conductores/${d.id}`}>
      <div className="stack" style={{ gap: 4 }}>
        <div className="row">
          <span className="plate">{d.plate}</span>
          <strong>{d.full_name || "Sin nombre"}</strong>
        </div>
        <span className="muted">
          {[d.phone && formatPhone(d.phone), moto, `Registrado el ${formatDateDMY(todayInColombia(new Date(d.created_at)))}`].filter(Boolean).join(" · ")}
        </span>
      </div>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        {check.expired.length > 0 && <span className="badge bad">Documento vencido</span>}
        {check.noExpiry.length > 0 && <span className="badge warn">Falta fecha de vencimiento</span>}
        {check.expiringSoon.length > 0 && check.expired.length === 0 && <span className="badge warn">Vence pronto</span>}
        <span className={`badge ${uploaded === REQUIRED_DOCS.length ? "ok" : ""}`}>
          {uploaded}/{REQUIRED_DOCS.length} documentos
        </span>
        {d.status !== "pending" && <span className="badge">{STATUS_LABEL[d.status]}</span>}
      </div>
    </Link>
  );
}
