-- =====================================================================
--  MOTOTAXI · Fase 1: base de datos, reglas de seguridad y funciones
--  Pegar completo en Supabase > SQL Editor > New query > Run
--  Probado en PostgreSQL 16 + PostGIS 3.
-- =====================================================================
--  Principios:
--   1. Row Level Security (RLS) en TODAS las tablas: cada quien ve solo lo suyo.
--   2. Lo importante (aprobar conductores, asignar e iniciar viajes) SOLO lo
--      hacen funciones del servidor; la app no puede cambiar estados a mano.
--   3. El código de 4 dígitos vive en una tabla aparte que el conductor no
--      puede leer: solo puede validarlo.
-- =====================================================================

create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- 1. Tipos
-- ---------------------------------------------------------------------
create type public.user_role     as enum ('passenger', 'driver', 'admin');
create type public.driver_status as enum ('pending', 'needs_fix', 'approved', 'rejected', 'suspended');
create type public.doc_type      as enum ('cedula', 'licencia', 'soat', 'tecnomecanica', 'selfie', 'foto_moto');
create type public.doc_status    as enum ('pending', 'approved', 'rejected');
create type public.ride_status   as enum ('searching', 'assigned', 'arrived', 'in_progress', 'completed', 'cancelled');

-- ---------------------------------------------------------------------
-- 2. Tablas
-- ---------------------------------------------------------------------

-- Toda persona registrada (se crea sola al registrarse por SMS)
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  phone       text,
  full_name   text,
  photo_url   text,
  role        public.user_role not null default 'passenger',
  created_at  timestamptz not null default now()
);

-- Datos del conductor
create table public.drivers (
  id            uuid primary key references public.profiles (id) on delete cascade,
  plate         text not null unique check (plate ~ '^[A-Z]{3} ?[0-9]{2}[A-Z]$'),
  moto_color    text,
  moto_brand    text,
  status        public.driver_status not null default 'pending',
  rating_avg    numeric(3,2) not null default 5.00,
  rating_count  integer not null default 0,
  created_at    timestamptz not null default now()
);

-- Cada documento subido por un conductor (uno por tipo)
create table public.driver_documents (
  id             uuid primary key default gen_random_uuid(),
  driver_id      uuid not null references public.drivers (id) on delete cascade,
  type           public.doc_type not null,
  file_path      text not null,           -- ruta dentro del bucket privado
  expires_on     date,                    -- SOAT y técnico-mecánica
  status         public.doc_status not null default 'pending',
  reviewer_note  text,
  reviewed_by    uuid references public.profiles (id),
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now(),
  unique (driver_id, type)
);

-- Última posición de cada conductor (la app la actualiza cada 10-15 s)
create table public.driver_locations (
  driver_id     uuid primary key references public.drivers (id) on delete cascade,
  location      extensions.geography(Point, 4326) not null,
  heading       smallint,
  is_available  boolean not null default false,
  updated_at    timestamptz not null default now()
);
create index driver_locations_gix on public.driver_locations using gist (location);

-- Cada viaje
create table public.rides (
  id                   uuid primary key default gen_random_uuid(),
  passenger_id         uuid not null references public.profiles (id),
  driver_id            uuid references public.drivers (id),
  status               public.ride_status not null default 'searching',
  origin               extensions.geography(Point, 4326) not null,
  origin_address       text,
  destination          extensions.geography(Point, 4326) not null,
  destination_address  text,
  fare                 numeric(10,0),        -- pesos colombianos
  payment_method       text not null default 'cash',
  share_token          uuid not null default gen_random_uuid() unique,
  requested_at         timestamptz not null default now(),
  assigned_at          timestamptz,
  arrived_at           timestamptz,
  started_at           timestamptz,
  completed_at         timestamptz,
  cancelled_at         timestamptz,
  cancelled_by         uuid references public.profiles (id)
);
create index rides_passenger_idx on public.rides (passenger_id, requested_at desc);
create index rides_driver_idx    on public.rides (driver_id, requested_at desc);
create index rides_searching_idx on public.rides (status) where status = 'searching';

-- Código de 4 dígitos: lo ve el pasajero, el conductor NO
create table public.ride_codes (
  ride_id   uuid primary key references public.rides (id) on delete cascade,
  code      text not null check (code ~ '^[0-9]{4}$'),
  attempts  smallint not null default 0
);

