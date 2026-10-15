-- =====================================================================
--  MOTOTAXI · Fase 2: reparto de solicitudes a conductores
-- =====================================================================
--  Cómo funciona:
--   1. El pasajero pide el viaje (request_ride) y llama a la Edge Function
--      dispatch-ride.
--   2. La función llama a dispatch_next_offer(): le ofrece el viaje al
--      conductor disponible MÁS CERCANO, con 15 segundos para responder.
--   3. El conductor recibe un push; responde con accept_ride() o reject_offer().
--   4. Si rechaza o no responde, se ofrece al siguiente más cercano. Las
--      3 primeras ofertas buscan a 2 km; las siguientes, a 4 km.
--   5. Tras 6 ofertas sin respuesta, el viaje se cancela por falta de motos.
--
--  Un conductor solo puede aceptar un viaje que le fue OFRECIDO y cuya
--  oferta sigue vigente. Nadie puede ver ni escoger viajes por su cuenta.
-- =====================================================================

-- Token de notificaciones push de cada persona (Expo push token)
alter table public.profiles add column push_token text;
grant update (push_token) on public.profiles to authenticated;

create type public.offer_status as enum ('pending', 'accepted', 'rejected', 'expired');

create table public.ride_offers (
  id            uuid primary key default gen_random_uuid(),
  ride_id       uuid not null references public.rides (id) on delete cascade,
  driver_id     uuid not null references public.drivers (id) on delete cascade,
  status        public.offer_status not null default 'pending',
  distance_m    integer not null,
  sent_at       timestamptz not null default now(),
  expires_at    timestamptz not null,
  responded_at  timestamptz,
  unique (ride_id, driver_id)
);
create index ride_offers_driver_pending_idx on public.ride_offers (driver_id) where status = 'pending';

alter table public.ride_offers enable row level security;

