import { REQUIRED_DOCS } from "@mototaxi/shared";

// Página provisional. Fase 2: cola de verificación con admin_review_driver().
export default function Home() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 16px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ margin: 0, fontSize: 28 }}>Verificación de conductores</h1>
      <p style={{ color: "#565A63" }}>Ninguno aparece en el mapa hasta que lo apruebes. Documentos que se revisan:</p>
      <ul>
        {REQUIRED_DOCS.map((d) => (
          <li key={d.type}>
            {d.label}
            {d.expires ? " (vence)" : ""}
          </li>
        ))}
      </ul>
    </main>
  );
}
