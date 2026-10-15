import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mototaxi · Panel",
  description: "Verificación de conductores, alertas SOS y vencimientos",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
