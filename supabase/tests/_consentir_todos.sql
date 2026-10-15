-- Ayuda para las pruebas 01–05 (que prueban otras cosas): todos los usuarios
-- creados hasta ahora aceptan la política vigente. La prueba 06 verifica la
-- autorización en sí, sin esta ayuda.
insert into public.privacy_consents (profile_id, scope, policy_version, app)
select p.id, s, (select version from public.privacy_policy), 'pasajero'
  from public.profiles p cross join unnest(array['general', 'biometric']) s
on conflict do nothing;
