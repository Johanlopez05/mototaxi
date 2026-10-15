-- =====================================================================
--  MOTOTAXI · Fase 3: funciones para la app del pasajero
-- =====================================================================
--  1. La tarifa se calcula SIEMPRE en el servidor (por distancia). Antes
--     request_ride() aceptaba la tarifa que mandara la app.
--  2. passenger_ride(): el viaje del pasajero con su conductor, la ubicación
--     de la moto y el código de 4 dígitos, listo para pintar.
--  3. El pasajero ve la foto (selfie) de su conductor mientras el viaje
--     está activo, y ningún otro documento.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tarifa por distancia
--    distancia por calles ≈ línea recta × road_factor
--    tarifa = max(mínima, base + por_km × km), redondeada hacia arriba
--    Para cambiar los valores: update public.fare_settings set ... ;
-- ---------------------------------------------------------------------
create table public.fare_settings (
  id           boolean primary key default true check (id),   -- una sola fila
  base_cop     numeric(10,0) not null default 3000 check (base_cop >= 0),
  per_km_cop   numeric(10,0) not null default 1000 check (per_km_cop >= 0),
  min_cop      numeric(10,0) not null default 5000 check (min_cop >= 0),
  round_to_cop numeric(10,0) not null default 500  check (round_to_cop > 0),
  road_factor  numeric(4,2)  not null default 1.30 check (road_factor >= 1),
  max_km       numeric(5,1)  not null default 30   check (max_km > 0),
  updated_at   timestamptz   not null default now()
);
insert into public.fare_settings default values;

alter table public.fare_settings enable row level security;
revoke all on public.fare_settings from anon;
revoke insert, update, delete on public.fare_settings from authenticated;
create policy fare_settings_select on public.fare_settings for select to authenticated using (true);

-- Pasajero: precio y distancia estimada antes de pedir
create or replace function public.estimate_fare(
  origin_lat double precision, origin_lng double precision,
  dest_lat double precision, dest_lng double precision)
returns table (distance_m integer, fare numeric)
language plpgsql stable security definer set search_path = '' as $$
declare
  s       public.fare_settings%rowtype;
  meters  double precision;
begin
  if origin_lat not between -90 and 90 or dest_lat not between -90 and 90
     or origin_lng not between -180 and 180 or dest_lng not between -180 and 180 then
    raise exception 'Ubicación no válida';
  end if;
  select * into s from public.fare_settings where id;

  meters := extensions.st_distance(public.make_point(origin_lat, origin_lng),
                                   public.make_point(dest_lat, dest_lng)) * s.road_factor;
  if meters < 100 then raise exception 'El destino está muy cerca del punto de recogida'; end if;
  if meters > s.max_km * 1000 then raise exception 'El destino está demasiado lejos para un mototaxi'; end if;

  return query select round(meters)::integer,
                      greatest(s.min_cop,
                               ceil((s.base_cop + s.per_km_cop * meters / 1000) / s.round_to_cop) * s.round_to_cop);
end $$;

-- ---------------------------------------------------------------------
-- Pasajero: pedir un viaje (reemplaza la versión de la fase 1, que recibía
-- la tarifa desde la app). Devuelve el id del viaje.
-- ---------------------------------------------------------------------
drop function public.request_ride(double precision, double precision, text, double precision, double precision, text, numeric);

create function public.request_ride(
  origin_lat double precision, origin_lng double precision, origin_address text,
  dest_lat double precision, dest_lng double precision, dest_address text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  new_id    uuid;
  new_fare  numeric;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión'; end if;
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

-- ---------------------------------------------------------------------
-- 2. Pasajero: un viaje suyo (por id) o, sin id, su viaje activo.
--    cancel_reason: 'passenger' | 'driver' | 'no_drivers' (null si no se canceló)
--    El código solo se entrega mientras el viaje no ha iniciado.
-- ---------------------------------------------------------------------
create or replace function public.passenger_ride(p_ride_id uuid default null)
returns table (ride_id uuid, status public.ride_status,
               origin_lat double precision, origin_lng double precision, origin_address text,
               destination_lat double precision, destination_lng double precision, destination_address text,
               fare numeric, payment_method text, code text, cancel_reason text,
               requested_at timestamptz, assigned_at timestamptz, arrived_at timestamptz,
               started_at timestamptz, completed_at timestamptz,
               driver_id uuid, driver_name text, driver_phone text, plate text, moto_brand text, moto_color text,
               rating_avg numeric, rating_count integer,
               driver_lat double precision, driver_lng double precision, driver_heading smallint,
               driver_location_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, r.status,
         extensions.st_y(r.origin::extensions.geometry), extensions.st_x(r.origin::extensions.geometry),
         r.origin_address,
         extensions.st_y(r.destination::extensions.geometry), extensions.st_x(r.destination::extensions.geometry),
         r.destination_address, r.fare, r.payment_method,
         case when r.status in ('searching', 'assigned', 'arrived') then c.code end,
         case when r.status <> 'cancelled' then null
              when r.cancelled_by = r.passenger_id then 'passenger'
              when r.cancelled_by is not null then 'driver'
              else 'no_drivers' end,
         r.requested_at, r.assigned_at, r.arrived_at, r.started_at, r.completed_at,
         d.id, p.full_name, p.phone, d.plate, d.moto_brand, d.moto_color, d.rating_avg, d.rating_count,
         -- la ubicación de la moto solo mientras viene o va con el pasajero
         case when r.status in ('assigned', 'arrived', 'in_progress') then extensions.st_y(l.location::extensions.geometry) end,
         case when r.status in ('assigned', 'arrived', 'in_progress') then extensions.st_x(l.location::extensions.geometry) end,
         case when r.status in ('assigned', 'arrived', 'in_progress') then l.heading end,
         case when r.status in ('assigned', 'arrived', 'in_progress') then l.updated_at end
    from public.rides r
    left join public.ride_codes c        on c.ride_id = r.id
    left join public.drivers d           on d.id = r.driver_id
    left join public.profiles p          on p.id = r.driver_id
    left join public.driver_locations l  on l.driver_id = r.driver_id
   where r.passenger_id = auth.uid()
     and (case when p_ride_id is null
               then r.status in ('searching', 'assigned', 'arrived', 'in_progress')
               else r.id = p_ride_id end)
   order by r.requested_at desc
   limit 1;
$$;

-- ---------------------------------------------------------------------
-- 3. Foto del conductor para su pasajero (solo la selfie, solo con viaje activo)
-- ---------------------------------------------------------------------
create policy "pasajero ve la foto de su conductor" on storage.objects for select to authenticated
  using (bucket_id = 'driver-documents'
         and name like '%/selfie.jpg'
         and exists (select 1 from public.rides r
                      where r.passenger_id = auth.uid()
                        and r.status in ('assigned', 'arrived', 'in_progress')
                        and r.driver_id::text = (storage.foldername(name))[1]));

-- Quién puede llamar qué
revoke execute on function
  public.estimate_fare(double precision, double precision, double precision, double precision),
  public.request_ride(double precision, double precision, text, double precision, double precision, text),
  public.passenger_ride(uuid)
from public, anon;
grant execute on function
  public.estimate_fare(double precision, double precision, double precision, double precision),
  public.request_ride(double precision, double precision, text, double precision, double precision, text),
  public.passenger_ride(uuid)
to authenticated;
