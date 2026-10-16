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
- **Llaves de Supabase:** las anon/service_role se retiran a finales de 2026. En apps y panel la variable `*_SUPABASE_ANON_KEY` lleva la **publishable key** (`sb_publishable_…`). En Edge Functions usa `supabaseKey()` de `supabase/functions/_shared/keys.ts` (nuevas con respaldo en las anteriores).
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

## Siguiente paso (fase 5)

Fases 1 a 4 completas. La 4 (seguridad): `/v/<token>` público en el panel, contactos de confianza, SOS (pasajero y conductor) con la Edge Function `sos-alert` (SMS por Twilio), y en el panel `/alertas` y `/vencimientos`.

Sigue la fase 5, piloto: desplegar (Supabase, panel en Vercel, builds de EAS), configurar secretos (`SHARE_BASE_URL`, Twilio) y probar con 10–20 conductores en un sector. Ya está la autorización de datos (Ley 1581): `/privacidad` en el panel y la casilla obligatoria en ambas apps. Pendientes conocidos: llenar los datos del responsable en `packages/shared/src/legal.ts`, tarea de borrado según los plazos de conservación, calificaciones en la app, contactos de confianza para conductores, "eliminar mi cuenta".

## Autorización de datos (Ley 1581)

- Datos del responsable, versión de la política y textos de las casillas: SOLO en `packages/shared/src/legal.ts`.
- `privacy_policy` (una fila con la versión vigente) y `privacy_consents` (prueba de cada autorización; no se edita ni se borra). Alcances: `general` y `biometric` (selfie del conductor, dato sensible).
- El servidor lo exige: `request_ride()` pide `general`; `submit_for_review()` y subir la selfie piden las dos.
- Cambiar la política = migración que actualice `privacy_policy.version` + mismo valor en `PRIVACY_POLICY_VERSION` (una prueba de shared lo verifica). Todos vuelven a aceptar.
- Las apps muestran `Autorizacion.tsx` (copia en pasajero y conductor) justo después del login; las casillas empiezan sin marcar.
- Pruebas 01–05 usan `supabase/tests/_consentir_todos.sql`; la 06 prueba la autorización sin esa ayuda.

## Capa de seguridad

- Página pública `apps/panel/src/app/v/[token]`: `proxy.ts` deja pasar `/v/` sin sesión; consulta `shared_trip()` con un cliente anónimo SIN cookies (`src/lib/shared-trip.ts`) y se refresca cada 10 s.
- La hora de la petición en páginas del panel se toma con `requestTime()` (`src/lib/time.ts`): el lint de React no permite `Date.now()` al renderizar y `cacheComponents` exige esperar la petición.
- SOS: la app llama `raise_sos()` y luego `functions.invoke('sos-alert')`. Si algo falla, siempre ofrece llamar al 123. El botón se mantiene 3 s (`SosButton`, copia en pasajero y conductor: si cambias uno, cambia el otro).

## App del pasajero

- Navegación por estado en `App.tsx` (sin router): sesión → nombre → viaje activo / resumen / pedir.
- Funciona en Expo Go: ubicación solo en primer plano, mapa con `react-native-maps`, direcciones con el geocodificador del teléfono (sin llaves de API).
- La tarifa la calcula el servidor (`estimate_fare()`, tabla `fare_settings`); `request_ride()` no la recibe.
- `passenger_ride()` trae el viaje con conductor, moto, ubicación y código; la app la vuelve a leer con cada cambio de `rides` y `driver_locations` (Realtime) y cada 10 s.
- La foto del conductor es la selfie del bucket privado, con URL firmada; la política solo la deja ver mientras el viaje está activo.
- `src/ui.tsx` es copia de la del conductor: si cambias una, cambia la otra.

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
