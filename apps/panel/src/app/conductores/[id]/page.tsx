import {
  DOC_STATUS_LABEL,
  REQUIRED_DOCS,
  formatDateDMY,
  formatPhone,
  reviewChecklist,
  todayInColombia,
  type DocType,
  type ReviewChecklist,
} from "@mototaxi/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { allowedDecisions } from "@/lib/decisions";
import { STATUS_LABEL, getDriver, type DriverDocument } from "@/lib/drivers";
import { Topbar } from "../../topbar";
import { ReviewForm } from "./review-form";

export const metadata: Metadata = { title: "Revisar conductor · Mototaxi" };

const label = (type: DocType) => REQUIRED_DOCS.find((d) => d.type === type)?.label ?? type;

export default function DriverPage({ params }: PageProps<"/conductores/[id]">) {
  return (
    <>
      <Topbar />
      <main className="page">
        <Link href="/" className="btn link">← Volver a la cola</Link>
        <Suspense fallback={<p className="muted">Cargando documentos…</p>}>
          <DriverReview params={params} />
        </Suspense>
      </main>
    </>
  );
}

async function DriverReview({ params }: Pick<PageProps<"/conductores/[id]">, "params">) {
  const { id } = await params;
  const driver = await getDriver(id);
  if (!driver) notFound();

  const today = todayInColombia();
  const check = reviewChecklist(driver.docs, REQUIRED_DOCS, today);
  const docByType = new Map(driver.docs.map((d) => [d.type, d]));
  const moto = [driver.moto_brand, driver.moto_color].filter(Boolean).join(" · ") || "Sin datos";

  return (
    <div className="review-layout">
      <div className="stack">
        <div className="stack" style={{ gap: 6 }}>
          <div className="row">
            <span className="plate">{driver.plate}</span>
            <span className="badge">{STATUS_LABEL[driver.status]}</span>
          </div>
          <h1>{driver.full_name || "Sin nombre"}</h1>
          <dl className="facts">
            <dt>Celular</dt>
            <dd>{driver.phone ? formatPhone(driver.phone) : "—"}</dd>
            <dt>Moto</dt>
            <dd>{moto}</dd>
            <dt>Registrado</dt>
            <dd>{formatDateDMY(todayInColombia(new Date(driver.created_at)))}</dd>
            {driver.rating_count > 0 && (
              <>
                <dt>Calificación</dt>
                <dd>{Number(driver.rating_avg).toFixed(1).replace(".", ",")} ({driver.rating_count} viajes)</dd>
              </>
            )}
          </dl>
        </div>

        <section className="docs" aria-label="Documentos">
          {REQUIRED_DOCS.map(({ type }) => (
            <DocCard key={type} type={type} doc={docByType.get(type)} check={check} />
          ))}
        </section>
        <p className="muted">Los enlaces a las fotos son privados y vencen en 10 minutos. Recarga para verlas de nuevo.</p>
      </div>

      <aside className="card stack">
        <h2>Decisión</h2>
        <Checklist check={check} />
        <ReviewForm driverId={driver.id} allowed={allowedDecisions(driver.status)} canApprove={check.canApprove} />
      </aside>
    </div>
  );
}

function DocCard({ type, doc, check }: { type: DocType; doc?: DriverDocument; check: ReviewChecklist }) {
  const expired = check.expired.includes(type);
  const soon = check.expiringSoon.find((s) => s.type === type);
  const noExpiry = check.noExpiry.includes(type);

  return (
    <article className="doc">
      {doc?.url ? (
        <a className="photo" href={doc.url} target="_blank" rel="noreferrer" title="Abrir en tamaño completo">
          {/* Enlace firmado que vence: no pasa por next/image a propósito */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={doc.url} alt={label(type)} loading="lazy" />
        </a>
      ) : (
        <div className="photo missing">{doc ? "No se pudo cargar la foto" : "No lo ha subido"}</div>
      )}
      <div className="info">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <strong>{label(type)}</strong>
          {doc && <span className={`badge ${doc.status === "approved" ? "ok" : doc.status === "rejected" ? "bad" : ""}`}>
            {DOC_STATUS_LABEL[doc.status]}
          </span>}
        </div>
        {doc?.expires_on && (
          <span className={expired ? "error" : soon ? "" : "muted"}>
            {expired ? "Venció el " : "Vence el "}
            {formatDateDMY(doc.expires_on)}
            {soon && ` (${soon.days === 0 ? "hoy" : `en ${soon.days} días`})`}
          </span>
        )}
        {noExpiry && <span className="error">Falta la fecha de vencimiento</span>}
        {doc && <span className="muted">Subido el {formatDateDMY(todayInColombia(new Date(doc.created_at)))}</span>}
        {doc?.reviewer_note && <span className="muted">Nota: {doc.reviewer_note}</span>}
      </div>
    </article>
  );
}

function Checklist({ check }: { check: ReviewChecklist }) {
  if (check.canApprove && check.expiringSoon.length === 0) {
    return <p className="badge ok">Los 6 documentos están completos y vigentes</p>;
  }
  return (
    <ul className="checklist">
      {check.missing.length > 0 && <li className="error">Falta: {check.missing.map(label).join(", ")}</li>}
      {check.expired.length > 0 && <li className="error">Vencido: {check.expired.map(label).join(", ")}</li>}
      {check.noExpiry.length > 0 && <li className="error">Sin fecha de vencimiento: {check.noExpiry.map(label).join(", ")}</li>}
      {check.expiringSoon.map((s) => (
        <li key={s.type}>{label(s.type)} vence {s.days === 0 ? "hoy" : `en ${s.days} días`}</li>
      ))}
    </ul>
  );
}
