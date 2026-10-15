-- =====================================================================
--  MOTOTAXI · Fase 4: capa de seguridad
-- =====================================================================
--  1. Contactos de confianza: celular válido, sin repetidos, máximo 5.
--  2. Viaje compartido: shared_trip() trae más datos para la página pública
--     (/v/<token>), avisa si hay un SOS abierto y muestra la llegada.
--  3. SOS: raise_sos() no duplica alertas si se presiona varias veces; la
--     Edge Function sos-alert lee sos_alert_context() y marca el envío.
--  4. Panel: lista de alertas SOS, atender/cerrar, y vencimientos próximos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Contactos de confianza
-- ---------------------------------------------------------------------
alter table public.trusted_contacts
  add constraint trusted_contacts_phone_co check (phone ~ '^\+573[0-9]{9}$') not valid,
  add constraint trusted_contacts_name_len check (char_length(btrim(name)) between 1 and 60) not valid,
  add constraint trusted_contacts_unique_phone unique (profile_id, phone);

create or replace function public.limit_trusted_contacts()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.trusted_contacts where profile_id = new.profile_id) >= 5 then
    raise exception 'Puedes tener hasta 5 contactos de confianza';
  end if;
  return new;
end $$;

create trigger before_trusted_contact_insert
  before insert on public.trusted_contacts
  for each row execute function public.limit_trusted_contacts();

-- ---------------------------------------------------------------------
-- 2. Viaje compartido (página pública, sin sesión)
--    Responde mientras el viaje está activo y hasta 30 minutos después de
--    terminar (para que la familia vea que llegó). La ubicación de la moto
--    solo mientras el viaje está activo.
-- ---------------------------------------------------------------------
drop function public.shared_trip(uuid);

create function public.shared_trip(p_token uuid)
returns table (status public.ride_status, passenger_first_name text,
               driver_name text, plate text, moto_color text, moto_brand text,
               driver_lat double precision, driver_lng double precision, location_at timestamptz,
               origin_address text, destination_address text,
               destination_lat double precision, destination_lng double precision,
               started_at timestamptz, completed_at timestamptz, sos_open boolean)
language sql stable security definer set search_path = '' as $$
  select r.status,
         split_part(coalesce(pp.full_name, ''), ' ', 1),
         pd.full_name, d.plate, d.moto_color, d.moto_brand,
         case when r.status <> 'completed' then extensions.st_y(l.location::extensions.geometry) end,
         case when r.status <> 'completed' then extensions.st_x(l.location::extensions.geometry) end,
         case when r.status <> 'completed' then l.updated_at end,
         r.origin_address, r.destination_address,
         extensions.st_y(r.destination::extensions.geometry), extensions.st_x(r.destination::extensions.geometry),
         r.started_at, r.completed_at,
         exists (select 1 from public.sos_alerts a where a.ride_id = r.id and a.status <> 'closed')
    from public.rides r
    join public.drivers d   on d.id = r.driver_id
    join public.profiles pd on pd.id = d.id
    join public.profiles pp on pp.id = r.passenger_id
    left join public.driver_locations l on l.driver_id = d.id
   where r.share_token = p_token
     and (r.status in ('assigned', 'arrived', 'in_progress')
          or (r.status = 'completed' and r.completed_at > now() - interval '30 minutes'));
$$;

