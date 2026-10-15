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
5. Copia `.env.example` a `.env` en cada app y pon la URL y la anon key del proyecto.

## Estado

- [x] Fase 1 · Base: tablas, RLS, funciones de viaje, SOS y vencimientos
- [ ] Fase 2 · Conductor y panel: subir documentos, aprobar, botón disponible con ubicación
- [ ] Fase 3 · Pasajero y viaje: mapa, pedir, asignar, código de 4 dígitos, completar
- [ ] Fase 4 · Capa de seguridad: compartir viaje, contactos de confianza, SOS, vencimientos
- [ ] Fase 5 · Piloto con 10–20 conductores en un sector

Detalle en [`docs/producto.md`](docs/producto.md) y [`docs/arquitectura.md`](docs/arquitectura.md).

## Diseño

- [Pantallas del pasajero, conductor y panel](https://claude.ai/artifact/SLNVahLWLJXJ4jHQXzFxzu) (lienzo de diseño)
- [Documento de flujos y arquitectura](https://claude.ai/code/artifact/92b00f94-ced3-471c-a037-5bef5e2e539e)
