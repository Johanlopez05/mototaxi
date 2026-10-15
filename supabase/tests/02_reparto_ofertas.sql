-- Prueba del reparto de solicitudes (fase 2). Cada paso verifica su resultado:
-- si algo no cumple, la prueba se detiene con "FALLÓ: ...".
\set ON_ERROR_STOP on

create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); end $$;
create or replace function pg_temp.check(ok boolean, msg text) returns text language plpgsql as $$
begin
  if ok is not true then raise exception 'FALLÓ: %', msg; end if;
  return 'ok · ' || msg;
end $$;

-- Pasajeros p2, p3 y tres conductores aprobados a 500 m, 1,5 km y 3 km del origen
insert into auth.users (id, phone, raw_user_meta_data) values
 ('00000000-0000-0000-0000-0000000000b2', '573100000002', '{"full_name":"Marta Díaz"}'),
 ('00000000-0000-0000-0000-0000000000b3', '573100000003', '{"full_name":"Pedro Gil"}'),
 ('00000000-0000-0000-0000-0000000000e1', '573200000001', '{"full_name":"Cerca Uno"}'),
 ('00000000-0000-0000-0000-0000000000e2', '573200000002', '{"full_name":"Medio Dos"}'),
 ('00000000-0000-0000-0000-0000000000e3', '573200000003', '{"full_name":"Lejos Tres"}');
insert into public.drivers (id, plate, status) values
 ('00000000-0000-0000-0000-0000000000e1', 'EEE11A', 'approved'),
 ('00000000-0000-0000-0000-0000000000e2', 'EEE22B', 'approved'),
 ('00000000-0000-0000-0000-0000000000e3', 'EEE33C', 'approved');
insert into public.driver_locations (driver_id, location, is_available) values
 ('00000000-0000-0000-0000-0000000000e1', public.make_point(4.7045, -74.05), true),
 ('00000000-0000-0000-0000-0000000000e2', public.make_point(4.7135, -74.05), true),
 ('00000000-0000-0000-0000-0000000000e3', public.make_point(4.7270, -74.05), true);
update public.profiles set push_token = 'ExponentPushToken[e1]' where id = '00000000-0000-0000-0000-0000000000e1';

-- 1. La pasajera pide un viaje
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select public.request_ride(4.70, -74.05, 'Parque', 4.69, -74.06, 'Terminal', 7000) as ride \gset
reset role;

-- 2. Primera oferta: al más cercano, con su token push
select outcome, driver_id, push_token, distance_m from public.dispatch_next_offer(:'ride') \gset o_
select pg_temp.check(:'o_outcome' = 'offered' and :'o_driver_id' = '00000000-0000-0000-0000-0000000000e1', 'oferta al conductor más cercano');
select pg_temp.check(:'o_push_token' = 'ExponentPushToken[e1]' and :o_distance_m between 450 and 550, 'trae token y distancia (~500 m)');

-- 3. Mientras la oferta está vigente, el servidor espera
select pg_temp.check((select outcome from public.dispatch_next_offer(:'ride')) = 'waiting', 'no ofrece a otro mientras hay oferta vigente');

-- 4. Un conductor al que NO se le ofreció no puede aceptar
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
\o /dev/null
select set_config('my.ride', :'ride', false);
\o
do $$ begin
  perform public.accept_ride(current_setting('my.ride')::uuid);
  raise exception 'FALLÓ: aceptó sin oferta';
exception when others then
  if sqlerrm like 'FALLÓ%' then raise; end if;
end $$;
select 'ok · sin oferta no se puede aceptar';

-- 5. El conductor 1 ve su oferta (con el primer nombre de la pasajera) y la rechaza
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select pg_temp.check((select passenger_first_name from public.current_offer()) = 'Marta', 'el conductor ve su oferta y el nombre de la pasajera');
select public.reject_offer(:'ride');
reset role;
select pg_temp.check((select driver_id from public.dispatch_next_offer(:'ride')) = '00000000-0000-0000-0000-0000000000e2', 'al rechazar pasa al segundo más cercano');

-- 6. El conductor 2 no responde a tiempo: se amplía el radio y llega al de 3 km
update public.ride_offers set expires_at = now() - interval '1 second'
 where ride_id = :'ride' and status = 'pending';
select pg_temp.check((select driver_id from public.dispatch_next_offer(:'ride')) = '00000000-0000-0000-0000-0000000000e3', 'sin respuesta: amplía a 4 km y ofrece al tercero');
select pg_temp.check((select status from public.ride_offers
                       where ride_id = :'ride' and driver_id = '00000000-0000-0000-0000-0000000000e2') = 'expired', 'la oferta sin respuesta queda vencida');

-- 7. El conductor 2 ya no puede aceptar su oferta vencida; el 3 sí acepta
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
do $$ begin
  perform public.accept_ride(current_setting('my.ride')::uuid);
  raise exception 'FALLÓ: aceptó una oferta vencida';
exception when others then
  if sqlerrm like 'FALLÓ%' then raise; end if;
end $$;
select 'ok · una oferta vencida no se puede aceptar';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e3');
select pg_temp.check(public.accept_ride(:'ride'), 'el tercer conductor acepta');
reset role;
select pg_temp.check((select outcome from public.dispatch_next_offer(:'ride')) = 'assigned', 'el reparto se detiene al asignarse');
select pg_temp.check((select is_available from public.driver_locations
                       where driver_id = '00000000-0000-0000-0000-0000000000e3') = false, 'el conductor asignado deja de estar disponible');

-- 8. Otro pasajero lejos de todos: se cancela por falta de motos
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b3');
select public.request_ride(5.20, -74.00, 'Vereda', 5.21, -74.01, 'Pueblo', 5000) as ride2 \gset
reset role;
select pg_temp.check((select outcome from public.dispatch_next_offer(:'ride2')) = 'no_drivers', 'sin motos cerca responde no_drivers');
select pg_temp.check((select status from public.rides where id = :'ride2') = 'cancelled', 'y el viaje queda cancelado');

-- 9. Un pasajero no puede llamar al reparto directamente
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b3');
do $$ begin
  perform public.dispatch_next_offer(gen_random_uuid());
  raise exception 'FALLÓ: un pasajero pudo llamar al reparto';
exception when insufficient_privilege then null;
end $$;
select 'ok · solo el servidor puede repartir';
reset role;

select 'TODAS LAS PRUEBAS DE REPARTO PASARON' as resultado;
