import { formatDateDMY, formatPhone } from "@mototaxi/shared";
import Link from "next/link";
import { Suspense } from "react";
import { listExpiring, type ExpiringDocument } from "@/lib/safety";
import { Topbar } from "../topbar";

const DOC_LABEL = { soat: "SOAT", tecnomecanica: "Técnico-mecánica" } as const;
const WINDOW_DAYS = 15;

export default function ExpiringPage() {
  return (
    <>
      <Topbar />
      <main className="page">
        <div>
          <h1>Vencimientos</h1>
          <p className="muted">
            SOAT y técnico-mecánica vencidos o que vencen en los próximos {WINDOW_DAYS} días. El día que vence, la tarea
            diaria suspende al conductor; avísale antes para que suba el documento nuevo.
          </p>
        </div>
        <Suspense fallback={<p className="muted">Cargando…</p>}>
          <Expiring />
        </Suspense>
      </main>
    </>
  );
}

async function Expiring() {
  const docs = await listExpiring(WINDOW_DAYS);
  if (docs.length === 0) return <p className="empty">Ningún documento vence en los próximos {WINDOW_DAYS} días.</p>;

  return (
    <div className="card table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Vence</th>
            <th scope="col">Documento</th>
            <th scope="col">Placa</th>
            <th scope="col">Conductor</th>
            <th scope="col">Celular</th>
            <th scope="col">Estado</th>
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => (
            <tr key={`${d.driver_id}-${d.doc_type}`}>
              <td>
                <span className={`badge ${d.days_left < 0 ? "bad" : d.days_left <= 5 ? "warn" : ""}`}>{when(d)}</span>
                <div className="muted small">{formatDateDMY(d.expires_on)}</div>
              </td>
              <td>{DOC_LABEL[d.doc_type as keyof typeof DOC_LABEL] ?? d.doc_type}</td>
              <td><span className="plate">{d.plate}</span></td>
              <td><Link href={`/conductores/${d.driver_id}`}>{d.full_name ?? "Sin nombre"}</Link></td>
              <td>{d.phone ? <a href={`tel:+${d.phone}`}>{formatPhone(d.phone)}</a> : "—"}</td>
              <td>{d.driver_status === "suspended" ? <span className="badge bad">Suspendido</span> : "Aprobado"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function when({ days_left: n }: ExpiringDocument): string {
  if (n < 0) return n === -1 ? "Venció ayer" : `Venció hace ${-n} días`;
  if (n === 0) return "Vence hoy";
  if (n === 1) return "Vence mañana";
  return `En ${n} días`;
}
