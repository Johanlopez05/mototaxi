# Mototaxi

App de mototaxis para la ciudad, enfocada en que el pasajero viaje tranquilo: sabe con quién se sube, alguien de confianza puede seguir el viaje en vivo y tiene un botón SOS a un toque.

## Qué hay en este repositorio

| Carpeta | Qué es | Tecnología |
| --- | --- | --- |
| `apps/pasajero` | App del pasajero: mapa, pedir viaje, compartir y SOS | React Native · Expo |
| `apps/conductor` | App del conductor: documentos, disponible, aceptar y completar viajes | React Native · Expo |
| `apps/panel` | Panel administrativo: aprobar conductores, alertas SOS, vencimientos | Next.js |
| `packages/shared` | Tipos y constantes compartidos (estados de viaje, documentos, etc.) | TypeScript |
| `supabase/migrations` | Base de datos, reglas de seguridad (RLS) y funciones del servidor | Postgres · PostGIS |
| `supabase/tests` | Prueba del flujo completo de un viaje contra Postgres local | SQL |
| `docs` | Producto, flujos y arquitectura | Markdown |

## Empezar

Requisitos: Node 20 o superior y una cuenta en [Supabase](https://supabase.com).

```bash
npm install                 # instala todas las apps (npm workspaces)

npm run pasajero            # abre la app del pasajero en Expo
npm run conductor           # abre la app del conductor en Expo
npm run panel               # panel en http://localhost:3000
```

### Base de datos

1. Crea un proyecto en Supabase.
2. En **Authentication → Providers** activa **Phone** (necesita un proveedor de SMS, por ejemplo Twilio).
3. Pega `supabase/migrations/20261015000000_fase1_base.sql` en **SQL Editor** y ejecútalo.
   Con la CLI de Supabase: `supabase link` y luego `supabase db push`.
4. Regístrate con tu número y conviértete en administrador:
   ```sql
   update public.profiles set role = 'admin' where phone = '57XXXXXXXXXX';
   ```
5. Copia `.env.example` a `.env` en cada app móvil, y a `.env.local` en `apps/panel`, y pon la URL y la anon key del proyecto.
6. Abre el panel (`npm run panel`), entra con tu número de administrador y revisa a los conductores en **Por revisar**.

### Probar la app del conductor en tu celular

La ubicación en segundo plano y las notificaciones **no funcionan en Expo Go**. Necesitas un *development build* (una versión de la app con las piezas nativas incluidas), una sola vez:

```bash
npm install -g eas-cli
cd apps/conductor
eas login                                   # cuenta gratuita en expo.dev
eas init                                    # enlaza el proyecto y guarda el projectId (lo usan las notificaciones)
eas build --profile development --platform android
```

Al terminar, EAS te da un enlace para instalar el APK en tu Android. Luego, cada vez que programes:

```bash
npm run conductor                           # abre el servidor; la app instalada se conecta sola
```

Alternativa sin EAS, con Android Studio instalado: `npx expo run:android` desde `apps/conductor`.

### Edge Functions

```bash
supabase functions deploy dispatch-ride
```

Supabase le da a la función `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`. Si activas la seguridad de push en Expo, agrega `EXPO_ACCESS_TOKEN` con `supabase secrets set`.

### Pruebas

```bash
PGHOST=localhost PGUSER=postgres npm run test:db   # base de datos (Postgres + PostGIS local)
npm run test:functions                             # Edge Functions (requiere Deno)
npm run typecheck                                  # tipos de las apps
```

## Estado

- [x] Fase 1 · Base: tablas, RLS, funciones de viaje, SOS y vencimientos
- [x] Fase 2 · Conductor y panel
  - [x] Reparto de solicitudes al conductor más cercano (`ride_offers` + Edge Function `dispatch-ride`)
  - [x] App del conductor: registro por SMS, documentos, botón disponible con ubicación en segundo plano, ofertas y viaje
  - [x] Panel: cola de verificación con fotos privadas y aprobar, pedir corrección, suspender o rechazar
- [ ] Fase 3 · Pasajero y viaje: mapa, pedir, asignar, código de 4 dígitos, completar
- [ ] Fase 4 · Capa de seguridad: compartir viaje, contactos de confianza, SOS, vencimientos
- [ ] Fase 5 · Piloto con 10–20 conductores en un sector

Detalle en [`docs/producto.md`](docs/producto.md) y [`docs/arquitectura.md`](docs/arquitectura.md).

## Diseño

- [Pantallas del pasajero, conductor y panel](https://claude.ai/artifact/SLNVahLWLJXJ4jHQXzFxzu) (lienzo de diseño)
- [Documento de flujos y arquitectura](https://claude.ai/code/artifact/92b00f94-ced3-471c-a037-5bef5e2e539e)
