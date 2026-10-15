import { formatPhone } from "@mototaxi/shared";
import Link from "next/link";
import { Suspense } from "react";
import { requestTime } from "@/lib/time";
import { listSosAlerts, SOS_STATUS_LABEL, type SosAlert } from "@/lib/safety";
import { AutoRefresh } from "../auto-refresh";
import { Topbar } from "../topbar";
import { SosForm } from "./sos-form";

export default function AlertsPage({ searchParams }: PageProps<"/alertas">) {
  return (
    <>
      <Topbar />
      <main className="page">
        <div>
          <h1>Alertas SOS</h1>
          <p className="muted">
            Una alerta abierta es una persona que pidió ayuda. Llámala primero; si no responde o está en peligro, llama al 123.
          </p>
        </div>
        <Suspense fallback={<p className="muted">Cargando alertas…</p>}>
          <Alerts searchParams={searchParams} />
        </Suspense>
      </main>
    </>
  );
}

async function Alerts({ searchParams }: Pick<PageProps<"/alertas">, "searchParams">) {
  const { todas } = await searchParams;
  const includeClosed = todas === "1";
  const alerts = await listSosAlerts(includeClosed);
  const now = await requestTime();

  return (
    <div className="stack">
      <AutoRefresh seconds={15} />
      <nav className="tabs" aria-label="Qué alertas ver">
        <Link href="/alertas" aria-current={!includeClosed ? "page" : undefined}>Abiertas</Link>
        <Link href="/alertas?todas=1" aria-current={includeClosed ? "page" : undefined}>Todas</Link>
      </nav>
      {alerts.length === 0 ? (
        <p className="empty">{includeClosed ? "No hay alertas registradas." : "No hay alertas abiertas. Todo en calma."}</p>
      ) : (
        <ul className="stack" style={{ listStyle: "none" }}>
          {alerts.map((a) => (
            <li key={a.alert_id}>
              <AlertCard alert={a} now={now} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AlertCard({ alert: a, now }: { alert: SosAlert; now: number }) {
  const who = a.raised_by_role === "driver" ? "Conductor" : "Pasajero";
  const tone = a.status === "open" ? "bad" : a.status === "attending" ? "warn" : "";
  return (
    <article className={`card stack sos-card ${a.status}`} aria-label={`Alerta de ${a.raised_by_name ?? who}`}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="row">
          <span className={`badge ${tone}`}>{SOS_STATUS_LABEL[a.status]}</span>
          <strong>{a.raised_by_name ?? "Sin nombre"}</strong>
          <span className="muted">· {who}</span>
        </div>
        <span className="muted">{ago(a.created_at, now)}</span>
      </div>

      <dl className="facts">
        <dt>Llamar</dt>
        <dd>{a.raised_by_phone ? <a href={`tel:+${a.raised_by_phone}`}>{formatPhone(a.raised_by_phone)}</a> : "—"}</dd>
        <dt>Dónde estaba</dt>
        <dd>{a.lat != null && a.lng != null ? <MapLink lat={a.lat} lng={a.lng} label="Ubicación al pedir ayuda" /> : "Sin ubicación"}</dd>
        <dt>Contactos avisados</dt>
        <dd>{a.notified_at ? `${a.notified_count} por SMS` : "Aún no (o no tiene contactos)"}</dd>
        {a.ride_id && (
          <>
            <dt>Viaje</dt>
            <dd>
              {[a.origin_address, a.destination_address].filter(Boolean).join(" → ") || "—"}
              {a.ride_status ? ` · ${a.ride_status}` : ""}
            </dd>
            <dt>Moto</dt>
            <dd>
              {a.plate ? <span className="plate">{a.plate}</span> : "—"} {a.moto_color ?? ""}
            </dd>
            <dt>Conductor</dt>
            <dd>
              {a.driver_name ?? "—"}
              {a.driver_phone && <> · <a href={`tel:+${a.driver_phone}`}>{formatPhone(a.driver_phone)}</a></>}
            </dd>
            {a.raised_by_role === "driver" && (
              <>
                <dt>Pasajero</dt>
                <dd>
                  {a.passenger_name ?? "—"}
                  {a.passenger_phone && <> · <a href={`tel:+${a.passenger_phone}`}>{formatPhone(a.passenger_phone)}</a></>}
                </dd>
              </>
            )}
            <dt>Moto ahora</dt>
            <dd>
              {a.driver_lat != null && a.driver_lng != null ? (
                <>
                  <MapLink lat={a.driver_lat} lng={a.driver_lng} label="Ver en el mapa" /> · {ago(a.driver_location_at, now)}
                </>
              ) : "Sin ubicación"}
              {a.share_token && <> · <Link href={`/v/${a.share_token}`} target="_blank">viaje en vivo</Link></>}
            </dd>
          </>
        )}
        {a.handler_note && (
          <>
            <dt>Nota</dt>
            <dd>{a.handler_note}{a.handled_by_name ? ` (${a.handled_by_name})` : ""}</dd>
          </>
        )}
      </dl>

      {a.status !== "closed" && <SosForm alertId={a.alert_id} status={a.status} />}
    </article>
  );
}

const MapLink = ({ lat, lng, label }: { lat: number; lng: number; label: string }) => (
  <a href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`} target="_blank" rel="noopener noreferrer">
    {label}
  </a>
);

function ago(iso: string | null, now: number): string {
  if (!iso) return "—";
  const m = Math.floor((now - Date.parse(iso)) / 60000);
  if (m < 1) return "hace menos de un minuto";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.floor(h / 24)} d`;
}
