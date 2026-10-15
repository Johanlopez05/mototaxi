# Producto

La promesa: **viajar en mototaxi con tranquilidad.** Todo conductor está verificado antes de trabajar, el pasajero sabe con quién se sube y alguien de confianza puede seguir el viaje.

## Tres partes

- **App del pasajero:** pide viajes y ve los mototaxis disponibles en el mapa.
- **App del conductor:** sube sus documentos, se pone disponible y comparte su ubicación en vivo.
- **Panel administrativo (web):** revisa y aprueba a cada conductor antes de que pueda trabajar.

## Flujo del pasajero

1. **Abre la app:** ve el mapa con su ubicación y los mototaxis disponibles cerca.
2. **Marca el destino:** escribe la dirección o la señala en el mapa.
3. **Ve el estimado:** precio aproximado y tiempo de llegada.
4. **Pide el viaje:** la solicitud llega al conductor más cercano.
5. **Ve al conductor:** foto, nombre, placa, calificación y la moto acercándose; recibe un **código de 4 dígitos**.
6. **Viaja seguro:** comparte el viaje en vivo con un familiar o activa el SOS (mantener presionado 3 s).
7. **Llega y califica:** paga (efectivo en el MVP) y califica al conductor.

## Flujo del conductor

1. **Se registra:** cédula, licencia, SOAT, técnico-mecánica, selfie y foto de la moto con la placa.
2. **Espera aprobación:** si algo falta o no es válido, lo corrige y lo reenvía.
3. **Se pone disponible:** la app envía su ubicación cada pocos segundos.
4. **Recibe una solicitud:** recogida, destino y tarifa; 15 segundos para aceptar o rechazar.
5. **Recoge al pasajero:** marca que llegó y **pide el código de 4 dígitos**; sin el código correcto no puede iniciar.
6. **Completa el viaje:** cobra y vuelve a quedar disponible.

## Panel administrativo

- Cola de verificación con los 6 documentos de cada conductor.
- Decisiones: aprobar, pedir corrección o rechazar.
- Alertas cuando SOAT o técnico-mecánica están por vencer; suspensión automática al vencer.
- Mapa general, alertas SOS y reportes.

## MVP

**Entra:** registro, documentos y aprobación, mapa en tiempo real, pedir/aceptar/completar, ficha del conductor, código de 4 dígitos, compartir viaje.

**Seguridad (fase 4):** compartir el viaje en vivo con un enlace, hasta 5 contactos de confianza, SOS (mantener 3 s) que avisa por SMS a los contactos y al panel, y vencimientos de SOAT y técnico-mecánica en el panel.

**Después:** calificaciones, pagos en la app, historial y ganancias detalladas.

## Tarifa

Por distancia, calculada siempre en el servidor (`estimate_fare()`): $3.000 de base + $1.000 por km, con la distancia en línea recta × 1,3 para aproximar las calles. Mínimo $5.000, redondeada hacia arriba a $500, máximo 30 km. Los valores están en la tabla `fare_settings`.

## Pendiente por decidir

- Nombre definitivo de la app (por ahora `mototaxi`).
