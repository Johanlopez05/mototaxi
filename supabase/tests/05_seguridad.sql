-- Prueba de la capa de seguridad (fase 4): contactos, viaje compartido, SOS y panel.
\set ON_ERROR_STOP on

create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); end $$;
create or replace function pg_temp.check(ok boolean, msg text) returns text language plpgsql as $$
begin
  if ok is not true then raise exception 'FALLÓ: %', msg; end if;
  return 'ok · ' || msg;
end $$;

-- Pasajera, conductor aprobado y disponible, y una administradora
insert into auth.users (id, phone, raw_user_meta_data) values
 ('00000000-0000-0000-0000-000000000051', '573400000001', '{"full_name":"Lucía Gómez"}'),
 ('00000000-0000-0000-0000-000000000052', '573400000002', '{"full_name":"Mario Rueda"}'),
 ('00000000-0000-0000-0000-000000000053', '573400000003', '{"full_name":"Admin Turno"}'),
 ('00000000-0000-0000-0000-000000000054', '573400000004', '{"full_name":"Otro Pasajero"}');
\ir _consentir_todos.sql
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000053';
insert into public.drivers (id, plate, moto_color, status) values ('00000000-0000-0000-0000-000000000052', 'SEG44D', 'azul', 'approved');
insert into public.driver_documents (driver_id, type, file_path, expires_on, status)
select '00000000-0000-0000-0000-000000000052', t, 'x/' || t || '.jpg',
       case t when 'soat' then current_date + 5 when 'tecnomecanica' then current_date + 200 end, 'approved'
  from unnest(enum_range(null::public.doc_type)) t;

-- 1. Contactos de confianza
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000051');
insert into public.trusted_contacts (profile_id, name, phone) values (auth.uid(), 'Mamá', '+573001112233');
do $$ begin
  insert into public.trusted_contacts (profile_id, name, phone) values (auth.uid(), 'Fijo', '+5716011234');
  raise exception 'FALLÓ: aceptó un teléfono que no es celular';
exception when check_violation then null;
end $$;
select 'ok · solo celulares colombianos en formato +573…';
do $$ begin
  insert into public.trusted_contacts (profile_id, name, phone) values (auth.uid(), 'Mamá otra vez', '+573001112233');
  raise exception 'FALLÓ: aceptó un contacto repetido';
exception when unique_violation then null;
end $$;
select 'ok · no acepta el mismo número dos veces';
insert into public.trusted_contacts (profile_id, name, phone)
select auth.uid(), 'Contacto ' || i, '+57300111220' || i from generate_series(1, 4) i;
do $$ begin
  insert into public.trusted_contacts (profile_id, name, phone) values (auth.uid(), 'Sexto', '+573009999999');
  raise exception 'FALLÓ: aceptó un sexto contacto';
exception when others then
  if sqlerrm like 'FALLÓ%' then raise; end if;
end $$;
select 'ok · máximo 5 contactos';
select pg_temp.as_user('00000000-0000-0000-0000-000000000054');
select pg_temp.check((select count(*) from public.trusted_contacts) = 0, 'nadie ve los contactos de otra persona');

-- 2. Viaje: el conductor se conecta, la pasajera pide, él acepta
select pg_temp.as_user('00000000-0000-0000-0000-000000000052');
select public.set_my_location(4.6500, -74.0600, true);
select pg_temp.as_user('00000000-0000-0000-0000-000000000051');
select public.request_ride(4.6505, -74.0605, 'Calle 72', 4.6700, -74.0500, 'Universidad') as ride \gset
reset role;
select pg_temp.check((select driver_id from public.dispatch_next_offer(:'ride')) = '00000000-0000-0000-0000-000000000052', 'oferta al conductor');
select share_token from public.rides where id = :'ride' \gset
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000052');
select pg_temp.check(public.accept_ride(:'ride'), 'acepta');

-- 3. La familia abre el enlace sin sesión
set role anon;
select pg_temp.check((select passenger_first_name = 'Lucía' and driver_name = 'Mario Rueda' and plate = 'SEG44D'
                        and driver_lat is not null and not sos_open
                        from public.shared_trip(:'share_token')), 'enlace: ve conductor, placa y ubicación');
select pg_temp.check(not exists (select 1 from public.shared_trip(gen_random_uuid())), 'un token inventado no muestra nada');

