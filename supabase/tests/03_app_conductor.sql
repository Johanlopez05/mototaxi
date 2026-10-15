-- Prueba de las funciones de la app del conductor (fase 2).
\set ON_ERROR_STOP on

create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); end $$;
create or replace function pg_temp.check(ok boolean, msg text) returns text language plpgsql as $$
begin
  if ok is not true then raise exception 'FALLÓ: %', msg; end if;
  return 'ok · ' || msg;
end $$;

insert into auth.users (id, phone, raw_user_meta_data) values
 ('00000000-0000-0000-0000-0000000000f1', '573300000001', '{"full_name":"Nuevo Conductor"}'),
 ('00000000-0000-0000-0000-0000000000f2', '573300000002', '{"full_name":"Ana María Ruiz"}');

-- 1. Un conductor recién registrado (pendiente) no puede reportar ubicación
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
insert into public.drivers (id, plate, moto_color, moto_brand) values (auth.uid(), 'FFF11A', 'negra', 'AKT');
do $$ begin
  perform public.set_my_location(4.70, -74.05);
  raise exception 'FALLÓ: un conductor pendiente reportó ubicación';
exception when others then
  if sqlerrm like 'FALLÓ%' then raise; end if;
end $$;
select 'ok · un conductor pendiente no puede ponerse disponible';

-- 2. Aprobado: se conecta, aparece en el mapa, se desconecta y desaparece
reset role;
update public.drivers set status = 'approved' where id = '00000000-0000-0000-0000-0000000000f1';
set role authenticated;
select public.set_my_location(4.80, -74.10, true, 90::smallint);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
select pg_temp.check(exists (select 1 from public.nearby_drivers(4.80, -74.10)
                              where driver_id = '00000000-0000-0000-0000-0000000000f1'), 'conectado: el pasajero lo ve cerca');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select public.go_offline();
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
select pg_temp.check(not exists (select 1 from public.nearby_drivers(4.80, -74.10)
                                  where driver_id = '00000000-0000-0000-0000-0000000000f1'), 'desconectado: ya no aparece');

-- 3. Ubicación absurda rechazada
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
do $$ begin
  perform public.set_my_location(123, -74.10);
  raise exception 'FALLÓ: aceptó una latitud imposible';
exception when others then
  if sqlerrm like 'FALLÓ%' then raise; end if;
end $$;
select 'ok · ubicación imposible rechazada';

-- 4. Con un viaje en curso, reportar ubicación NO lo vuelve disponible
select public.set_my_location(4.80, -74.10, true);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
select public.request_ride(4.8001, -74.1001, 'Plaza', 4.81, -74.11, 'Hospital', 6500) as ride \gset
reset role;
select pg_temp.check((select driver_id from public.dispatch_next_offer(:'ride')) = '00000000-0000-0000-0000-0000000000f1', 'la oferta le llega');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select pg_temp.check(public.accept_ride(:'ride'), 'acepta');
select public.set_my_location(4.8002, -74.1002, true);
reset role;
select pg_temp.check((select is_available from public.driver_locations
                       where driver_id = '00000000-0000-0000-0000-0000000000f1') = false, 'en viaje sigue NO disponible aunque la app diga true');
set role authenticated;

-- 5. Su viaje en curso, con el primer nombre de la pasajera y su teléfono
select pg_temp.check((select passenger_first_name = 'Ana' and passenger_phone = '573300000002' and status = 'assigned'
                        and abs(origin_lat - 4.8001) < 0.00001
                        from public.driver_active_ride()), 've su viaje en curso con nombre y teléfono de la pasajera');

-- 6. Otro conductor no ve ese viaje
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
select pg_temp.check(not exists (select 1 from public.driver_active_ride()), 'nadie más ve ese viaje');

