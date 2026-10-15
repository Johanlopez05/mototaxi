-- =====================================================================
--  MOTOTAXI · Autorización de tratamiento de datos (Ley 1581 de 2012)
-- =====================================================================
--  - privacy_policy: la versión vigente de la política. Si cambia la
--    versión, todos deben volver a aceptar.
--  - privacy_consents: prueba de cada autorización (quién, qué, cuándo,
--    qué versión y desde qué app). No se borra ni se edita: es evidencia.
--  - Dos alcances:
--      'general'   → datos para usar la plataforma (pasajeros y conductores)
--      'biometric' → foto del rostro, dato sensible (solo conductores)
--  - El servidor lo exige: sin 'general' no se pide un viaje; sin las dos,
--    un conductor no puede subir su selfie ni enviar documentos a revisión.
-- =====================================================================

create table public.privacy_policy (
  id            boolean primary key default true check (id),   -- una sola fila
  version       text not null check (version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  published_at  timestamptz not null default now()
);
insert into public.privacy_policy (version) values ('2026-10-15');

alter table public.privacy_policy enable row level security;
revoke all on public.privacy_policy from anon;
revoke insert, update, delete on public.privacy_policy from authenticated;
create policy privacy_policy_select on public.privacy_policy for select to authenticated using (true);

create table public.privacy_consents (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles (id) on delete cascade,
  scope           text not null check (scope in ('general', 'biometric')),
  policy_version  text not null,
  app             text not null check (app in ('pasajero', 'conductor', 'panel')),
  accepted_at     timestamptz not null default now(),
  unique (profile_id, scope, policy_version)
);

alter table public.privacy_consents enable row level security;
revoke all on public.privacy_consents from anon;
revoke insert, update, delete on public.privacy_consents from authenticated;
create policy consents_select on public.privacy_consents for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());

-- ¿La persona aceptó este alcance en la versión vigente?
-- Solo se puede preguntar por uno mismo (o un admin por cualquiera).
create or replace function public.has_consent(p_scope text, p_profile_id uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.privacy_consents c, public.privacy_policy p
     where c.profile_id = coalesce(p_profile_id, auth.uid())
       and (p_profile_id is null or p_profile_id = auth.uid() or public.is_admin())
       and c.scope = p_scope
       and c.policy_version = p.version);
$$;

-- App: qué falta aceptar
create or replace function public.privacy_status()
returns table (current_version text, general boolean, biometric boolean)
language sql stable security definer set search_path = '' as $$
  select p.version, public.has_consent('general'), public.has_consent('biometric')
    from public.privacy_policy p;
$$;

-- App: registrar la autorización. p_version debe ser la vigente (la que la persona leyó).
create or replace function public.accept_privacy(p_version text, p_scopes text[], p_app text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  current_version text;
  s text;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión'; end if;
  select version into current_version from public.privacy_policy;
  if p_version is distinct from current_version then
    raise exception 'La política cambió. Vuelve a leerla antes de aceptar';
  end if;
  if p_scopes is null or cardinality(p_scopes) = 0 then raise exception 'Nada que aceptar'; end if;
  if 'biometric' = any (p_scopes) and not ('general' = any (p_scopes) or public.has_consent('general')) then
    raise exception 'Primero acepta la política general';
  end if;
  foreach s in array p_scopes loop
    if s not in ('general', 'biometric') then raise exception 'Alcance no válido'; end if;
    insert into public.privacy_consents (profile_id, scope, policy_version, app)
    values (auth.uid(), s, current_version, p_app)
    on conflict (profile_id, scope, policy_version) do nothing;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- El servidor exige la autorización (misma lógica que antes + la verificación)
-- ---------------------------------------------------------------------
create or replace function public.request_ride(
  origin_lat double precision, origin_lng double precision, origin_address text,
  dest_lat double precision, dest_lng double precision, dest_address text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  new_id    uuid;
  new_fare  numeric;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión'; end if;
  if not public.has_consent('general') then
    raise exception 'Debes aceptar la política de tratamiento de datos';
  end if;
  if exists (select 1 from public.rides
              where passenger_id = auth.uid()
                and status in ('searching', 'assigned', 'arrived', 'in_progress')) then
    raise exception 'Ya tienes un viaje activo';
  end if;
  if exists (select 1 from public.rides
              where driver_id = auth.uid() and status in ('assigned', 'arrived', 'in_progress')) then
    raise exception 'No puedes pedir un viaje mientras haces uno como conductor';
  end if;

  select e.fare into new_fare from public.estimate_fare(origin_lat, origin_lng, dest_lat, dest_lng) e;

  insert into public.rides (passenger_id, origin, origin_address, destination, destination_address, fare)
  values (auth.uid(), public.make_point(origin_lat, origin_lng), left(origin_address, 200),
          public.make_point(dest_lat, dest_lng), left(dest_address, 200), new_fare)
  returning id into new_id;

  insert into public.ride_codes (ride_id, code)
  values (new_id, lpad((floor(random() * 10000))::int::text, 4, '0'));

  return new_id;
end $$;

create or replace function public.submit_for_review()
returns public.driver_status language plpgsql security definer set search_path = '' as $$
declare
  current_status public.driver_status;
  missing integer;
begin
  select status into current_status from public.drivers where id = auth.uid();
  if current_status is null then raise exception 'Primero registra tu moto'; end if;
  if not (public.has_consent('general') and public.has_consent('biometric')) then
    raise exception 'Debes aceptar la política de tratamiento de datos y la autorización de tu foto';
  end if;

  select 6 - count(distinct type) into missing
    from public.driver_documents
   where driver_id = auth.uid()
     and (type not in ('soat', 'tecnomecanica') or (expires_on is not null and expires_on >= current_date));
  if missing > 0 then
    raise exception 'Faltan % documento(s) o hay alguno vencido', missing;
  end if;

  if current_status in ('needs_fix', 'suspended') then
    update public.drivers set status = 'pending' where id = auth.uid();
    return 'pending';
  end if;
  return current_status;
end $$;

-- La selfie (dato biométrico) no se puede subir sin su autorización expresa
create policy "selfie solo con autorizacion biometrica" on storage.objects
  as restrictive for insert to authenticated
  with check (bucket_id <> 'driver-documents' or name not like '%/selfie.jpg' or public.has_consent('biometric'));
create policy "selfie solo con autorizacion biometrica (reemplazo)" on storage.objects
  as restrictive for update to authenticated
  using (bucket_id <> 'driver-documents' or name not like '%/selfie.jpg' or public.has_consent('biometric'));

revoke execute on function public.has_consent(text, uuid), public.privacy_status(),
                           public.accept_privacy(text, text[], text) from public, anon;
grant execute on function public.has_consent(text, uuid), public.privacy_status(),
                          public.accept_privacy(text, text[], text) to authenticated;
