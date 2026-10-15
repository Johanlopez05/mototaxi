-- Prueba de la autorización de tratamiento de datos (Ley 1581). Sin _consentir_todos.
\set ON_ERROR_STOP on

create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); end $$;
create or replace function pg_temp.check(ok boolean, msg text) returns text language plpgsql as $$
begin
  if ok is not true then raise exception 'FALLÓ: %', msg; end if;
  return 'ok · ' || msg;
end $$;
create or replace function pg_temp.fails(sql text) returns boolean language plpgsql as $$
begin
  execute sql;
  return false;
exception when others then
  return true;
end $$;

insert into auth.users (id, phone, raw_user_meta_data) values
 ('00000000-0000-0000-0000-000000000061', '573500000001', '{"full_name":"Paula Nueva"}'),
 ('00000000-0000-0000-0000-000000000062', '573500000002', '{"full_name":"Conductor Nuevo"}');

set role authenticated;

-- 1. Pasajera nueva: sin aceptar no puede pedir
select pg_temp.as_user('00000000-0000-0000-0000-000000000061');
select pg_temp.check((select not general and not biometric and current_version = '2026-10-15' from public.privacy_status()),
                     'al empezar no ha aceptado nada');
select pg_temp.check(pg_temp.fails($$select public.request_ride(4.70, -74.05, 'A', 4.71, -74.06, 'B')$$),
                     'sin aceptar la política no puede pedir un viaje');

-- 2. Aceptar exige la versión vigente (la que leyó)
select pg_temp.check(pg_temp.fails($$select public.accept_privacy('2020-01-01', array['general'], 'pasajero')$$),
                     'no acepta una versión vieja de la política');
select pg_temp.check(pg_temp.fails($$select public.accept_privacy('2026-10-15', array['todo'], 'pasajero')$$),
                     'no acepta alcances inventados');
select public.accept_privacy('2026-10-15', array['general'], 'pasajero');
select public.accept_privacy('2026-10-15', array['general'], 'pasajero');  -- dos veces no duplica
select pg_temp.check((select general and not biometric from public.privacy_status()), 'aceptó la general');
select pg_temp.check((select count(*) = 1 from public.privacy_consents), 'queda una sola prueba de la autorización');
select pg_temp.check(public.request_ride(4.70, -74.05, 'A', 4.71, -74.06, 'B') is not null, 'con la autorización ya puede pedir');

-- 3. La prueba de la autorización no se puede editar ni borrar desde la app
select pg_temp.check(pg_temp.fails($$update public.privacy_consents set accepted_at = now() - interval '1 year'$$),
                     'no puede editar su autorización');
select pg_temp.check(pg_temp.fails($$insert into public.privacy_consents (profile_id, scope, policy_version, app)
                                     values (auth.uid(), 'biometric', '2026-10-15', 'pasajero')$$),
                     'no puede insertar autorizaciones a mano');

-- 4. Nadie pregunta por la autorización de otra persona
select pg_temp.as_user('00000000-0000-0000-0000-000000000062');
select pg_temp.check(not public.has_consent('general', '00000000-0000-0000-0000-000000000061'),
                     'no puede consultar la autorización de otra persona');
select pg_temp.check((select count(*) = 0 from public.privacy_consents), 'no ve las autorizaciones de otros');

-- 5. Conductor: la selfie y el envío a revisión exigen la autorización biométrica
insert into public.drivers (id, plate) values (auth.uid(), 'AUT66F');
select pg_temp.check(pg_temp.fails($$insert into storage.objects (bucket_id, name, owner)
                                     values ('driver-documents', auth.uid() || '/selfie.jpg', auth.uid())$$),
                     'sin autorización biométrica no puede subir su selfie');
insert into storage.objects (bucket_id, name, owner) values ('driver-documents', auth.uid() || '/cedula.jpg', auth.uid());
select 'ok · los demás documentos sí se pueden subir';
select pg_temp.check(pg_temp.fails($$select public.accept_privacy('2026-10-15', array['biometric'], 'conductor')$$),
                     'la biométrica sola no basta: primero la general');
select public.accept_privacy('2026-10-15', array['general'], 'conductor');
insert into public.driver_documents (driver_id, type, file_path, expires_on)
select auth.uid(), t, auth.uid() || '/' || t || '.jpg', case when t in ('soat', 'tecnomecanica') then current_date + 100 end
  from unnest(enum_range(null::public.doc_type)) t;
select pg_temp.check(pg_temp.fails($$select public.submit_for_review()$$), 'sin la biométrica no puede enviar a revisión');
select public.accept_privacy('2026-10-15', array['biometric'], 'conductor');
insert into storage.objects (bucket_id, name, owner) values ('driver-documents', auth.uid() || '/selfie.jpg', auth.uid());
select 'ok · con la autorización biométrica sube su selfie';
select pg_temp.check(public.submit_for_review() = 'pending', 'con las dos autorizaciones envía a revisión');

-- 6. Si la política cambia de versión, hay que volver a aceptar
reset role;
update public.privacy_policy set version = '2027-01-01', published_at = now();
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000061');
select pg_temp.check((select not general from public.privacy_status()), 'nueva versión: vuelve a pedir la autorización');
select pg_temp.check((select count(*) = 1 from public.privacy_consents), 'la autorización anterior se conserva como prueba');
reset role;

select 'TODAS LAS PRUEBAS DE AUTORIZACIÓN PASARON' as resultado;