revoke execute on function public.shared_trip(uuid) from public;
grant execute on function public.shared_trip(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. SOS
-- ---------------------------------------------------------------------
alter table public.sos_alerts
  add column notified_at    timestamptz,
  add column notified_count integer not null default 0,
  add column handler_note   text;

create index sos_alerts_open_idx on public.sos_alerts (created_at desc) where status <> 'closed';

-- Reemplaza la de la fase 1: si ya hay una alerta abierta de esta persona
-- para el mismo viaje en los últimos 10 minutos, devuelve esa (no duplica)
-- y actualiza la ubicación.
create or replace function public.raise_sos(p_ride_id uuid, lat double precision, lng double precision)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  existing uuid;
  new_id   uuid;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión'; end if;
  if p_ride_id is not null and not exists (
       select 1 from public.rides
        where id = p_ride_id and (passenger_id = auth.uid() or driver_id = auth.uid())) then
    raise exception 'Viaje no válido';
  end if;

  select id into existing from public.sos_alerts
   where raised_by = auth.uid() and ride_id is not distinct from p_ride_id
     and status <> 'closed' and created_at > now() - interval '10 minutes'
   order by created_at desc limit 1;

  if existing is not null then
    if lat is not null and lng is not null then
      update public.sos_alerts set location = public.make_point(lat, lng) where id = existing;
    end if;
    return existing;
  end if;

  insert into public.sos_alerts (ride_id, raised_by, location)
  values (p_ride_id, auth.uid(),
          case when lat is not null and lng is not null then public.make_point(lat, lng) end)
  returning id into new_id;
  return new_id;
end $$;

-- Servidor (Edge Function sos-alert): todo lo necesario para avisar a los contactos
create or replace function public.sos_alert_context(p_alert_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'alert_id', a.id,
    'raised_by', a.raised_by,
    'notified_at', a.notified_at,
    'person_name', p.full_name,
    'role', case when r.driver_id = a.raised_by then 'driver' else 'passenger' end,
    'share_token', r.share_token,
    'plate', d.plate,
    'moto_color', d.moto_color,
    'lat', extensions.st_y(a.location::extensions.geometry),
    'lng', extensions.st_x(a.location::extensions.geometry),
    'contacts', coalesce((select jsonb_agg(jsonb_build_object('name', c.name, 'phone', c.phone) order by c.created_at)
                            from public.trusted_contacts c where c.profile_id = a.raised_by), '[]'::jsonb))
    from public.sos_alerts a
    join public.profiles p on p.id = a.raised_by
    left join public.rides r on r.id = a.ride_id
    left join public.drivers d on d.id = r.driver_id
   where a.id = p_alert_id;
$$;

create or replace function public.mark_sos_notified(p_alert_id uuid, p_count integer)
returns void language sql security definer set search_path = '' as $$
  update public.sos_alerts set notified_at = now(), notified_count = p_count where id = p_alert_id;
$$;

-- ---------------------------------------------------------------------
-- 4. Panel
-- ---------------------------------------------------------------------

-- Alertas SOS con todo lo que el operador necesita para actuar
create or replace function public.admin_sos_alerts(p_include_closed boolean default false)
returns table (alert_id uuid, status text, created_at timestamptz, closed_at timestamptz,
               handler_note text, handled_by_name text, notified_count integer, notified_at timestamptz,
               raised_by_name text, raised_by_phone text, raised_by_role text,
               lat double precision, lng double precision,
               ride_id uuid, ride_status public.ride_status, origin_address text, destination_address text,
               passenger_name text, passenger_phone text,
               driver_name text, driver_phone text, plate text, moto_color text,
               driver_lat double precision, driver_lng double precision, driver_location_at timestamptz,
               share_token uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Solo administradores'; end if;
  return query
  select a.id, a.status, a.created_at, a.closed_at, a.handler_note, h.full_name,
         a.notified_count, a.notified_at,
         rb.full_name, rb.phone,
         case when r.driver_id = a.raised_by then 'driver' else 'passenger' end,
         extensions.st_y(a.location::extensions.geometry), extensions.st_x(a.location::extensions.geometry),
         r.id, r.status, r.origin_address, r.destination_address,
         pp.full_name, pp.phone,
         pd.full_name, pd.phone, d.plate, d.moto_color,
         extensions.st_y(l.location::extensions.geometry), extensions.st_x(l.location::extensions.geometry), l.updated_at,
         r.share_token
    from public.sos_alerts a
    join public.profiles rb       on rb.id = a.raised_by
    left join public.profiles h   on h.id = a.handled_by
    left join public.rides r      on r.id = a.ride_id
    left join public.profiles pp  on pp.id = r.passenger_id
    left join public.drivers d    on d.id = r.driver_id
    left join public.profiles pd  on pd.id = r.driver_id
    left join public.driver_locations l on l.driver_id = r.driver_id
   where p_include_closed or a.status <> 'closed'
   order by (a.status = 'closed'), a.created_at desc
   limit 200;
end $$;

-- Admin: atender o cerrar una alerta
create or replace function public.admin_update_sos(p_alert_id uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Solo administradores'; end if;
  if p_status not in ('attending', 'closed') then raise exception 'Estado no válido'; end if;
  if p_status = 'closed' and coalesce(btrim(p_note), '') = '' then
    raise exception 'Para cerrar una alerta escribe qué pasó';
  end if;
  update public.sos_alerts
     set status = p_status,
         handled_by = auth.uid(),
         handler_note = coalesce(nullif(btrim(p_note), ''), handler_note),
         closed_at = case when p_status = 'closed' then now() end
   where id = p_alert_id;
  if not found then raise exception 'La alerta no existe'; end if;
end $$;

-- Admin: SOAT y técnico-mecánica vencidos o por vencer (conductores aprobados o suspendidos)
create or replace function public.admin_expiring_documents(p_days integer default 15)
returns table (driver_id uuid, full_name text, phone text, plate text, driver_status public.driver_status,
               doc_type public.doc_type, expires_on date, days_left integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Solo administradores'; end if;
  return query
  select d.id, p.full_name, p.phone, d.plate, d.status, dd.type, dd.expires_on,
         (dd.expires_on - (now() at time zone 'America/Bogota')::date)::integer
    from public.driver_documents dd
    join public.drivers d  on d.id = dd.driver_id
    join public.profiles p on p.id = d.id
   where dd.type in ('soat', 'tecnomecanica')
     and dd.expires_on is not null
     and dd.expires_on <= (now() at time zone 'America/Bogota')::date + least(greatest(p_days, 0), 90)
     and d.status in ('approved', 'suspended')
   order by dd.expires_on, d.plate;
end $$;

-- Quién puede llamar qué
revoke execute on function public.raise_sos(uuid, double precision, double precision),
                           public.sos_alert_context(uuid), public.mark_sos_notified(uuid, integer),
                           public.admin_sos_alerts(boolean), public.admin_update_sos(uuid, text, text),
                           public.admin_expiring_documents(integer)
  from public, anon;
grant execute on function public.raise_sos(uuid, double precision, double precision),
                          public.admin_sos_alerts(boolean), public.admin_update_sos(uuid, text, text),
                          public.admin_expiring_documents(integer)
  to authenticated;
revoke execute on function public.sos_alert_context(uuid), public.mark_sos_notified(uuid, integer) from authenticated;
grant execute on function public.sos_alert_context(uuid), public.mark_sos_notified(uuid, integer) to service_role;

-- El panel escucha las alertas en tiempo real (la tabla ya está en la publicación desde la fase 1)