-- Calificaciones
create table public.ratings (
  id          uuid primary key default gen_random_uuid(),
  ride_id     uuid not null references public.rides (id) on delete cascade,
  from_id     uuid not null references public.profiles (id),
  to_id       uuid not null references public.profiles (id),
  stars       smallint not null check (stars between 1 and 5),
  comment     text,
  created_at  timestamptz not null default now(),
  unique (ride_id, from_id)
);

-- Contactos de confianza del pasajero
create table public.trusted_contacts (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  name        text not null,
  phone       text not null,
  created_at  timestamptz not null default now()
);

-- Alertas SOS
create table public.sos_alerts (
  id           uuid primary key default gen_random_uuid(),
  ride_id      uuid references public.rides (id),
  raised_by    uuid not null references public.profiles (id),
  location     extensions.geography(Point, 4326),
  status       text not null default 'open' check (status in ('open', 'attending', 'closed')),
  handled_by   uuid references public.profiles (id),
  created_at   timestamptz not null default now(),
  closed_at    timestamptz
);

-- ---------------------------------------------------------------------
-- 3. Ayudas internas
-- ---------------------------------------------------------------------

-- ¿Quien llama es administrador?
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Punto geográfico a partir de latitud/longitud
create or replace function public.make_point(lat double precision, lng double precision)
returns extensions.geography language sql immutable set search_path = '' as $$
  select extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography;
$$;

-- Crea el perfil automáticamente cuando alguien se registra
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, phone, full_name)
  values (new.id, new.phone, new.raw_user_meta_data ->> 'full_name');
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Recalcula la calificación promedio del conductor
create or replace function public.update_driver_rating()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.drivers d
     set rating_avg   = s.avg_stars,
         rating_count = s.n
    from (select round(avg(stars)::numeric, 2) as avg_stars, count(*) as n
            from public.ratings where to_id = new.to_id) s
   where d.id = new.to_id;
  return new;
end $$;

create trigger on_rating_created
  after insert on public.ratings
  for each row execute function public.update_driver_rating();

-- ---------------------------------------------------------------------
-- 4. Permisos de columnas: nadie cambia su propio rol ni su estado
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke insert, update, delete on all tables in schema public from authenticated;

grant update (full_name, photo_url)                  on public.profiles         to authenticated;
grant insert (id, plate, moto_color, moto_brand)     on public.drivers          to authenticated;
grant update (plate, moto_color, moto_brand)         on public.drivers          to authenticated;
grant insert (driver_id, type, file_path, expires_on) on public.driver_documents to authenticated;
grant update (file_path, expires_on)                 on public.driver_documents to authenticated;
grant insert, update                                 on public.driver_locations to authenticated;
grant insert (ride_id, from_id, to_id, stars, comment) on public.ratings        to authenticated;
grant insert, update, delete                         on public.trusted_contacts to authenticated;
-- rides, ride_codes y sos_alerts: solo a través de las funciones de abajo

-- ---------------------------------------------------------------------
-- 5. Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.drivers          enable row level security;
alter table public.driver_documents enable row level security;
alter table public.driver_locations enable row level security;
alter table public.rides            enable row level security;
alter table public.ride_codes       enable row level security;
alter table public.ratings          enable row level security;
alter table public.trusted_contacts enable row level security;
alter table public.sos_alerts       enable row level security;

-- profiles: el propio, la contraparte de un viaje activo o reciente, y el admin
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid()
  or public.is_admin()
  or exists (
    select 1 from public.rides r
     where r.status <> 'searching'
       and ((r.passenger_id = auth.uid() and r.driver_id = profiles.id)
         or (r.driver_id = auth.uid() and r.passenger_id = profiles.id))
  )
);
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- drivers: el propio conductor, el pasajero de su viaje, y el admin
create policy drivers_select on public.drivers for select to authenticated using (
  id = auth.uid()
  or public.is_admin()
  or exists (select 1 from public.rides r where r.driver_id = drivers.id and r.passenger_id = auth.uid())
);
create policy drivers_insert on public.drivers for insert to authenticated
  with check (id = auth.uid());
-- Solo puede corregir sus datos mientras no está aprobado
create policy drivers_update on public.drivers for update to authenticated
  using (id = auth.uid() and status in ('pending', 'needs_fix'))
  with check (id = auth.uid());