-- El conductor ve sus propias ofertas (para escucharlas en tiempo real); el admin, todas
create policy offers_select on public.ride_offers for select to authenticated
  using (driver_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------
-- Servidor (solo service_role): siguiente oferta de un viaje
--   outcome = 'offered'    → se creó una oferta; enviar push a push_token
--             'waiting'    → hay una oferta vigente; esperar
--             'assigned'   → el viaje ya no está buscando (aceptado o cancelado)
--             'no_drivers' → no hay motos; el viaje quedó cancelado
-- ---------------------------------------------------------------------
create or replace function public.dispatch_next_offer(p_ride_id uuid)
returns table (outcome text, driver_id uuid, push_token text, expires_at timestamptz,
               distance_m integer, origin_address text, destination_address text, fare numeric)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  r            public.rides%rowtype;
  sent         integer;
  radius       integer;
  chosen       uuid;
  chosen_dist  integer;
  new_expiry   timestamptz;
begin
  select * into r from public.rides where id = p_ride_id for update;
  if not found then raise exception 'Viaje no existe'; end if;
  if r.status <> 'searching' then
    return query select 'assigned'::text, r.driver_id, null::text, null::timestamptz,
                        null::integer, r.origin_address, r.destination_address, r.fare;
    return;
  end if;

  -- Vencer ofertas sin respuesta
  update public.ride_offers o set status = 'expired', responded_at = now()
   where o.ride_id = p_ride_id and o.status = 'pending' and o.expires_at <= now();

  -- ¿Sigue habiendo una oferta vigente?
  if exists (select 1 from public.ride_offers o where o.ride_id = p_ride_id and o.status = 'pending') then
    return query select 'waiting'::text, o.driver_id, null::text, o.expires_at, o.distance_m,
                        r.origin_address, r.destination_address, r.fare
                   from public.ride_offers o where o.ride_id = p_ride_id and o.status = 'pending';
    return;
  end if;

  select count(*) into sent from public.ride_offers o where o.ride_id = p_ride_id;

  if sent < 6 then
    -- Primero 2 km; si no hay nadie o ya van 3 ofertas, 4 km
    foreach radius in array (case when sent < 3 then array[2000, 4000] else array[4000] end) loop
      select l.driver_id, extensions.st_distance(l.location, r.origin)::integer
        into chosen, chosen_dist
        from public.driver_locations l
        join public.drivers d on d.id = l.driver_id
       where d.status = 'approved'
         and l.is_available
         and l.updated_at > now() - interval '2 minutes'
         and extensions.st_dwithin(l.location, r.origin, radius)
         and not exists (select 1 from public.ride_offers o
                          where o.driver_id = l.driver_id
                            and (o.ride_id = p_ride_id or o.status = 'pending'))
         and not exists (select 1 from public.rides x
                          where x.driver_id = l.driver_id and x.status in ('assigned', 'arrived', 'in_progress'))
       order by 2
       limit 1;
      exit when chosen is not null;
    end loop;
  end if;

  if chosen is null then
    update public.rides set status = 'cancelled', cancelled_at = now() where id = p_ride_id;
    return query select 'no_drivers'::text, null::uuid, null::text, null::timestamptz,
                        null::integer, r.origin_address, r.destination_address, r.fare;
    return;
  end if;

  new_expiry := now() + interval '15 seconds';
  insert into public.ride_offers (ride_id, driver_id, distance_m, expires_at)
  values (p_ride_id, chosen, chosen_dist, new_expiry);

  return query select 'offered'::text, chosen, p.push_token, new_expiry, chosen_dist,
                      r.origin_address, r.destination_address, r.fare
                 from public.profiles p where p.id = chosen;
end $$;

-- ---------------------------------------------------------------------
-- Conductor: aceptar (reemplaza la versión de la fase 1)
-- Ahora exige una oferta vigente para ese conductor.
-- ---------------------------------------------------------------------
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

  update public.ride_offers set status = 'accepted', responded_at = now()
   where ride_id = p_ride_id and driver_id = auth.uid()
     and status = 'pending' and expires_at > now();
  if not found then
    raise exception 'Esta solicitud ya no está disponible';
  end if;

  update public.rides
     set driver_id = auth.uid(), status = 'assigned', assigned_at = now()
   where id = p_ride_id and status = 'searching' and driver_id is null;
  get diagnostics ok = row_count;

  if ok then
    update public.driver_locations set is_available = false where driver_id = auth.uid();
  end if;
  return ok;
end $$;

-- Conductor: rechazar la oferta (el servidor pasa al siguiente)
create or replace function public.reject_offer(p_ride_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.ride_offers set status = 'rejected', responded_at = now()
   where ride_id = p_ride_id and driver_id = auth.uid() and status = 'pending';
end $$;

-- Conductor: la oferta vigente que tiene ahora (al abrir la app, por si no llegó el push)
create or replace function public.current_offer()
returns table (ride_id uuid, expires_at timestamptz, distance_m integer,
               origin_lat double precision, origin_lng double precision, origin_address text,
               destination_lat double precision, destination_lng double precision, destination_address text,
               fare numeric, passenger_first_name text)
language sql stable security definer set search_path = '' as $$
  select o.ride_id, o.expires_at, o.distance_m,
         extensions.st_y(r.origin::extensions.geometry), extensions.st_x(r.origin::extensions.geometry),
         r.origin_address,
         extensions.st_y(r.destination::extensions.geometry), extensions.st_x(r.destination::extensions.geometry),
         r.destination_address, r.fare,
         split_part(coalesce(p.full_name, ''), ' ', 1)
    from public.ride_offers o
    join public.rides r    on r.id = o.ride_id
    join public.profiles p on p.id = r.passenger_id
   where o.driver_id = auth.uid() and o.status = 'pending' and o.expires_at > now()
     and r.status = 'searching'
   limit 1;
$$;

revoke execute on function public.dispatch_next_offer(uuid) from public, anon, authenticated;
grant  execute on function public.dispatch_next_offer(uuid) to service_role;
revoke execute on function public.reject_offer(uuid), public.current_offer() from public, anon;
grant  execute on function public.reject_offer(uuid), public.current_offer(), public.accept_ride(uuid) to authenticated;

-- La app del conductor escucha sus ofertas en tiempo real
alter publication supabase_realtime add table public.ride_offers;
