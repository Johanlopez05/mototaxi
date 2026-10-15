-- =====================================================================
--  MOTOTAXI · Fase 2: funciones para la app del conductor
-- =====================================================================

-- Conductor: reportar su ubicación (la llama la tarea en segundo plano).
-- p_available = true mientras el botón "Disponible" está encendido. Si el
-- conductor tiene un viaje en curso, NUNCA queda disponible para otro.
create or replace function public.set_my_location(
  lat double precision, lng double precision,
  p_available boolean default true, p_heading smallint default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  busy boolean;
begin
  if not exists (select 1 from public.drivers where id = auth.uid() and status = 'approved') then
    raise exception 'Tu cuenta de conductor no está aprobada';
  end if;
  if lat not between -90 and 90 or lng not between -180 and 180 then
    raise exception 'Ubicación no válida';
  end if;

  busy := exists (select 1 from public.rides
                   where driver_id = auth.uid() and status in ('assigned', 'arrived', 'in_progress'));

  insert into public.driver_locations (driver_id, location, heading, is_available, updated_at)
  values (auth.uid(), public.make_point(lat, lng), p_heading, p_available and not busy, now())
  on conflict (driver_id) do update
     set location = excluded.location,
         heading = excluded.heading,
         is_available = excluded.is_available,
         updated_at = now();
end $$;

-- Conductor: apagar "Disponible"
create or replace function public.go_offline()
returns void language sql security definer set search_path = '' as $$
  update public.driver_locations set is_available = false where driver_id = auth.uid();
$$;

-- Conductor: su viaje en curso (si tiene uno), listo para pintar en la app
create or replace function public.driver_active_ride()
returns table (ride_id uuid, status public.ride_status,
               origin_lat double precision, origin_lng double precision, origin_address text,
               destination_lat double precision, destination_lng double precision, destination_address text,
               fare numeric, payment_method text, passenger_first_name text, passenger_phone text,
               assigned_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, r.status,
         extensions.st_y(r.origin::extensions.geometry), extensions.st_x(r.origin::extensions.geometry),
         r.origin_address,
         extensions.st_y(r.destination::extensions.geometry), extensions.st_x(r.destination::extensions.geometry),
         r.destination_address, r.fare, r.payment_method,
         split_part(coalesce(p.full_name, ''), ' ', 1), p.phone, r.assigned_at
    from public.rides r
    join public.profiles p on p.id = r.passenger_id
   where r.driver_id = auth.uid() and r.status in ('assigned', 'arrived', 'in_progress')
   order by r.assigned_at desc
   limit 1;
$$;

-- Si el CONDUCTOR cambia un documento (lo vuelve a subir o corrige el
-- vencimiento), ese documento vuelve a "pendiente" y se borra la nota del
-- revisor. El conductor nunca puede marcar sus documentos como aprobados.
create or replace function public.reset_document_review()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() = new.driver_id then
    new.status        := 'pending';
    new.reviewer_note := null;
    new.reviewed_by   := null;
    new.reviewed_at   := null;
  end if;
  return new;
end $$;

create trigger on_document_changed_by_driver
  before update on public.driver_documents
  for each row execute function public.reset_document_review();

-- Un documento aprobado solo se puede reemplazar si el conductor está
-- suspendido (p. ej. renovar el SOAT vencido) o le pidieron corregir.
drop policy docs_update on public.driver_documents;
create policy docs_update on public.driver_documents for update to authenticated
  using (
    driver_id = auth.uid()
    and (status <> 'approved'
         or exists (select 1 from public.drivers d
                     where d.id = auth.uid() and d.status in ('needs_fix', 'suspended')))
  )
  with check (driver_id = auth.uid());

-- Conductor: "Enviar a revisión". Exige los 6 documentos, con SOAT y
-- técnico-mecánica vigentes. Si estaba en "corregir" o suspendido por un
-- vencimiento, vuelve a la cola de revisión.
create or replace function public.submit_for_review()
returns public.driver_status language plpgsql security definer set search_path = '' as $$
declare
  current_status public.driver_status;
  missing integer;
begin
  select status into current_status from public.drivers where id = auth.uid();
  if current_status is null then raise exception 'Primero registra tu moto'; end if;

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

revoke execute on function public.set_my_location(double precision, double precision, boolean, smallint),
                           public.go_offline(), public.driver_active_ride(), public.submit_for_review() from public, anon;
grant  execute on function public.set_my_location(double precision, double precision, boolean, smallint),
                           public.go_offline(), public.driver_active_ride(), public.submit_for_review() to authenticated;