-- driver_documents: el dueño y el admin
create policy docs_select on public.driver_documents for select to authenticated
  using (driver_id = auth.uid() or public.is_admin());
create policy docs_insert on public.driver_documents for insert to authenticated
  with check (driver_id = auth.uid());
create policy docs_update on public.driver_documents for update to authenticated
  using (driver_id = auth.uid() and status <> 'approved')
  with check (driver_id = auth.uid());

-- driver_locations: solo un conductor APROBADO publica su ubicación.
-- Los pasajeros no leen esta tabla directo: usan nearby_drivers().
create policy loc_select on public.driver_locations for select to authenticated using (
  driver_id = auth.uid()
  or public.is_admin()
  or exists (select 1 from public.rides r
              where r.driver_id = driver_locations.driver_id
                and r.passenger_id = auth.uid()
                and r.status in ('assigned', 'arrived', 'in_progress'))
);
create policy loc_insert on public.driver_locations for insert to authenticated with check (
  driver_id = auth.uid()
  and exists (select 1 from public.drivers d where d.id = auth.uid() and d.status = 'approved')
);
create policy loc_update on public.driver_locations for update to authenticated
  using (driver_id = auth.uid())
  with check (
    driver_id = auth.uid()
    and exists (select 1 from public.drivers d where d.id = auth.uid() and d.status = 'approved')
  );

-- rides: el pasajero, el conductor asignado y el admin (solo lectura)
create policy rides_select on public.rides for select to authenticated using (
  passenger_id = auth.uid() or driver_id = auth.uid() or public.is_admin()
);

-- ride_codes: SOLO el pasajero del viaje
create policy codes_select on public.ride_codes for select to authenticated using (
  exists (select 1 from public.rides r where r.id = ride_codes.ride_id and r.passenger_id = auth.uid())
);

-- ratings: los dos participantes de un viaje terminado
create policy ratings_select on public.ratings for select to authenticated
  using (from_id = auth.uid() or to_id = auth.uid() or public.is_admin());
create policy ratings_insert on public.ratings for insert to authenticated with check (
  from_id = auth.uid()
  and exists (select 1 from public.rides r
               where r.id = ride_id and r.status = 'completed'
                 and ((r.passenger_id = auth.uid() and r.driver_id = to_id)
                   or (r.driver_id = auth.uid() and r.passenger_id = to_id)))
);

