import { CONSENT_TEXT, MIN_AGE, PRIVACY_POLICY_VERSION, RESPONSIBLE, legalPlaceholdersPending } from "@mototaxi/shared";
import type { Metadata } from "next";

// Política de tratamiento de datos (Ley 1581 de 2012, Decreto 1377 de 2013). Página pública.
// Los datos del responsable salen de packages/shared/src/legal.ts.
// Si cambias algo sustancial: sube la versión en public.privacy_policy (una migración) y
// todos tendrán que volver a aceptar en las apps.
export const metadata: Metadata = {
  title: "Política de tratamiento de datos · Mototaxi",
  robots: { index: true, follow: true },
};

const VERSION = PRIVACY_POLICY_VERSION;

export default function PrivacyPage() {
  const r = RESPONSIBLE;
  return (
    <main className="page legal">
      {legalPlaceholdersPending && (
        <p className="notice bad" role="alert">
          Borrador: faltan los datos del responsable. No publiques esta página así.
        </p>
      )}

      <header className="stack" style={{ gap: 6 }}>
        <p className="eyebrow">Mototaxi · versión {VERSION}</p>
        <h1>Política de tratamiento de datos personales</h1>
        <p className="muted">
          Explica qué datos recogemos, para qué, con quién los compartimos y cómo ejercer tus derechos, según la Ley
          1581 de 2012 y el Decreto 1377 de 2013.
        </p>
      </header>

      <section>
        <h2>1. Quién es el responsable de tus datos</h2>
        <p>
          {r.name}, identificado con {r.id}, con domicilio en {r.address}, {r.city}, Colombia, es el responsable del
          tratamiento de los datos personales que recoge la plataforma Mototaxi: la app del pasajero, la app del
          conductor y el panel administrativo.
        </p>
        <ul>
          <li>Correo: {r.email}</li>
          <li>Teléfono: {r.phone}</li>
          <li>Dirección: {r.address}, {r.city}</li>
          <li>Área responsable: {r.area}</li>
        </ul>
        <p>Esta política aplica a pasajeros, conductores, contactos de confianza y administradores de la plataforma.</p>
      </section>

      <section>
        <h2>2. Qué datos recogemos</h2>
        <p>
          Solo recogemos lo necesario para prestar el servicio y para tu seguridad. No vendemos tus datos ni los
          usamos para publicidad de terceros.
        </p>
        <div className="table-wrap card">
          <table className="table">
            <thead>
              <tr><th scope="col">Dato</th><th scope="col">De quién</th><th scope="col">Para qué</th></tr>
            </thead>
            <tbody>
              <tr><td>Número de celular</td><td>Todos</td><td>Entrar con un código por SMS y contactarte durante un viaje</td></tr>
              <tr><td>Nombre</td><td>Todos</td><td>Que el conductor y el pasajero sepan con quién van</td></tr>
              <tr><td>Origen, destino, tarifa y horas del viaje</td><td>Pasajeros y conductores</td><td>Prestar el viaje, cobrarlo y atender quejas o emergencias</td></tr>
              <tr><td>Ubicación en tiempo real</td><td>Conductores, mientras están conectados o en un viaje</td><td>Mostrar motos cercanas, asignar viajes y seguir el viaje en vivo</td></tr>
              <tr><td>Ubicación del pasajero</td><td>Pasajeros, solo con la app abierta</td><td>Mostrar el mapa, el punto de recogida y la tarifa</td></tr>
              <tr><td>Cédula, licencia, SOAT y técnico-mecánica (fotos y vencimientos)</td><td>Conductores</td><td>Verificar que pueden prestar el servicio</td></tr>
              <tr><td>Foto del rostro (selfie)</td><td>Conductores</td><td>Verificar la identidad y mostrársela a su pasajero</td></tr>
              <tr><td>Placa, color y marca de la moto</td><td>Conductores</td><td>Que el pasajero reconozca la moto</td></tr>
              <tr><td>Calificaciones</td><td>Pasajeros y conductores</td><td>Mantener la calidad del servicio</td></tr>
              <tr><td>Contactos de confianza (nombre y celular)</td><td>Quien los agrega</td><td>Avisarles si se activa el botón de emergencia</td></tr>
              <tr><td>Alertas SOS (ubicación y hora)</td><td>Quien la activa</td><td>Atender la emergencia y dejar registro</td></tr>
              <tr><td>Token de notificaciones del teléfono</td><td>Conductores</td><td>Avisarles de una solicitud de viaje</td></tr>
            </tbody>
          </table>
        </div>
        <p>
          De la ubicación del conductor guardamos solo la última posición, no el recorrido completo. La ubicación del
          pasajero no se guarda; solo quedan el origen y el destino de cada viaje.
        </p>
      </section>

      <section>
        <h2>3. Datos sensibles</h2>
        <p>
          La foto del rostro del conductor es un dato biométrico, y la ley lo clasifica como sensible (Ley 1581,
          artículo 5). La ubicación en tiempo real no está en esa lista, pero la tratamos con el mismo cuidado.
        </p>
        <ul>
          <li>
            <strong>No estás obligado a autorizar el tratamiento de datos sensibles.</strong> Sin la foto del rostro no
            podrás registrarte como conductor, porque es la forma en que el pasajero comprueba con quién se sube.
          </li>
          <li>La foto se usa para verificar tu identidad y mostrársela solo al pasajero de tu viaje activo. No se usa para reconocimiento facial automático.</li>
          <li>La ven el equipo de verificación y el pasajero, solo mientras el viaje está activo, con un enlace que vence.</li>
          <li>La ubicación del conductor se comparte solo mientras está conectado o en un viaje.</li>
        </ul>
        <p>Pedimos la autorización de los datos sensibles de forma expresa y separada, con su propia casilla.</p>
      </section>

      <section>
        <h2>4. Para qué usamos tus datos</h2>
        <ol>
          <li>Crear y mantener tu cuenta, e identificarte con tu celular.</li>
          <li>Conectar pasajeros con conductores cercanos, calcular la tarifa y prestar el viaje.</li>
          <li>Verificar los documentos de los conductores y suspender a quien tenga un documento vencido.</li>
          <li>Proteger a pasajeros y conductores: compartir el viaje en vivo, el código de 4 dígitos, el botón de emergencia y el aviso a contactos de confianza.</li>
          <li>Atender consultas, quejas, reclamos y emergencias.</li>
          <li>Cumplir obligaciones legales y responder a requerimientos de autoridades competentes.</li>
          <li>Mejorar el servicio con estadísticas que no identifican a nadie.</li>
        </ol>
        <p>Si en el futuro queremos usar tus datos para algo distinto, te pediremos una nueva autorización.</p>
      </section>

      <section>
        <h2>5. Con quién compartimos tus datos</h2>
        <p>No vendemos ni alquilamos tus datos. Solo los compartimos en estos casos:</p>
        <ul>
          <li><strong>Entre pasajero y conductor de un mismo viaje</strong>, solo mientras el viaje está activo.</li>
          <li><strong>Con quien tú decidas compartir el viaje:</strong> el enlace funciona mientras el viaje está activo y hasta 30 minutos después de llegar.</li>
          <li><strong>Con tus contactos de confianza, si activas el botón de emergencia:</strong> reciben un SMS con tu nombre, los datos de la moto y el enlace del viaje.</li>
          <li><strong>Con proveedores que nos prestan servicios</strong> (base de datos y almacenamiento, envío de SMS, notificaciones, mapas y alojamiento web), que solo pueden usar los datos para ese servicio.</li>
          <li><strong>Con autoridades</strong>, cuando una ley lo exija, una autoridad competente lo ordene o sea necesario para atender una emergencia.</li>
        </ul>
        <p>
          <strong>Transferencia internacional.</strong> Algunos proveedores procesan datos fuera de Colombia. La Ley
          1581 (artículo 26) solo lo permite hacia países sin un nivel adecuado de protección con tu autorización
          expresa e inequívoca; por eso la pedimos al registrarte, y exigimos a cada proveedor proteger tus datos.
        </p>
      </section>

      <section>
        <h2>6. Cuánto tiempo guardamos tus datos</h2>
        <p>
          Solo el tiempo razonable y necesario para cada finalidad (Decreto 1377, artículo 11). La cuenta, mientras esté
          activa; los viajes y las alertas SOS, el tiempo necesario para atender quejas, reclamos o procesos
          judiciales; los documentos del conductor, mientras sea conductor; los contactos de confianza, hasta que los
          quites. De la ubicación del conductor solo existe la última posición.
        </p>
      </section>

      <section>
        <h2>7. Tus derechos y cómo ejercerlos</h2>
        <p>Como titular de tus datos tienes derecho a (Ley 1581, artículo 8):</p>
        <ul>
          <li>Conocer, actualizar y rectificar tus datos.</li>
          <li>Pedir prueba de la autorización que nos diste.</li>
          <li>Saber, si lo pides, qué uso le hemos dado a tus datos.</li>
          <li>Revocar la autorización y pedir que borremos tus datos, cuando no exista un deber legal o contractual de conservarlos.</li>
          <li>Acceder gratis a tus datos.</li>
          <li>Presentar quejas ante la Superintendencia de Industria y Comercio (SIC).</li>
        </ul>
        <p>
          <strong>Cómo hacer una solicitud:</strong> escríbenos a {r.email} con tu nombre, tu número de celular, qué
          pides y los documentos que quieras hacer valer.
        </p>
        <ul>
          <li><strong>Consultas</strong> (por ejemplo, qué datos tenemos de ti): respondemos en máximo 10 días hábiles; si no alcanzamos, te avisamos y respondemos máximo 5 días hábiles después.</li>
          <li><strong>Reclamos</strong> (corregir, borrar o revocar la autorización): respondemos en máximo 15 días hábiles desde el día siguiente a recibirlo; si no alcanzamos, te avisamos y respondemos máximo 8 días hábiles después. Si falta información, te la pedimos dentro de los 5 días siguientes; si pasan 2 meses sin respuesta, entendemos que desististe.</li>
        </ul>
        <p>Antes de acudir a la SIC, debes haber presentado tu consulta o reclamo ante nosotros.</p>
      </section>

      <section>
        <h2>8. Seguridad, menores de edad y cambios</h2>
        <p>
          Cada persona solo puede ver sus propios datos; los documentos se guardan en un almacenamiento privado y se
          ven solo con enlaces que vencen; los cambios importantes solo los hace el servidor; las conexiones están
          cifradas. Ninguna medida es infalible: si ocurre un incidente que ponga en riesgo tus datos, te avisaremos y
          lo informaremos a la SIC.
        </p>
        <p>
          La plataforma es para mayores de {MIN_AGE} años. Si una cuenta pertenece a un menor sin autorización de su
          representante legal, la cerraremos y borraremos sus datos.
        </p>
        <p>
          Esta política rige desde el {VERSION.split("-").reverse().join("/")}. Si hacemos cambios importantes, te
          avisaremos en la app antes de aplicarlos o, a más tardar, al hacerlo; si cambia para qué usamos tus datos, te
          pediremos una nueva autorización.
        </p>
      </section>

      <section>
        <h2>Lo que aceptas en las apps</h2>
        <ul>
          <li><strong>Pasajeros:</strong> {CONSENT_TEXT.passengerGeneral}</li>
          <li><strong>Conductores:</strong> {CONSENT_TEXT.driverGeneral}</li>
          <li><strong>Conductores, dato sensible:</strong> {CONSENT_TEXT.driverBiometric}</li>
        </ul>
      </section>
    </main>
  );
}
