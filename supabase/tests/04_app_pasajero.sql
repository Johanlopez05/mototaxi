-- Prueba de las funciones de la app del pasajero (fase 3).
\set ON_ERROR_STOP on

create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); end $$;
create or replace function pg_temp.check(ok boolean, msg text) returns text language plpgsql as $$
begin
  if ok is not true then raise exception 'FALLÓ: %', msg; end if;
  return 'ok · ' || msg;
end $$;
-- Corre `sql` y exige que falle con un mensaje que contenga `expected`
create or replace function pg_temp.must_fail(sql text, expected text, msg text) returns text language plpgsql as $$
begin
  execute sql;
  raise exception 'FALLÓ: %', msg;
exception when others then
  if sqlerrm like 'FALLÓ%' then raise; end if;
  if position(expected in sqlerrm) = 0 then raise exception 'FALLÓ: % (error inesperado: %)', msg, sqlerrm; end if;
  return 'ok · ' || msg;
end $$;

insert into auth.users (id, phone, raw_user_meta_data) values
 ('00000000-0000-0000-0000-0000000000a1', '573400000001', '{"full_name":"Paula Gómez"}'),
 ('00000000-0000-0000-0000-0000000000a2', '573400000002', '{"full_name":"Otro Pasajero"}'),
 ('00000000-0000-0000-0000-0000000000a3', '573400000003', '{"full_name":"Jorge Iván Peña"}');

-- Conductor aprobado y conectado cerca del punto de recogida
insert into public.drivers (id, plate, moto_color, moto_brand, status)
values ('00000000-0000-0000-0000-0000000000a3', 'JIP45E', 'azul', 'Yamaha', 'approved');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
select public.set_my_location(6.2500, -75.5700, true, 45::smallint);

-- 1. Tarifa por distancia, calculada en el servidor
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.check((select fare = 5000 from public.estimate_fare(6.2500, -75.5700, 6.2510, -75.5710)),
                     'viaje corto: tarifa mínima de $5.000');
-- 4,4 km en línea recta × 1,3 ≈ 5,75 km → 3.000 + 5.750 = 8.750 → $9.000
select pg_temp.check((select fare = 9000 and distance_m between 5700 and 5800
                        from public.estimate_fare(6.2500, -75.5700, 6.2900, -75.5700)),
                     '≈ 5,75 km por calles: base + por km, redondeada hacia arriba a $500');
select pg_temp.must_fail($$select * from public.estimate_fare(6.2500, -75.5700, 6.2500, -75.5700)$$,
                         'muy cerca', 'origen y destino iguales');
select pg_temp.must_fail($$select * from public.estimate_fare(6.2500, -75.5700, 6.6000, -75.5700)$$,
                         'demasiado lejos', 'destino a más de 30 km');
select pg_temp.must_fail($$select * from public.estimate_fare(95, -75.5700, 6.25, -75.57)$$,
                         'no válida', 'latitud imposible');

-- Los valores de la tarifa son de solo lectura para las apps
select pg_temp.check((select base_cop = 3000 from public.fare_settings), 'cualquiera puede leer los valores de la tarifa');
do $$ begin
  update public.fare_settings set base_cop = 1;
  raise exception 'FALLÓ: un usuario cambió la tarifa';
exception when insufficient_privilege then null;
end $$;
select 'ok · nadie cambia la tarifa desde la app';

-- 2. Pedir: la tarifa del viaje es la del servidor; ya no existe la versión que la recibía de la app
select pg_temp.must_fail($$select public.request_ride(6.25, -75.57, 'A', 6.29, -75.57, 'B', 1)$$,
                         'does not exist', 'la app ya no puede mandar su propia tarifa');
select public.request_ride(6.2501, -75.5701, 'Parque Berrío', 6.2900, -75.5700, 'Hospital') as ride \gset
select pg_temp.check((select r.fare = e.fare from public.rides r,
                             public.estimate_fare(6.2501, -75.5701, 6.2900, -75.5700) e
                       where r.id = :'ride'), 'el viaje queda con la tarifa calculada en el servidor');
