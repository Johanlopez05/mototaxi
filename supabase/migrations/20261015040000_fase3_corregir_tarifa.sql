-- =====================================================================
--  MOTOTAXI · Fase 3: corrige estimate_fare()
-- =====================================================================
--  La versión de 20261015030000 calculaba con `meters` (double precision),
--  así que la tarifa salía como double precision y no como numeric. Postgres
--  rechazaba el resultado ("structure of query does not match function
--  result type") y por eso request_ride() fallaba SIEMPRE.
--  Aquí se calcula todo en numeric. Misma firma: no cambian los permisos.
-- =====================================================================

create or replace function public.estimate_fare(
  origin_lat double precision, origin_lng double precision,
  dest_lat double precision, dest_lng double precision)
returns table (distance_m integer, fare numeric)
language plpgsql stable security definer set search_path = '' as $$
declare
  s       public.fare_settings%rowtype;
  meters  numeric;
begin
  if origin_lat not between -90 and 90 or dest_lat not between -90 and 90
     or origin_lng not between -180 and 180 or dest_lng not between -180 and 180 then
    raise exception 'Ubicación no válida';
  end if;
  select * into s from public.fare_settings where id;

  meters := extensions.st_distance(public.make_point(origin_lat, origin_lng),
                                   public.make_point(dest_lat, dest_lng))::numeric * s.road_factor;
  if meters < 100 then raise exception 'El destino está muy cerca del punto de recogida'; end if;
  if meters > s.max_km * 1000 then raise exception 'El destino está demasiado lejos para un mototaxi'; end if;

  return query select round(meters)::integer,
                      greatest(s.min_cop,
                               ceil((s.base_cop + s.per_km_cop * meters / 1000) / s.round_to_cop) * s.round_to_cop);
end $$;
