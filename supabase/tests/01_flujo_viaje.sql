\set ON_ERROR_STOP on
-- usuarios de prueba
insert into auth.users (id, phone, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a', '573000000001', '{"full_name":"Admin"}'),
 ('00000000-0000-0000-0000-00000000000b', '573000000002', '{"full_name":"Laura R."}'),
 ('00000000-0000-0000-0000-00000000000c', '573000000003', '{"full_name":"Carlos M."}'),
 ('00000000-0000-0000-0000-00000000000d', '573000000004', '{"full_name":"Otro Conductor"}');
update public.profiles set role = 'admin' where phone = '573000000001';

create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); end $$;

set role authenticated;

-- Conductor C se registra
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
insert into public.drivers (id, plate, moto_color) values (auth.uid(), 'ABC12D', 'roja');
insert into public.driver_documents (driver_id, type, file_path, expires_on)
select auth.uid(), t, auth.uid() || '/' || t || '.jpg', case when t in ('soat','tecnomecanica') then current_date + 200 end
from unnest(enum_range(null::public.doc_type)) t;

-- No puede auto-aprobarse
\set ON_ERROR_STOP off
update public.drivers set status = 'approved' where id = auth.uid();
-- No puede publicar ubicación sin aprobación
insert into public.driver_locations (driver_id, location, is_available) values (auth.uid(), public.make_point(4.6, -74.08), true);
\set ON_ERROR_STOP on
select 'C status' as t, status from public.drivers;

-- Admin aprueba
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.admin_review_driver('00000000-0000-0000-0000-00000000000c', 'approved');

-- Conductor publica ubicación
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
insert into public.driver_locations (driver_id, location, is_available) values (auth.uid(), public.make_point(4.6010, -74.0810), true);

-- Pasajera B: ve motos y pide viaje
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select 'cerca' as t, driver_id, distance_m from public.nearby_drivers(4.6000, -74.0800);
select 'loc directa (debe ser 0)' as t, count(*) from public.driver_locations;
select public.request_ride(4.6000, -74.0800, 'Parque', 4.6100, -74.0700, 'Centro', 6000) as ride \gset
select 'codigo visto por pasajera' as t, count(*) from public.ride_codes;

-- Conductor acepta; no ve el código
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select 'acepta' as t, public.accept_ride(:'ride');
select 'codigo visto por conductor (debe ser 0)' as t, count(*) from public.ride_codes;
select 'perfil pasajera visible' as t, full_name from public.profiles where id = '00000000-0000-0000-0000-00000000000b';

-- Otro conductor (no aprobado) no puede aceptar
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
\set ON_ERROR_STOP off
select public.accept_ride(:'ride');
\set ON_ERROR_STOP on

-- Llegada, código malo, código bueno, fin
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select public.mark_arrived(:'ride');
select 'codigo malo' as t, public.start_ride(:'ride', '0000');
reset role;
select code from public.ride_codes where ride_id = :'ride' \gset
set role authenticated;
select 'codigo bueno' as t, public.start_ride(:'ride', :'code');

-- Familiar sin sesión ve el viaje
reset role;
select share_token from public.rides where id = :'ride' \gset
set role anon;
select 'compartido' as t, driver_name, plate, status from public.shared_trip(:'share_token');

set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select 'sos' as t, public.raise_sos(:'ride', 4.605, -74.075) is not null;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select public.complete_ride(:'ride');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into public.ratings (ride_id, from_id, to_id, stars) values (:'ride', auth.uid(), '00000000-0000-0000-0000-00000000000c', 4);
select 'rating' as t, rating_avg, rating_count from public.drivers;
select 'role cambio (debe fallar)' as t;
\set ON_ERROR_STOP off
update public.profiles set role = 'admin' where id = auth.uid();
\set ON_ERROR_STOP on

set role anon;
select 'compartido tras terminar (debe ser 0 filas)' as t, count(*) from public.shared_trip(:'share_token');

reset role;
update public.driver_documents set expires_on = current_date - 1 where type = 'soat';
select 'suspendidos' as t, public.suspend_expired_drivers();
select 'final' as t, status from public.drivers;
