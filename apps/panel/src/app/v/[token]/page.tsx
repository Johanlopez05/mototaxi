import type { Metadata } from "next";
import { Suspense } from "react";
import { requestTime } from "@/lib/time";
import { getSharedTrip, type SharedTrip } from "@/lib/shared-trip";
import { AutoRefresh } from "../../auto-refresh";

// Página pública: la abre un familiar desde el enlace que le compartieron.
// No pide sesión (proxy.ts deja pasar /v/). El token no se filtra a otros sitios.
export const metadata: Metadata = {
  title: "Viaje en mototaxi en vivo",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

const REFRESH_S = 10;

export default function SharedTripPage({ params }: PageProps<"/v/[token]">) {
  return (
    <main className="page trip-page">
      <Suspense fallback={<p className="muted">Cargando el viaje…</p>}>
        <Trip params={params} />
      </Suspense>
    </main>
  );
}

async function Trip({ params }: Pick<PageProps<"/v/[token]">, "params">) {
  const { token } = await params;
  const trip = await getSharedTrip(token).catch(() => null);
  const now = await requestTime();

  if (!trip) {
    return (
      <div className="card stack">
        <h1>Este enlace ya no está activo</h1>
        <p className="muted">
          Los viajes compartidos se pueden seguir mientras están en curso y hasta 30 minutos después de llegar.
          Si te preocupa la persona, llámala directamente.
        </p>
      </div>
    );
  }

  const name = trip.passenger_first_name || "Tu contacto";
  const done = trip.status === "completed";
  return (
    <div className="stack">
      {!done && <AutoRefresh seconds={REFRESH_S} />}

      {trip.sos_open && (
        <div className="notice bad sos-banner" role="alert">
          <strong>{name} activó el botón de emergencia.</strong> El equipo de Mototaxi ya fue avisado.
          Llámale y, si no responde, llama al <a href="tel:123">123</a>.
        </div>
      )}

      <div>
        <p className="eyebrow">Viaje en mototaxi · en vivo</p>
        <h1>{headline(trip, name)}</h1>
        {!done && <p className="muted">Esta página se actualiza sola cada {REFRESH_S} segundos.</p>}
      </div>

      <section className="card stack" aria-label="Conductor y moto">
        <div className="row">
          {trip.plate && <span className="plate">{trip.plate}</span>}
          <strong>{trip.driver_name ?? "Conductor verificado"}</strong>
        </div>
        <p className="muted">
          {[trip.moto_brand, trip.moto_color && `moto ${trip.moto_color}`].filter(Boolean).join(" · ") || "Moto registrada"}
          {" · "}conductor con documentos verificados
        </p>
      </section>

      <section className="card stack" aria-label="Recorrido">
        <dl className="facts">
          <dt>Recogida</dt>
          <dd>{trip.origin_address ?? "—"}</dd>
          <dt>Destino</dt>
          <dd>{trip.destination_address ?? "—"}</dd>
          {trip.started_at && (
            <>
              <dt>Salió</dt>
              <dd>{clock(trip.started_at)}</dd>
            </>
          )}
          {trip.completed_at && (
            <>
              <dt>Llegó</dt>
              <dd>{clock(trip.completed_at)}</dd>
            </>
          )}
        </dl>
      </section>

      {!done && trip.driver_lat != null && trip.driver_lng != null && (
        <section className="card stack" aria-label="Ubicación">
          <p>
            <strong>Ubicación de la moto</strong>
            <br />
            <span className={staleness(trip.location_at, now) > 120 ? "error" : "muted"}>
              {lastSeen(trip.location_at, now)}
            </span>
          </p>
          <a className="btn primary" target="_blank" rel="noopener noreferrer"
             href={`https://www.google.com/maps/search/?api=1&query=${trip.driver_lat},${trip.driver_lng}`}>
            Ver en Google Maps
          </a>
        </section>
      )}

      <p className="muted small">
        Si crees que {name} está en peligro, llama al <a href="tel:123">123</a>.
      </p>
    </div>
  );
}

function headline(t: SharedTrip, name: string): string {
  switch (t.status) {
    case "assigned":
      return `El mototaxi va en camino a recoger a ${name}`;
    case "arrived":
      return `El mototaxi llegó por ${name}`;
    case "in_progress":
      return `${name} va en camino${t.destination_address ? ` a ${t.destination_address}` : ""}`;
    case "completed":
      return `${name} llegó a su destino`;
    default:
      return `Viaje de ${name}`;
  }
}

/** Segundos desde la última ubicación (Infinity si no hay). */
const staleness = (iso: string | null, now: number) => (iso ? (now - Date.parse(iso)) / 1000 : Infinity);

function lastSeen(iso: string | null, now: number): string {
  const s = staleness(iso, now);
  if (!Number.isFinite(s)) return "Sin ubicación todavía";
  if (s < 60) return "Actualizada hace menos de un minuto";
  const m = Math.round(s / 60);
  return m > 2 ? `Sin señal hace ${m} minutos (puede estar sin internet)` : `Actualizada hace ${m} min`;
}

/** Hora en Colombia, p. ej. "3:42 p. m." */
const clock = (iso: string) =>
  new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
