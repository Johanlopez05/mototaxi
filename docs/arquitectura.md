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

## Asignación de un viaje

1. `request_ride()` crea el viaje en estado `searching` y genera el código.
2. Una Edge Function busca con PostGIS los conductores aprobados y disponibles en 2 km.
3. Envía la solicitud por push al más cercano; 15 s para responder.
4. Si rechaza o no responde, pasa al siguiente; tras 3 intentos amplía el radio o avisa al pasajero.
5. `accept_ride()` asigna de forma atómica: si dos aceptan a la vez, solo gana el primero.

Los conductores **no pueden listar viajes en búsqueda** (RLS): así nadie escoge solo los viajes que le convienen.

## Estados de un viaje

`searching → assigned → arrived → in_progress → completed`, o `cancelled` antes de iniciar.

| Paso | Quién | Función |
| --- | --- | --- |
| Pedir | Pasajero | `request_ride()` |
| Aceptar | Conductor | `accept_ride()` |
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
| `ratings` | Calificaciones |
| `trusted_contacts` | Contactos de confianza del pasajero |
| `sos_alerts` | Alertas de emergencia |

## Reglas de seguridad

- RLS en todas las tablas: cada quien ve solo lo suyo.
- Estados importantes solo se cambian desde funciones del servidor.
- Documentos en el bucket privado `driver-documents`, ruta `<id del conductor>/<tipo>.jpg`.
- El enlace compartido deja de funcionar cuando el viaje termina.
- Datos personales: Ley 1581 de 2012. Política de privacidad y autorización explícita al registrarse.