select pg_temp.must_fail($$select public.request_ride(6.25, -75.57, 'A', 6.26, -75.58, 'B')$$,
                         'viaje activo', 'no puede pedir dos viajes a la vez');

-- 3. Buscando: ve su viaje y su código, todavía sin conductor
select pg_temp.check((select status = 'searching' and code ~ '^[0-9]{4}$' and driver_id is null
                             and cancel_reason is null and origin_address = 'Parque Berrío'
                        from public.passenger_ride()), 'buscando: ve su código y aún no hay conductor');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select pg_temp.check(not exists (select 1 from public.passenger_ride(:'ride')), 'otro pasajero no ve ese viaje');

-- 4. Asignado: ve al conductor, la moto y su ubicación
reset role;
select pg_temp.check((select driver_id from public.dispatch_next_offer(:'ride')) = '00000000-0000-0000-0000-0000000000a3',
                     'se le ofrece al conductor cercano');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
select pg_temp.check(public.accept_ride(:'ride'), 'el conductor acepta');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.check((select status = 'assigned' and plate = 'JIP45E' and driver_name = 'Jorge Iván Peña'
                             and moto_brand = 'Yamaha' and abs(driver_lat - 6.25) < 0.0001 and driver_heading = 45
                             and code is not null
                        from public.passenger_ride()), 'asignado: ve placa, nombre, moto, ubicación y su código');

-- 5. Foto del conductor: solo la selfie y solo de SU conductor mientras el viaje está activo
reset role;
insert into storage.objects (bucket_id, name) values
  ('driver-documents', '00000000-0000-0000-0000-0000000000a3/selfie.jpg'),
  ('driver-documents', '00000000-0000-0000-0000-0000000000a3/cedula.jpg');
set role authenticated;
select pg_temp.check((select count(*) = 1 and bool_and(name like '%/selfie.jpg') from storage.objects),
                     'la pasajera ve la selfie de su conductor y no su cédula');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select pg_temp.check((select count(*) = 0 from storage.objects), 'otro pasajero no ve ninguna foto');

-- 6. En viaje: ya no se entrega el código
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
select public.mark_arrived(:'ride');
reset role;
select code from public.ride_codes where ride_id = :'ride' \gset
set role authenticated;
select pg_temp.check(public.start_ride(:'ride', :'code'), 'inicia con el código');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.check((select status = 'in_progress' and code is null from public.passenger_ride()),
                     'en viaje: el código ya no se muestra');

-- 7. Terminado: ya no es su viaje activo, pero lo puede consultar por id; la foto deja de verse
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
select public.complete_ride(:'ride');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.check(not exists (select 1 from public.passenger_ride()), 'terminado: ya no hay viaje activo');
select pg_temp.check((select status = 'completed' and driver_lat is null and completed_at is not null
                        from public.passenger_ride(:'ride')), 'terminado: lo ve por id, sin la ubicación del conductor');
select pg_temp.check((select count(*) = 0 from storage.objects), 'terminado: ya no ve la foto del conductor');

-- 8. Motivo de cancelación
select public.request_ride(6.2501, -75.5701, 'Casa', 6.2600, -75.5800, 'Trabajo') as ride2 \gset
select public.cancel_ride(:'ride2');
select pg_temp.check((select cancel_reason = 'passenger' from public.passenger_ride(:'ride2')), 'cancelado por la pasajera');

select public.request_ride(6.2501, -75.5701, 'Casa', 6.2600, -75.5800, 'Trabajo') as ride3 \gset
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
select public.go_offline();
reset role;
select pg_temp.check((select outcome from public.dispatch_next_offer(:'ride3')) = 'no_drivers', 'sin motos disponibles');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.check((select cancel_reason = 'no_drivers' from public.passenger_ride(:'ride3')), 'cancelado por falta de motos');
reset role;

select 'TODAS LAS PRUEBAS DE LA APP DEL PASAJERO PASARON' as resultado;