-- 7. Al terminar vuelve a quedar disponible y ya no tiene viaje en curso
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select public.mark_arrived(:'ride');
reset role;
select code from public.ride_codes where ride_id = :'ride' \gset
set role authenticated;
select pg_temp.check(public.start_ride(:'ride', :'code'), 'inicia con el código');
select public.complete_ride(:'ride');
select pg_temp.check(not exists (select 1 from public.driver_active_ride()), 'terminado: sin viaje en curso');
reset role;
select pg_temp.check((select is_available from public.driver_locations
                       where driver_id = '00000000-0000-0000-0000-0000000000f1'), 'terminado: vuelve a estar disponible');

-- 8. Documentos: enviar a revisión exige los 6 vigentes; re-subir vuelve a "pendiente"
insert into auth.users (id, phone) values ('00000000-0000-0000-0000-0000000000f3', '573300000003');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f3');
insert into public.drivers (id, plate) values (auth.uid(), 'GGG33C');
insert into public.driver_documents (driver_id, type, file_path, expires_on)
select auth.uid(), t, auth.uid() || '/' || t || '.jpg', case when t in ('soat', 'tecnomecanica') then current_date + 100 end
  from unnest(array['cedula', 'licencia', 'soat', 'tecnomecanica', 'selfie']::public.doc_type[]) t;
do $$ begin
  perform public.submit_for_review();
  raise exception 'FALLÓ: envió a revisión con 5 documentos';
exception when others then
  if sqlerrm like 'FALLÓ%' then raise; end if;
end $$;
select 'ok · con 5 documentos no puede enviar a revisión';
insert into public.driver_documents (driver_id, type, file_path)
values (auth.uid(), 'foto_moto', auth.uid() || '/foto_moto.jpg');
select pg_temp.check(public.submit_for_review() = 'pending', 'con los 6 queda en revisión');

-- El admin pide corregir; el conductor re-sube el SOAT y vuelve a la cola
reset role;
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000f2';
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
select public.admin_review_driver('00000000-0000-0000-0000-0000000000f3', 'needs_fix', 'SOAT borroso');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f3');
select pg_temp.check((select reviewer_note from public.driver_documents where type = 'soat') = 'SOAT borroso', 'el conductor ve la nota del revisor');
update public.driver_documents set file_path = file_path, expires_on = current_date + 300 where type = 'soat';
select pg_temp.check((select status = 'pending' and reviewer_note is null from public.driver_documents where type = 'soat'), 're-subido: el SOAT vuelve a pendiente');
select pg_temp.check(public.submit_for_review() = 'pending', 'corregido: vuelve a la cola de revisión');

-- Aprobado y luego suspendido por SOAT vencido: sube el nuevo y vuelve a la cola
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
select public.admin_review_driver('00000000-0000-0000-0000-0000000000f3', 'approved');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f3');
do $$ begin
  update public.driver_documents set expires_on = current_date + 999 where type = 'cedula';
  if found then raise exception 'FALLÓ: un conductor aprobado editó un documento aprobado'; end if;
end $$;
select 'ok · aprobado: no puede tocar sus documentos aprobados';
reset role;
update public.driver_documents set expires_on = current_date - 1
 where driver_id = '00000000-0000-0000-0000-0000000000f3' and type = 'soat';
select pg_temp.check(public.suspend_expired_drivers() >= 1, 'la tarea diaria lo suspende');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f3');
do $$ begin
  perform public.submit_for_review();
  raise exception 'FALLÓ: envió a revisión con el SOAT vencido';
exception when others then
  if sqlerrm like 'FALLÓ%' then raise; end if;
end $$;
select 'ok · con el SOAT vencido no puede enviar a revisión';
update public.driver_documents set expires_on = current_date + 365 where type = 'soat';
select pg_temp.check(public.submit_for_review() = 'pending', 'suspendido con SOAT renovado: vuelve a la cola');

-- Un conductor no puede auto-aprobar un documento
do $$ begin
  update public.driver_documents set status = 'approved' where type = 'cedula';
  raise exception 'FALLÓ: el conductor aprobó su propio documento';
exception when insufficient_privilege then null;
end $$;
select 'ok · no puede aprobar sus propios documentos';
reset role;

select 'TODAS LAS PRUEBAS DE LA APP DEL CONDUCTOR PASARON' as resultado;
