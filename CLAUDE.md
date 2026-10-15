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

Ya está: reparto de solicitudes (`ride_offers`, `dispatch_next_offer()`, Edge Function `dispatch-ride`) y la app del conductor (`apps/conductor/src`): login por SMS, registro, documentos, disponible con ubicación en segundo plano, ofertas y viaje.

Falta: el panel administrativo real (`apps/panel`): cola de verificación con fotos del bucket privado (URLs firmadas) y `admin_review_driver()`.

## App del conductor

- Navegación por estado en `App.tsx` (sin router): sesión → moto registrada → aprobado.
- `index.ts` importa `src/lib/location.ts` primero: la tarea de ubicación debe definirse en el ámbito global.
- No funciona en Expo Go (ubicación en segundo plano y push). Se prueba con un development build (`eas build --profile development`).
- `npx expo install` no funciona sin acceso a api.expo.dev; las versiones compatibles están en `node_modules/expo/bundledNativeModules.json`.
- Utilidades puras (teléfono, fechas, pesos, cuenta regresiva) en `packages/shared/src/format.ts`, con pruebas: `npm test -w @mototaxi/shared`.
