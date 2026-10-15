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

## Comandos

```bash
npm install
npm run pasajero | conductor | panel
npm run typecheck
PGHOST=localhost PGUSER=postgres npm run test:db   # requiere Postgres + PostGIS local
```

## Siguiente paso (fase 2)

Edge Function que reparte las solicitudes a los conductores más cercanos por push, y en la app del conductor: registro, subida de documentos y botón de disponible con ubicación en segundo plano.
