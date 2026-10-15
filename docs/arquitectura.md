# Arquitectura

Las dos apps móviles y el panel web comparten **un único backend en Supabase**. No hay servidores propios que administrar.

```
 App del pasajero        App del conductor        Panel administrativo
 (React Native·Expo)     (React Native·Expo)      (Next.js)
          \                     |                     /
           \                    |                    /
   ┌───────────────────────────────────────────────────────────┐
   │ Supabase                                                   │
   │  Auth (SMS) · Postgres+PostGIS · Realtime · Storage ·       │
   │  Edge Functions (asignar viajes, SOS)                        │
   └───────────────────────────────────────────────────────────┘
           /                    |                    \
   Google Maps           Notificaciones push           SMS
   (mapa y rutas)        (solicitudes al conductor)    (códigos y SOS)
```

## Ubicación en tiempo real

- **Disponible, sin viaje:** el conductor guarda su posición en `driver_locations` cada 10–15 s. Alimenta `nearby_drivers()`.
- **En viaje:** transmite cada 3–5 s por un canal de Realtime del viaje; lo escuchan el pasajero y su contacto de confianza.
- **Segundo plano:** `expo-location` + `expo-task-manager` (Android exige notificación fija).

## Asignación de un viaje (implementado en fase 2)

1. El pasajero ve el precio con `estimate_fare()` y llama `request_ride()`: crea el viaje en estado `searching`, con la tarifa calculada en el servidor, y genera el código.
2. Luego invoca la Edge Function `dispatch-ride` con el `ride_id`. Responde 202 y reparte en segundo plano.
3. La función llama `dispatch_next_offer()` (solo service role): crea una **oferta** en `ride_offers` para el conductor aprobado, disponible y con ubicación fresca **más cercano**, válida 15 s.
4. Envía el push por Expo. Si el push falla, el conductor igual ve la oferta: la app escucha `ride_offers` por Realtime y al abrir llama `current_offer()`.
5. El conductor responde con `accept_ride()` o `reject_offer()`. Sin respuesta, la oferta vence.
6. Se ofrece al siguiente: las 3 primeras ofertas buscan a 2 km, las siguientes a 4 km. Tras 6 ofertas sin éxito, el viaje se cancela y se avisa al pasajero.
7. `accept_ride()` **exige una oferta vigente** para ese conductor y asigna de forma atómica.

Un conductor nunca recibe dos ofertas a la vez, y nadie puede listar ni escoger viajes por su cuenta (RLS).

```
pasajero ─ request_ride() ─► rides (searching)
pasajero ─ invoke('dispatch-ride') ─► Edge Function
                                        │ loop (máx. 110 s)
                                        ├─ dispatch_next_offer() ─► ride_offers (pending, 15 s)
                                        ├─ push Expo ─► conductor
                                        └─ espera respuesta o vencimiento
conductor ─ accept_ride() ─► rides (assigned) ─► Realtime ─► pasajero
```

Archivos: `supabase/migrations/20261015010000_fase2_ofertas.sql` y `supabase/functions/dispatch-ride/`.

## Estados de un viaje

`searching → assigned → arrived → in_progress → completed`, o `cancelled` antes de iniciar.

| Paso | Quién | Función |
| --- | --- | --- |
| Precio estimado | Pasajero | `estimate_fare()` |
| Pedir | Pasajero | `request_ride()` + Edge Function `dispatch-ride` |
| Ver su viaje, conductor y código | Pasajero | `passenger_ride()` |
| Ofrecer al más cercano | Servidor | `dispatch_next_offer()` |
| Enviar documentos a revisión | Conductor | `submit_for_review()` (exige 6 vigentes) |
| Reportar ubicación | Conductor (tarea en segundo plano) | `set_my_location()` |
| Desconectarse | Conductor | `go_offline()` |
| Ver oferta vigente | Conductor | `current_offer()` |
| Ver su viaje en curso | Conductor | `driver_active_ride()` |
| Aceptar | Conductor | `accept_ride()` (exige oferta vigente) |
| Rechazar | Conductor | `reject_offer()` |
| Llegué | Conductor | `mark_arrived()` |
| Iniciar con código | Conductor | `start_ride()` (5 intentos máx.) |
| Terminar | Conductor | `complete_ride()` |
| Cancelar | Cualquiera de los dos | `cancel_ride()` |
| SOS | Cualquiera de los dos | `raise_sos()` |
| Ver viaje compartido | Familiar, sin sesión | `shared_trip(token)` |
| Aprobar conductor | Admin | `admin_review_driver()` |
| Suspender vencidos | Tarea diaria | `suspend_expired_drivers()` |

## Modelo de datos

| Tabla | Qué guarda |
| --- | --- |
| `profiles` | Toda persona registrada, con su rol |
| `drivers` | Placa, moto, estado de verificación y calificación |
| `driver_documents` | Cada documento, su vencimiento y la revisión |
| `driver_locations` | Última posición y disponibilidad |
| `rides` | Cada viaje y la hora de cada cambio de estado |
| `ride_codes` | Código de 4 dígitos (solo lo lee el pasajero) |
| `ride_offers` | Cada oferta de un viaje a un conductor, con su vencimiento |
| `ratings` | Calificaciones |
| `trusted_contacts` | Contactos de confianza del pasajero |
| `sos_alerts` | Alertas de emergencia |

## Reglas de seguridad

- RLS en todas las tablas: cada quien ve solo lo suyo.
- Estados importantes solo se cambian desde funciones del servidor.
- Documentos en el bucket privado `driver-documents`, ruta `<id del conductor>/<tipo>.jpg`.
- El enlace compartido deja de funcionar cuando el viaje termina.
- Datos personales: Ley 1581 de 2012. Política de privacidad y autorización explícita al registrarse.