-- trusted_contacts: solo el dueño
create policy contacts_all on public.trusted_contacts for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- sos_alerts: quien la activó y el admin
create policy sos_select on public.sos_alerts for select to authenticated
  using (raised_by = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------
-- 6. Funciones que usan las apps (supabase.rpc('nombre', {...}))
-- ---------------------------------------------------------------------

-- Pasajero: motos disponibles cerca (ubicación fresca de los últimos 2 min)
create or replace function public.nearby_drivers(lat double precision, lng double precision, radius_m integer default 2000)
returns table (driver_id uuid, lat double precision, lng double precision, distance_m integer)
language sql stable security definer set search_path = '' as $$
  select l.driver_id,
         extensions.st_y(l.location::extensions.geometry),
         extensions.st_x(l.location::extensions.geometry),
         extensions.st_distance(l.location, public.make_point(lat, lng))::integer
    from public.driver_locations l
    join public.drivers d on d.id = l.driver_id
   where d.status = 'approved'
     and l.is_available
     and l.updated_at > now() - interval '2 minutes'
     and extensions.st_dwithin(l.location, public.make_point(lat, lng), least(radius_m, 5000))
     and not exists (select 1 from public.rides r
                      where r.driver_id = l.driver_id and r.status in ('assigned', 'arrived', 'in_progress'))
   order by 4
   limit 20;
$$;

-- Pasajero: pedir un viaje. Devuelve el id del viaje.
create or replace function public.request_ride(
  origin_lat double precision, origin_lng double precision, origin_address text,
  dest_lat double precision, dest_lng double precision, dest_address text,
  fare numeric)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión'; end if;
  if exists (select 1 from public.rides
              where passenger_id = auth.uid()
                and status in ('searching', 'assigned', 'arrived', 'in_progress')) then
    raise exception 'Ya tienes un viaje activo';
  end if;

  insert into public.rides (passenger_id, origin, origin_address, destination, destination_address, fare)
  values (auth.uid(), public.make_point(origin_lat, origin_lng), origin_address,
          public.make_point(dest_lat, dest_lng), dest_address, fare)
  returning id into new_id;

  insert into public.ride_codes (ride_id, code)
  values (new_id, lpad((floor(random() * 10000))::int::text, 4, '0'));

  return new_id;
end $$;

-- Conductor: aceptar. Si dos aceptan a la vez, solo gana el primero.
create or replace function public.accept_ride(p_ride_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  ok boolean;
begin
  if not exists (select 1 from public.drivers where id = auth.uid() and status = 'approved') then
    raise exception 'Tu cuenta de conductor no está aprobada';
  end if;
  if exists (select 1 from public.rides
              where driver_id = auth.uid() and status in ('assigned', 'arrived', 'in_progress')) then
    raise exception 'Ya tienes un viaje en curso';
  end if;

  update public.rides
     set driver_id = auth.uid(), status = 'assigned', assigned_at = now()
   where id = p_ride_id and status = 'searching' and driver_id is null;
  get diagnostics ok = row_count;

  if ok then
    update public.driver_locations set is_available = false where driver_id = auth.uid();
  end if;
  return ok;   -- false = otro conductor lo tomó primero
end $$;

-- Conductor: llegué al punto de recogida
create or replace function public.mark_arrived(p_ride_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.rides set status = 'arrived', arrived_at = now()
   where id = p_ride_id and driver_id = auth.uid() and status = 'assigned';
  if not found then raise exception 'No puedes marcar llegada en este viaje'; end if;
end $$;

-- Conductor: iniciar viaje con el código que le dicta el pasajero.
-- 5 intentos fallidos bloquean el inicio (avisar al pasajero / soporte).
create or replace function public.start_ride(p_ride_id uuid, p_code text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  real_code text;
  tries     smallint;
begin
  select c.code, c.attempts into real_code, tries
    from public.ride_codes c
    join public.rides r on r.id = c.ride_id
   where c.ride_id = p_ride_id and r.driver_id = auth.uid() and r.status = 'arrived'
     for update of c;

  if real_code is null then raise exception 'Este viaje no se puede iniciar'; end if;
  if tries >= 5 then raise exception 'Demasiados intentos. Comunícate con soporte'; end if;

  if p_code is distinct from real_code then
    update public.ride_codes set attempts = attempts + 1 where ride_id = p_ride_id;
    return false;
  end if;

  update public.rides set status = 'in_progress', started_at = now() where id = p_ride_id;
  return true;
end $$;

-- Conductor: terminar viaje (y volver a quedar disponible)
create or replace function public.complete_ride(p_ride_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.rides set status = 'completed', completed_at = now()
   where id = p_ride_id and driver_id = auth.uid() and status = 'in_progress';
  if not found then raise exception 'No puedes terminar este viaje'; end if;
  update public.driver_locations set is_available = true where driver_id = auth.uid();
end $$;

-- Pasajero o conductor: cancelar antes de iniciar
create or replace function public.cancel_ride(p_ride_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  drv uuid;
begin
  update public.rides set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid()
   where id = p_ride_id
     and (passenger_id = auth.uid() or driver_id = auth.uid())
     and status in ('searching', 'assigned', 'arrived')
  returning driver_id into drv;
  if not found then raise exception 'Este viaje ya no se puede cancelar'; end if;
  if drv is not null then
    update public.driver_locations set is_available = true where driver_id = drv;
  end if;
end $$;

-- Pasajero o conductor: botón SOS. Devuelve el id de la alerta.
-- La Edge Function escucha esta tabla y envía los SMS a los contactos.
create or replace function public.raise_sos(p_ride_id uuid, lat double precision, lng double precision)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  new_id uuid;
begin
  if p_ride_id is not null and not exists (
       select 1 from public.rides
        where id = p_ride_id and (passenger_id = auth.uid() or driver_id = auth.uid())) then
    raise exception 'Viaje no válido';
  end if;
  insert into public.sos_alerts (ride_id, raised_by, location)
  values (p_ride_id, auth.uid(), public.make_point(lat, lng))
  returning id into new_id;
  return new_id;
end $$;

-- Familiar con el enlace compartido: datos del viaje SIN iniciar sesión.
-- Deja de responder cuando el viaje termina o se cancela.
create or replace function public.shared_trip(p_token uuid)
returns table (status public.ride_status, driver_name text, plate text, moto_color text,
               driver_lat double precision, driver_lng double precision,
               destination_address text, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.status, p.full_name, d.plate, d.moto_color,
         extensions.st_y(l.location::extensions.geometry),
         extensions.st_x(l.location::extensions.geometry),
         r.destination_address, l.updated_at
    from public.rides r
    join public.drivers d  on d.id = r.driver_id
    join public.profiles p on p.id = d.id
    left join public.driver_locations l on l.driver_id = d.id
   where r.share_token = p_token
     and r.status in ('assigned', 'arrived', 'in_progress');
$$;

-- Admin: decidir sobre un conductor ('approved' | 'needs_fix' | 'rejected' | 'suspended')
create or replace function public.admin_review_driver(p_driver_id uuid, p_decision public.driver_status, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Solo administradores'; end if;
  if p_decision = 'pending' then raise exception 'Decisión no válida'; end if;

  if p_decision = 'approved' and (
       select count(*) from public.driver_documents
        where driver_id = p_driver_id
          and (expires_on is null or expires_on >= current_date)) < 6 then
    raise exception 'Faltan documentos o hay alguno vencido';
  end if;

  update public.drivers set status = p_decision where id = p_driver_id;
  update public.driver_documents
     set status = case when p_decision = 'approved' then 'approved'::public.doc_status
                       when p_decision in ('needs_fix', 'rejected') then 'rejected'::public.doc_status
                       else status end,
         reviewer_note = coalesce(p_note, reviewer_note),
         reviewed_by = auth.uid(), reviewed_at = now()
   where driver_id = p_driver_id;
  if p_decision <> 'approved' then
    update public.driver_locations set is_available = false where driver_id = p_driver_id;
  end if;
end $$;

-- Tarea diaria: suspende a quien tenga SOAT o técnico-mecánica vencidos
create or replace function public.suspend_expired_drivers()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  with expired as (
    select distinct driver_id from public.driver_documents
     where type in ('soat', 'tecnomecanica') and expires_on < current_date
  )
  update public.drivers d set status = 'suspended'
    from expired e where d.id = e.driver_id and d.status = 'approved';
  get diagnostics n = row_count;
  update public.driver_locations l set is_available = false
    from public.drivers d where d.id = l.driver_id and d.status = 'suspended';
  return n;
end $$;

-- Quién puede llamar qué
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.nearby_drivers(double precision, double precision, integer),
  public.request_ride(double precision, double precision, text, double precision, double precision, text, numeric),
  public.accept_ride(uuid), public.mark_arrived(uuid), public.start_ride(uuid, text),
  public.complete_ride(uuid), public.cancel_ride(uuid),
  public.raise_sos(uuid, double precision, double precision),
  public.admin_review_driver(uuid, public.driver_status, text),
  public.is_admin(),
  public.make_point(double precision, double precision)
to authenticated;
grant execute on function public.shared_trip(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. Archivos: bucket privado de documentos
--    Ruta obligatoria: <id del conductor>/<tipo>.jpg
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('driver-documents', 'driver-documents', false)
on conflict (id) do nothing;

create policy "conductor sube sus documentos" on storage.objects for insert to authenticated
  with check (bucket_id = 'driver-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "conductor reemplaza sus documentos" on storage.objects for update to authenticated
  using (bucket_id = 'driver-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "conductor y admin ven documentos" on storage.objects for select to authenticated
  using (bucket_id = 'driver-documents'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ---------------------------------------------------------------------
-- 8. Tiempo real: las apps escuchan cambios de estos datos
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.rides, public.driver_locations, public.sos_alerts;

-- ---------------------------------------------------------------------
-- 9. (Opcional) Programar la revisión diaria de vencimientos
--    Activa pg_cron en Database > Extensions y luego ejecuta:
--
--    select cron.schedule('vencimientos', '0 6 * * *', 'select public.suspend_expired_drivers()');
--
-- 10. Hacerte administrador (cambia el teléfono por el tuyo, ya registrado):
--
--    update public.profiles set role = 'admin' where phone = '57XXXXXXXXXX';
-- =====================================================================