-- 4. SOS de la pasajera: no se duplica si presiona varias veces
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000051');
select public.raise_sos(:'ride', 4.6550, -74.0580) as alert \gset
select pg_temp.check(public.raise_sos(:'ride', 4.6560, -74.0570) = :'alert', 'presionar otra vez no crea otra alerta');
set role anon;
select pg_temp.check((select sos_open from public.shared_trip(:'share_token')), 'el enlace muestra que hay una emergencia');

-- 5. Solo el servidor lee el contexto del SOS (con los contactos)
set role authenticated;
do $$ begin
  perform public.sos_alert_context(current_setting('my.alert', true)::uuid);
  raise exception 'FALLÓ: un usuario leyó el contexto del SOS';
exception when insufficient_privilege then null;
end $$;
select 'ok · un usuario no puede leer el contexto del SOS';
reset role;
select pg_temp.check((select (c ->> 'person_name') = 'Lucía Gómez' and jsonb_array_length(c -> 'contacts') = 5
                             and (c ->> 'plate') = 'SEG44D' and (c ->> 'share_token') = :'share_token'
                             and abs((c ->> 'lat')::float - 4.6560) < 0.00001
                        from public.sos_alert_context(:'alert') c), 'contexto: nombre, 5 contactos, placa, enlace y última ubicación');
select public.mark_sos_notified(:'alert', 5);

-- 6. Panel: la administradora ve la alerta, la atiende y la cierra
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000051');
do $$ begin
  perform * from public.admin_sos_alerts();
  raise exception 'FALLÓ: una pasajera vio las alertas del panel';
exception when others then
  if sqlerrm like 'FALLÓ%' then raise; end if;
end $$;
select 'ok · solo administradores ven las alertas';
select pg_temp.as_user('00000000-0000-0000-0000-000000000053');
select pg_temp.check((select raised_by_role = 'passenger' and driver_name = 'Mario Rueda' and notified_count = 5
                             and passenger_phone = '573400000001' and share_token::text = :'share_token'
                        from public.admin_sos_alerts() where alert_id = :'alert'), 'el panel ve quién, dónde, conductor y avisos enviados');
select public.admin_update_sos(:'alert', 'attending');
\o /dev/null
select set_config('my.alert', :'alert', false);
\o
do $$ begin
  perform public.admin_update_sos(current_setting('my.alert')::uuid, 'closed', '   ');
  raise exception 'FALLÓ: cerró sin escribir qué pasó';
exception when others then
  if sqlerrm like 'FALLÓ%' then raise; end if;
end $$;
select 'ok · para cerrar hay que escribir qué pasó';
select public.admin_update_sos(:'alert', 'closed', 'Llamamos a la pasajera: todo bien, se activó por error.');
select pg_temp.check(not exists (select 1 from public.admin_sos_alerts() where alert_id = :'alert'), 'cerrada: sale de la lista de abiertas');
select pg_temp.check((select handled_by_name = 'Admin Turno' and closed_at is not null
                        from public.admin_sos_alerts(true) where alert_id = :'alert'), 'queda el registro de quién la cerró');

-- 7. Vencimientos: el SOAT del conductor vence en 5 días
select pg_temp.check((select days_left = 5 and plate = 'SEG44D'
                        from public.admin_expiring_documents(15) where doc_type = 'soat'
                         and driver_id = '00000000-0000-0000-0000-000000000052'), 'el panel ve el SOAT que vence en 5 días');
select pg_temp.check(not exists (select 1 from public.admin_expiring_documents(15)
                                  where driver_id = '00000000-0000-0000-0000-000000000052' and doc_type = 'tecnomecanica'),
                     'no muestra la técnico-mecánica que vence en 200 días');

-- 8. Al terminar, el enlace sigue 30 min sin ubicación; después deja de funcionar
select pg_temp.as_user('00000000-0000-0000-0000-000000000052');
select public.mark_arrived(:'ride');
reset role;
select code from public.ride_codes where ride_id = :'ride' \gset
set role authenticated;
select pg_temp.check(public.start_ride(:'ride', :'code'), 'inicia');
select public.complete_ride(:'ride');
set role anon;
select pg_temp.check((select status = 'completed' and driver_lat is null from public.shared_trip(:'share_token')),
                     'terminado: la familia ve que llegó, sin la ubicación del conductor');
reset role;
update public.rides set completed_at = now() - interval '31 minutes' where id = :'ride';
set role anon;
select pg_temp.check(not exists (select 1 from public.shared_trip(:'share_token')), 'a los 30 min el enlace deja de funcionar');
reset role;

select 'TODAS LAS PRUEBAS DE SEGURIDAD PASARON' as resultado;
