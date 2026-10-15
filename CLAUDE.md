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

## Siguiente paso (fase 3)

Fase 2 completa: reparto de solicitudes (`ride_offers`, `dispatch_next_offer()`, Edge Function `dispatch-ride`), la app del conductor (`apps/conductor/src`) y el panel con la cola de verificación (`apps/panel`).

Sigue la fase 3, app del pasajero: mapa con `nearby_drivers()`, pedir con `request_ride()` + `dispatch-ride`, ver al conductor y el código de 4 dígitos.

## Panel administrativo

- Next.js 16 con `cacheComponents`: todo lo que lee la sesión, `params` o `searchParams` va dentro de `<Suspense>`. Lee `node_modules/next/dist/docs/` (en `apps/panel`) antes de usar una API de Next.
- Sesión de Supabase en cookies con `@supabase/ssr` (`src/lib/supabase.ts`); `src/proxy.ts` la renueva y manda a `/login` a quien no tenga sesión.
- `requireAdmin()` (`src/lib/auth.ts`) en cada consulta y cada Server Action. Solo anon key: los permisos los dan RLS e `is_admin()`.
- Fotos de documentos con URLs firmadas de 10 min (`createSignedUrls`), nunca públicas.
- Decisiones con `admin_review_driver()`. Antes de aprobar se revisa `reviewChecklist()` (`packages/shared/src/review.ts`), más estricta que la función SQL: exige fecha en SOAT y técnico-mecánica.
- `.env.local` con `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (ver `.env.example`).
- `npm run lint -w @mototaxi/panel` falla porque `next` queda instalado en `apps/panel/node_modules` y `eslint-config-next` en la raíz. Mientras tanto: `NODE_PATH=apps/panel/node_modules`.

## App del conductor

- Navegación por estado en `App.tsx` (sin router): sesión → moto registrada → aprobado.
- `index.ts` importa `src/lib/location.ts` primero: la tarea de ubicación debe definirse en el ámbito global.
- No funciona en Expo Go (ubicación en segundo plano y push). Se prueba con un development build (`eas build --profile development`).
- `npx expo install` no funciona sin acceso a api.expo.dev; las versiones compatibles están en `node_modules/expo/bundledNativeModules.json`.
- Utilidades puras (teléfono, fechas, pesos, cuenta regresiva) en `packages/shared/src/format.ts`, y la revisión de documentos en `review.ts`, con pruebas: `npm test -w @mototaxi/shared`.
