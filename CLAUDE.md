# Mototaxi: contexto para Claude

App de mototaxis enfocada en la **seguridad del pasajero**. Producto y flujos: `docs/producto.md`. Arquitectura, estados y funciones: `docs/arquitectura.md`.

## Reglas del proyecto

- **Idioma:** la interfaz, los mensajes de error y los comentarios van en español (Colombia). Los nombres de código (tablas, columnas, funciones, variables) en inglés.
- **Monorepo con npm workspaces:** `apps/pasajero`, `apps/conductor` (Expo), `apps/panel` (Next.js), `packages/shared`.
- **Tipos compartidos:** estados, documentos y constantes viven en `packages/shared/src/index.ts`. Si cambias un enum en SQL, cámbialo ahí también.
- **Base de datos:** cada cambio es una migración nueva en `supabase/migrations/` (`AAAAMMDDHHMMSS_descripcion.sql`). Nunca edites una migración ya aplicada.
- **Seguridad primero:**
  - Toda tabla nueva lleva RLS y políticas explícitas.
  - Los cambios de estado de viajes y conductores se hacen solo con funciones `security definer` con `set search_path = ''`, nunca con `update` desde la app.
  - El conductor nunca debe poder leer `ride_codes`.
  - Los documentos van al bucket privado `driver-documents` con ruta `<id del conductor>/<tipo>.jpg`.
- **Expo:** instala paquetes con `npx expo install`, no con `npm install`, para que coincidan con la versión del SDK. Revisa `apps/*/AGENTS.md` antes de usar APIs de Expo o Next.js.
- **Variables de entorno:** nunca subas `.env`. Las apps usan solo la anon key; la service role key solo existe en Edge Functions.
- **Edge Functions:** en `supabase/functions/<nombre>/`. La lógica va en un archivo aparte con dependencias inyectadas y su `*_test.ts`; `index.ts` solo conecta Supabase y HTTP.
- **Viajes:** un conductor solo acepta con una oferta vigente en `ride_offers`. No crees otra vía para asignar viajes.

## Comandos

```bash
npm install
npm run pasajero | conductor | panel
npm run typecheck
PGHOST=localhost PGUSER=postgres npm run test:db   # requiere Postgres + PostGIS local
npm run test:functions                             # requiere Deno
```

## Siguiente paso (fase 2)

Ya está: reparto de solicitudes (`ride_offers`, `dispatch_next_offer()`, Edge Function `dispatch-ride`).

Falta, en la app del conductor: registro, subida de documentos al bucket, guardar el push token en `profiles.push_token`, crear el canal Android `ride-offers`, botón de disponible con ubicación en segundo plano, y la pantalla de oferta (escuchar `ride_offers` por Realtime + `current_offer()` al abrir).
