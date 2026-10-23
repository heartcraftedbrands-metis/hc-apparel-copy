begin;
-- Shared, private operations data for the HC mobile companion. Public storefront
-- tables remain untouched. All device clients authenticate as an existing user.

create table if not exists public.ops_businesses (
  id text primary key,
  name text not null,
  source_system text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.ops_businesses (id, name, source_system) values
  ('heart-command-center', 'Heart Command Center', 'heart_command_center'),
  ('hc-apparel', 'HC Apparel', 'hc_apparel')
on conflict (id) do update set name = excluded.name, source_system = excluded.source_system;
create table if not exists public.ops_business_memberships (
  business_id text not null references public.ops_businesses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  access_role text not null check (access_role in ('owner','administrator','operations_manager','bookkeeper','viewer')),
  source_role text,
  can_view_combined boolean not null default false,
  can_manage_mileage boolean not null default false,
  can_manage_finances boolean not null default false,
  can_send_invoices boolean not null default false,
  can_manage_orders boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  primary key (business_id, user_id)
);
create or replace function public.ops_has_permission(target_business text, capability text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.ops_business_memberships membership
    where membership.business_id = target_business
      and membership.user_id = auth.uid()
      and case capability
        when 'view' then true
        when 'combined' then membership.can_view_combined
        when 'mileage' then membership.can_manage_mileage
        when 'finances' then membership.can_manage_finances
        when 'send_invoices' then membership.can_send_invoices
        when 'orders' then membership.can_manage_orders
        else false
      end
  );
$$;
revoke all on function public.ops_has_permission(text, text) from public;
grant execute on function public.ops_has_permission(text, text) to authenticated;
-- Reuse an existing account only when the complete accepted alias set resolves
-- to one administrator. This never creates auth users or guesses between two
-- similarly named profiles.
with requested_people as (
  select 'king-terik'::text as person_key, array['king terik']::text[] as aliases, 'owner'::text as access_role
  union all
  select 'yho', array['yho','yho / mario','mario']::text[], 'operations_manager'
), mapped as (
  select requested.person_key,
    min(profile.id::text)::uuid as user_id,
    min(profile.role) as source_role,
    requested.access_role
  from requested_people requested
  join public.profiles profile on lower(trim(profile.full_name)) = any(requested.aliases)
  group by requested.person_key, requested.access_role
  having count(*) = 1 and min(profile.role) = 'admin'
)
insert into public.ops_business_memberships (
  business_id, user_id, access_role, source_role, can_view_combined,
  can_manage_mileage, can_manage_finances, can_send_invoices, can_manage_orders
)
select business.id, mapped.user_id, mapped.access_role, mapped.source_role,
  true, true, true, true, true
from mapped cross join public.ops_businesses business
on conflict (business_id, user_id) do nothing;
create table if not exists public.ops_vehicles (
  id uuid primary key default gen_random_uuid(),
  business_id text references public.ops_businesses(id) on delete set null,
  nickname text not null,
  make text,
  model text,
  model_year integer check (model_year is null or model_year between 1900 and 2200),
  color text,
  plate_last_four text check (plate_last_four is null or char_length(plate_last_four) <= 4),
  vin_last_six text check (vin_last_six is null or char_length(vin_last_six) <= 6),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid not null default auth.uid() references auth.users(id)
);
create table if not exists public.ops_vehicle_year_odometer (
  vehicle_id uuid not null references public.ops_vehicles(id) on delete cascade,
  tax_year integer not null check (tax_year between 2000 and 2200),
  beginning_odometer numeric(12,1) check (beginning_odometer is null or beginning_odometer >= 0),
  ending_odometer numeric(12,1) check (ending_odometer is null or ending_odometer >= 0),
  recorded_by uuid not null default auth.uid() references auth.users(id),
  recorded_at timestamptz not null default now(),
  notes text,
  primary key (vehicle_id, tax_year),
  check (ending_odometer is null or beginning_odometer is null or ending_odometer >= beginning_odometer)
);
create table if not exists public.ops_mileage_rates (
  id uuid primary key default gen_random_uuid(),
  jurisdiction text not null default 'US',
  purpose text not null default 'business',
  effective_from date not null,
  effective_to date not null,
  cents_per_mile numeric(7,3) not null check (cents_per_mile >= 0),
  source_title text not null,
  source_url text not null,
  retrieved_at timestamptz not null,
  notes text,
  unique (jurisdiction, purpose, effective_from, effective_to),
  check (effective_to >= effective_from)
);
insert into public.ops_mileage_rates
  (jurisdiction, purpose, effective_from, effective_to, cents_per_mile, source_title, source_url, retrieved_at, notes)
values
  ('US','business','2025-01-01','2025-12-31',70.0,'IRS standard mileage rates','https://www.irs.gov/tax-professionals/standard-mileage-rates','2026-10-14T00:00:00-04:00','Estimate only; not an approved deduction or payment.'),
  ('US','business','2026-01-01','2026-06-30',72.5,'IRS standard mileage rates','https://www.irs.gov/tax-professionals/standard-mileage-rates','2026-10-14T00:00:00-04:00','Estimate only; first half of 2026.'),
  ('US','business','2026-07-01','2026-12-31',76.0,'IRS standard mileage rates','https://www.irs.gov/tax-professionals/standard-mileage-rates','2026-10-14T00:00:00-04:00','Estimate only; second half of 2026.')
on conflict (jurisdiction, purpose, effective_from, effective_to) do update
set cents_per_mile = excluded.cents_per_mile,
    source_title = excluded.source_title,
    source_url = excluded.source_url,
    retrieved_at = excluded.retrieved_at,
    notes = excluded.notes;
create table if not exists public.ops_mileage_trips (
  id uuid primary key,
  driver_user_id uuid not null references public.profiles(id),
  business_id text not null references public.ops_businesses(id),
  vehicle_id uuid references public.ops_vehicles(id),
  project_name text,
  started_at timestamptz not null,
  ended_at timestamptz,
  display_timezone text not null default 'America/New_York' check (display_timezone = 'America/New_York'),
  start_location_label text,
  destination_label text,
  start_latitude numeric(10,7),
  start_longitude numeric(10,7),
  end_latitude numeric(10,7),
  end_longitude numeric(10,7),
  business_purpose text,
  classification text not null default 'needs_review' check (classification in ('business','personal','commuting','needs_review')),
  status text not null default 'active' check (status in ('active','ended','reviewed','interrupted','voided')),
  start_odometer numeric(12,1) check (start_odometer is null or start_odometer >= 0),
  end_odometer numeric(12,1) check (end_odometer is null or end_odometer >= 0),
  gps_distance_miles numeric(12,3) check (gps_distance_miles is null or gps_distance_miles >= 0),
  odometer_distance_miles numeric(12,3) check (odometer_distance_miles is null or odometer_distance_miles >= 0),
  manual_distance_miles numeric(12,3) check (manual_distance_miles is null or manual_distance_miles >= 0),
  route_estimate_miles numeric(12,3) check (route_estimate_miles is null or route_estimate_miles >= 0),
  final_distance_miles numeric(12,3) check (final_distance_miles is null or final_distance_miles >= 0),
  measurement_source text check (measurement_source is null or measurement_source in ('gps','odometer','manual','route_estimate')),
  tracking_gap_count integer not null default 0 check (tracking_gap_count >= 0),
  tracking_gap_notes text,
  review_status text not null default 'needs_review' check (review_status in ('needs_review','reviewed','flagged')),
  notes text,
  attachments jsonb not null default '[]'::jsonb,
  import_fingerprint text,
  client_created_at timestamptz,
  client_updated_at timestamptz,
  sync_revision bigint not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid not null default auth.uid() references auth.users(id),
  check (ended_at is null or ended_at >= started_at),
  check (end_odometer is null or start_odometer is null or end_odometer >= start_odometer)
);
create unique index if not exists ops_one_active_trip_per_driver
  on public.ops_mileage_trips(driver_user_id) where status = 'active';
create index if not exists ops_mileage_trip_reporting_idx
  on public.ops_mileage_trips(business_id, driver_user_id, started_at desc, classification, review_status);
create unique index if not exists ops_mileage_trip_import_fingerprint_idx
  on public.ops_mileage_trips(import_fingerprint) where import_fingerprint is not null;
create table if not exists public.ops_mileage_points (
  id uuid primary key,
  trip_id uuid not null references public.ops_mileage_trips(id) on delete cascade,
  client_point_id text not null,
  recorded_at timestamptz not null,
  latitude numeric(10,7) not null,
  longitude numeric(10,7) not null,
  accuracy_meters numeric(10,2),
  altitude_meters numeric(10,2),
  speed_mps numeric(10,3),
  heading_degrees numeric(7,3),
  is_mocked boolean not null default false,
  uploaded_at timestamptz not null default now(),
  unique (trip_id, client_point_id)
);
create index if not exists ops_mileage_points_trip_time_idx
  on public.ops_mileage_points(trip_id, recorded_at);
create table if not exists public.ops_mileage_segments (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.ops_mileage_trips(id) on delete cascade,
  sequence_number integer not null check (sequence_number >= 1),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  distance_miles numeric(12,3) not null check (distance_miles >= 0),
  classification text not null check (classification in ('business','personal','commuting','needs_review')),
  purpose text,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  unique (trip_id, sequence_number),
  check (ended_at >= started_at)
);
create table if not exists public.ops_mileage_trip_audit (
  id bigint generated always as identity primary key,
  trip_id uuid not null,
  action text not null check (action in ('created','updated','ended','reviewed','voided')),
  actor_user_id uuid references auth.users(id),
  occurred_at timestamptz not null default now(),
  old_record jsonb,
  new_record jsonb not null,
  reason text
);
create table if not exists public.ops_shared_records (
  id text primary key,
  business_id text not null references public.ops_businesses(id),
  record_type text not null check (record_type in ('invoice','expense','receipt')),
  source_system text not null check (source_system in ('heart_command_center','mobile_companion')),
  source_record_id text not null,
  status text not null default 'draft',
  payload jsonb not null default '{}'::jsonb,
  revision bigint not null default 1,
  sync_state text not null default 'synced' check (sync_state in ('offline','pending','synced','failed','conflict')),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users(id),
  unique (source_system, record_type, source_record_id)
);
create table if not exists public.ops_invoice_number_state (
  business_id text primary key references public.ops_businesses(id) on delete cascade,
  number_prefix text not null,
  registry_ready boolean not null default false,
  last_reconciled_at timestamptz,
  last_reconciled_by uuid references auth.users(id),
  notes text
);
insert into public.ops_invoice_number_state(business_id, number_prefix, registry_ready, notes)
values ('hc-apparel', 'HCA', false, 'Heart Command Center must reconcile its existing invoice numbers before mobile numbering is enabled.')
on conflict (business_id) do nothing;
create table if not exists public.ops_invoice_number_registry (
  business_id text not null references public.ops_businesses(id),
  invoice_number text not null,
  record_id text not null,
  invoice_year integer not null,
  sequence_number integer not null,
  registered_at timestamptz not null default now(),
  registered_by uuid references auth.users(id),
  primary key (business_id, invoice_number),
  unique (business_id, invoice_year, sequence_number),
  unique (business_id, record_id)
);
create index if not exists ops_shared_records_business_type_idx
  on public.ops_shared_records(business_id, record_type, updated_at desc);
create table if not exists public.ops_action_queue (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null unique,
  business_id text not null references public.ops_businesses(id),
  record_id text references public.ops_shared_records(id),
  action_type text not null check (action_type in ('send_invoice','update_order','sync_record')),
  expected_revision bigint,
  request_payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','processing','completed','failed','cancelled','conflict')),
  requested_at timestamptz not null default now(),
  requested_by uuid not null default auth.uid() references auth.users(id),
  processing_started_at timestamptz,
  completed_at timestamptz,
  result_payload jsonb,
  failure_message text,
  retry_count integer not null default 0 check (retry_count between 0 and 20)
);
create table if not exists public.ops_receipt_files (
  id uuid primary key default gen_random_uuid(),
  record_id text references public.ops_shared_records(id) on delete cascade,
  business_id text not null references public.ops_businesses(id),
  storage_path text not null unique,
  original_filename text not null,
  media_type text not null,
  page_number integer not null default 1 check (page_number >= 1),
  byte_size bigint check (byte_size is null or byte_size >= 0),
  checksum_sha256 text,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid not null default auth.uid() references auth.users(id),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id)
);
create table if not exists public.ops_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id text references public.ops_businesses(id),
  category text not null,
  title text not null,
  body text not null,
  sensitive boolean not null default false,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create or replace function public.mobile_create_invoice_draft(
  record_id text,
  target_business text,
  draft_payload jsonb,
  client_time timestamptz default null
)
returns public.ops_shared_records
language plpgsql security definer set search_path = public as $$
declare state public.ops_invoice_number_state; v_year integer; next_sequence integer; invoice_number text; result public.ops_shared_records;
begin
  if auth.uid() is null or not public.ops_has_permission(target_business, 'finances') then
    raise exception 'Finance access is not authorized for this business.' using errcode = '42501';
  end if;
  select * into state from public.ops_invoice_number_state where business_id = target_business for update;
  if not found or state.registry_ready is not true then
    raise exception 'Invoice numbering is awaiting Heart Command Center reconciliation.' using errcode = '55000';
  end if;
  v_year := extract(year from timezone('America/New_York', coalesce(client_time, now())))::integer;
  select coalesce(max(sequence_number), 0) + 1 into next_sequence
  from public.ops_invoice_number_registry
  where business_id = target_business and ops_invoice_number_registry.invoice_year = v_year;
  invoice_number := state.number_prefix || '-' || v_year::text || '-' || lpad(next_sequence::text, 4, '0');
  insert into public.ops_shared_records(id,business_id,record_type,source_system,source_record_id,status,payload,created_by,updated_by)
  values (record_id,target_business,'invoice','mobile_companion',record_id,'draft',
    jsonb_set(coalesce(draft_payload,'{}'::jsonb),'{invoiceNumber}',to_jsonb(invoice_number),true),auth.uid(),auth.uid())
  returning * into result;
  insert into public.ops_invoice_number_registry(business_id,invoice_number,record_id,invoice_year,sequence_number,registered_by)
  values (target_business,invoice_number,record_id,v_year,next_sequence,auth.uid());
  return result;
end;
$$;
revoke all on function public.mobile_create_invoice_draft(text,text,jsonb,timestamptz) from public;
grant execute on function public.mobile_create_invoice_draft(text,text,jsonb,timestamptz) to authenticated;
create index if not exists ops_notifications_user_idx
  on public.ops_notifications(user_id, read_at, created_at desc);
-- Separate touch functions avoid relying on columns that not every table shares.
create or replace function public.ops_touch_membership()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); new.updated_by = coalesce(auth.uid(), new.updated_by); return new; end;
$$;
create or replace function public.ops_touch_trip()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); new.updated_by = coalesce(auth.uid(), new.updated_by); new.sync_revision = old.sync_revision + 1; return new; end;
$$;
create or replace function public.ops_touch_shared_record()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); new.updated_by = coalesce(auth.uid(), new.updated_by); new.revision = old.revision + 1; return new; end;
$$;
create or replace function public.ops_preserve_trip_identity()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.id is distinct from old.id or new.driver_user_id is distinct from old.driver_user_id or new.created_by is distinct from old.created_by then
    raise exception 'Trip identity and original creator cannot be changed.';
  end if;
  return new;
end;
$$;
create or replace function public.ops_preserve_shared_record_identity()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.id is distinct from old.id or new.source_system is distinct from old.source_system or new.source_record_id is distinct from old.source_record_id or new.record_type is distinct from old.record_type or new.created_by is distinct from old.created_by then
    raise exception 'Shared record identity and original creator cannot be changed.';
  end if;
  return new;
end;
$$;
drop trigger if exists ops_membership_touch on public.ops_business_memberships;
create trigger ops_membership_touch before update on public.ops_business_memberships
for each row execute function public.ops_touch_membership();
drop trigger if exists ops_vehicle_touch on public.ops_vehicles;
create trigger ops_vehicle_touch before update on public.ops_vehicles
for each row execute function public.ops_touch_membership();
drop trigger if exists ops_trip_touch on public.ops_mileage_trips;
create trigger ops_trip_touch before update on public.ops_mileage_trips
for each row execute function public.ops_touch_trip();
drop trigger if exists ops_trip_identity on public.ops_mileage_trips;
create trigger ops_trip_identity before update on public.ops_mileage_trips
for each row execute function public.ops_preserve_trip_identity();
drop trigger if exists ops_shared_record_touch on public.ops_shared_records;
create trigger ops_shared_record_touch before update on public.ops_shared_records
for each row execute function public.ops_touch_shared_record();
drop trigger if exists ops_shared_record_identity on public.ops_shared_records;
create trigger ops_shared_record_identity before update on public.ops_shared_records
for each row execute function public.ops_preserve_shared_record_identity();
create or replace function public.ops_audit_trip()
returns trigger language plpgsql security definer set search_path = public as $$
declare action_name text;
begin
  action_name := case
    when tg_op = 'INSERT' then 'created'
    when new.status = 'voided' and old.status is distinct from new.status then 'voided'
    when new.review_status = 'reviewed' and old.review_status is distinct from new.review_status then 'reviewed'
    when new.ended_at is not null and old.ended_at is null then 'ended'
    else 'updated'
  end;
  insert into public.ops_mileage_trip_audit(trip_id, action, actor_user_id, old_record, new_record)
  values (new.id, action_name, coalesce(auth.uid(), new.updated_by, new.created_by), case when tg_op = 'INSERT' then null else to_jsonb(old) end, to_jsonb(new));
  return new;
end;
$$;
drop trigger if exists ops_trip_audit on public.ops_mileage_trips;
create trigger ops_trip_audit after insert or update on public.ops_mileage_trips
for each row execute function public.ops_audit_trip();
create or replace function public.mobile_start_drive(
  trip_id uuid,
  target_business text,
  target_vehicle uuid,
  start_time timestamptz,
  start_label text default null,
  start_lat numeric default null,
  start_lng numeric default null,
  odometer numeric default null,
  client_time timestamptz default null
)
returns public.ops_mileage_trips
language plpgsql security invoker set search_path = public as $$
declare result public.ops_mileage_trips;
begin
  if auth.uid() is null or not public.ops_has_permission(target_business, 'mileage') then
    raise exception 'Mileage access is not authorized for this business.' using errcode = '42501';
  end if;
  if odometer is not null and odometer < 0 then raise exception 'Starting odometer cannot be negative.'; end if;
  if target_vehicle is not null and not exists (
    select 1 from public.ops_vehicles vehicle
    where vehicle.id = target_vehicle
      and vehicle.active is true
      and (vehicle.business_id is null or vehicle.business_id = target_business)
  ) then raise exception 'The selected vehicle is not available for this business.' using errcode = '23514'; end if;
  select * into result from public.ops_mileage_trips where id = trip_id;
  if found then
    if result.driver_user_id <> auth.uid() then raise exception 'Trip ID belongs to another driver.' using errcode = '42501'; end if;
    return result;
  end if;
  insert into public.ops_mileage_trips (
    id, driver_user_id, business_id, vehicle_id, started_at, start_location_label,
    start_latitude, start_longitude, start_odometer, client_created_at, created_by, updated_by
  ) values (
    trip_id, auth.uid(), target_business, target_vehicle, start_time, nullif(trim(start_label),''),
    start_lat, start_lng, odometer, client_time, auth.uid(), auth.uid()
  ) returning * into result;
  return result;
exception when unique_violation then
  raise exception 'This driver already has an active trip.' using errcode = '23505';
end;
$$;
create or replace function public.mobile_end_drive(
  trip_id uuid,
  end_time timestamptz,
  end_label text default null,
  end_lat numeric default null,
  end_lng numeric default null,
  gps_miles numeric default null,
  ending_odometer numeric default null,
  manual_miles numeric default null,
  selected_source text default 'gps',
  purpose text default null,
  selected_classification text default 'needs_review',
  gap_count integer default 0,
  gap_notes text default null,
  client_time timestamptz default null
)
returns public.ops_mileage_trips
language plpgsql security invoker set search_path = public as $$
declare trip public.ops_mileage_trips; chosen numeric;
begin
  select * into trip from public.ops_mileage_trips where id = trip_id for update;
  if not found or trip.driver_user_id <> auth.uid() then raise exception 'Active trip was not found.' using errcode = '42501'; end if;
  if trip.status <> 'active' then return trip; end if;
  if end_time < trip.started_at then raise exception 'End time cannot be before start time.'; end if;
  if ending_odometer is not null and trip.start_odometer is not null and ending_odometer < trip.start_odometer then raise exception 'Ending odometer cannot be less than starting odometer.'; end if;
  if selected_source not in ('gps','odometer','manual','route_estimate') then raise exception 'Invalid mileage source.'; end if;
  if selected_classification not in ('business','personal','commuting','needs_review') then raise exception 'Invalid trip classification.'; end if;
  chosen := case selected_source
    when 'gps' then gps_miles
    when 'odometer' then case when ending_odometer is not null and trip.start_odometer is not null then ending_odometer - trip.start_odometer end
    when 'manual' then manual_miles
    else null
  end;
  update public.ops_mileage_trips set
    ended_at = end_time,
    destination_label = nullif(trim(end_label),''),
    end_latitude = end_lat,
    end_longitude = end_lng,
    business_purpose = nullif(trim(purpose),''),
    classification = selected_classification,
    status = case when gap_count > 0 then 'interrupted' else 'ended' end,
    end_odometer = ending_odometer,
    gps_distance_miles = gps_miles,
    odometer_distance_miles = case when ending_odometer is not null and trip.start_odometer is not null then ending_odometer - trip.start_odometer end,
    manual_distance_miles = manual_miles,
    final_distance_miles = chosen,
    measurement_source = selected_source,
    tracking_gap_count = greatest(coalesce(gap_count,0),0),
    tracking_gap_notes = nullif(trim(gap_notes),''),
    review_status = 'needs_review',
    client_updated_at = client_time
  where id = trip_id returning * into trip;
  return trip;
end;
$$;
revoke all on function public.mobile_start_drive(uuid,text,uuid,timestamptz,text,numeric,numeric,numeric,timestamptz) from public;
revoke all on function public.mobile_end_drive(uuid,timestamptz,text,numeric,numeric,numeric,numeric,numeric,text,text,text,integer,text,timestamptz) from public;
grant execute on function public.mobile_start_drive(uuid,text,uuid,timestamptz,text,numeric,numeric,numeric,timestamptz) to authenticated;
grant execute on function public.mobile_end_drive(uuid,timestamptz,text,numeric,numeric,numeric,numeric,numeric,text,text,text,integer,text,timestamptz) to authenticated;
create or replace function public.mobile_replace_mileage_segments(
  target_trip uuid,
  segment_rows jsonb,
  expected_revision bigint
)
returns public.ops_mileage_trips
language plpgsql security definer set search_path = public as $$
declare
  trip public.ops_mileage_trips;
  segment record;
  segment_start timestamptz;
  segment_end timestamptz;
  segment_distance numeric;
  segment_class text;
  previous_end timestamptz;
  total_distance numeric := 0;
  segment_count integer := 0;
begin
  select * into trip from public.ops_mileage_trips where id = target_trip for update;
  if not found or auth.uid() is null or not (
    trip.driver_user_id = auth.uid() or public.ops_has_permission(trip.business_id, 'mileage')
  ) then raise exception 'Trip access is not authorized.' using errcode = '42501'; end if;
  if trip.status = 'active' or trip.ended_at is null or trip.final_distance_miles is null then
    raise exception 'Only a completed trip with a final distance can be split.';
  end if;
  if trip.sync_revision <> expected_revision then
    raise exception 'This trip changed elsewhere. Reload it before saving segments.' using errcode = '40001';
  end if;
  if jsonb_typeof(segment_rows) <> 'array' then raise exception 'Segments must be an array.'; end if;

  for segment in
    select value, ordinality from jsonb_array_elements(segment_rows) with ordinality as item(value, ordinality)
  loop
    segment_count := segment_count + 1;
    segment_start := (segment.value->>'startedAt')::timestamptz;
    segment_end := (segment.value->>'endedAt')::timestamptz;
    segment_distance := (segment.value->>'distanceMiles')::numeric;
    segment_class := segment.value->>'classification';
    if segment_distance < 0 or segment_class not in ('business','personal','commuting','needs_review') then
      raise exception 'Each segment needs a valid distance and classification.';
    end if;
    if segment_start < trip.started_at or segment_end > trip.ended_at or segment_end < segment_start then
      raise exception 'Segment times must stay inside the original trip.';
    end if;
    if previous_end is not null and segment_start <> previous_end then
      raise exception 'Segments must be ordered, contiguous, and non-overlapping.';
    end if;
    previous_end := segment_end;
    total_distance := total_distance + segment_distance;
  end loop;
  if segment_count < 2 then raise exception 'A mixed-purpose split requires at least two segments.'; end if;
  if abs(total_distance - trip.final_distance_miles) > 0.01 then
    raise exception 'Segment miles must equal the original trip distance.';
  end if;
  if (segment_rows->0->>'startedAt')::timestamptz <> trip.started_at or previous_end <> trip.ended_at then
    raise exception 'Segments must cover the complete trip without gaps.';
  end if;

  delete from public.ops_mileage_segments where trip_id = target_trip;
  insert into public.ops_mileage_segments(trip_id, sequence_number, started_at, ended_at, distance_miles, classification, purpose, created_by)
  select target_trip, ordinality::integer,
    (value->>'startedAt')::timestamptz, (value->>'endedAt')::timestamptz,
    (value->>'distanceMiles')::numeric, value->>'classification', nullif(trim(value->>'purpose'),''), auth.uid()
  from jsonb_array_elements(segment_rows) with ordinality as item(value, ordinality);

  update public.ops_mileage_trips set
    classification = 'needs_review', status = 'reviewed', review_status = 'reviewed'
  where id = target_trip returning * into trip;
  return trip;
end;
$$;
create or replace function public.mobile_import_mileage_trip(
  trip_id uuid,
  target_driver uuid,
  target_business text,
  target_vehicle uuid,
  start_time timestamptz,
  end_time timestamptz,
  distance_miles numeric,
  selected_classification text,
  purpose text,
  trip_notes text,
  source_fingerprint text
)
returns public.ops_mileage_trips
language plpgsql security definer set search_path = public as $$
declare result public.ops_mileage_trips;
begin
  if auth.uid() is null or not public.ops_has_permission(target_business, 'mileage') then
    raise exception 'Mileage import is not authorized for this business.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.ops_business_memberships where business_id = target_business and user_id = target_driver) then
    raise exception 'The selected driver is not assigned to this business.' using errcode = '23514';
  end if;
  if target_vehicle is not null and not exists (
    select 1 from public.ops_vehicles where id = target_vehicle and active is true
      and (business_id is null or business_id = target_business)
  ) then raise exception 'The selected vehicle is not available for this business.' using errcode = '23514'; end if;
  if end_time < start_time or distance_miles < 0 then raise exception 'Imported time or distance is invalid.'; end if;
  if selected_classification not in ('business','personal','commuting','needs_review') then raise exception 'Imported classification is invalid.'; end if;
  if nullif(trim(source_fingerprint),'') is null then raise exception 'A stable import fingerprint is required.'; end if;

  select * into result from public.ops_mileage_trips where import_fingerprint = source_fingerprint;
  if found then return result; end if;
  insert into public.ops_mileage_trips(
    id, driver_user_id, business_id, vehicle_id, started_at, ended_at,
    business_purpose, classification, status, manual_distance_miles,
    final_distance_miles, measurement_source, review_status, notes,
    import_fingerprint, created_by, updated_by
  ) values (
    trip_id, target_driver, target_business, target_vehicle, start_time, end_time,
    nullif(trim(purpose),''), selected_classification, 'ended', distance_miles,
    distance_miles, 'manual', 'needs_review', nullif(trim(trip_notes),''),
    source_fingerprint, auth.uid(), auth.uid()
  ) returning * into result;
  return result;
exception when unique_violation then
  select * into result from public.ops_mileage_trips where import_fingerprint = source_fingerprint;
  if found then return result; end if;
  raise;
end;
$$;
revoke all on function public.mobile_replace_mileage_segments(uuid,jsonb,bigint) from public;
revoke all on function public.mobile_import_mileage_trip(uuid,uuid,text,uuid,timestamptz,timestamptz,numeric,text,text,text,text) from public;
grant execute on function public.mobile_replace_mileage_segments(uuid,jsonb,bigint) to authenticated;
grant execute on function public.mobile_import_mileage_trip(uuid,uuid,text,uuid,timestamptz,timestamptz,numeric,text,text,text,text) to authenticated;
create or replace function public.mobile_safe_orders(target_business text default 'hc-apparel', search_text text default null, status_filter text default null, row_limit integer default 100)
returns table (
  id text, created_date timestamptz, customer_name text, customer_email text, customer_phone text,
  order_items jsonb, total_amount numeric, amount_paid numeric, balance_due numeric,
  status text, payment_status text, fulfillment_status text, tracking_number text,
  carrier text, shipped_date date
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.ops_has_permission(target_business, 'orders') then raise exception 'Order access is not authorized.' using errcode = '42501'; end if;
  if target_business <> 'hc-apparel' then return; end if;
  return query
  select o.id, o.created_date, o.customer_name, o.customer_email, o.customer_phone,
    coalesce((select jsonb_agg(item - array['supplier_cost','supplierCost','wholesaleCost','vendorCost','unitCost','blankCost','pricingAudit','internalNotes'])
      from jsonb_array_elements(coalesce(o.order_items, '[]'::jsonb)) item), '[]'::jsonb),
    o.total_amount, o.amount_paid, o.balance_due, o.status,
    o.payment_status, o.fulfillment_status, o.tracking_number, o.tracking_carrier, o.shipped_date
  from public.orders o
  where (status_filter is null or status_filter = '' or o.status = status_filter or o.fulfillment_status = status_filter)
    and (search_text is null or search_text = '' or o.id ilike '%' || search_text || '%' or o.customer_name ilike '%' || search_text || '%' or o.customer_email ilike '%' || search_text || '%')
  order by o.created_date desc
  limit least(greatest(row_limit,1),250);
end;
$$;
revoke all on function public.mobile_safe_orders(text,text,text,integer) from public;
grant execute on function public.mobile_safe_orders(text,text,text,integer) to authenticated;
create or replace view public.ops_mobile_account_setup_report
with (security_invoker = true)
as
select expected.display_name, expected.accepted_names,
  count(profile.id)::integer as matching_profile_count,
  min(profile.id::text) as matched_user_id,
  min(profile.email) as matched_email,
  min(profile.role) as existing_profile_role,
  case
    when count(profile.id) = 0 then 'missing_existing_account'
    when count(profile.id) > 1 then 'ambiguous_existing_accounts'
    when min(profile.role) <> 'admin' then 'existing_role_not_admin'
    else 'ready'
  end as setup_status
from (values
  ('King Terik', array['king terik']::text[]),
  ('YHO', array['yho','yho / mario','mario']::text[])
) expected(display_name, accepted_names)
left join public.profiles profile on lower(trim(profile.full_name)) = any(expected.accepted_names)
group by expected.display_name, expected.accepted_names;
alter table public.ops_businesses enable row level security;
alter table public.ops_business_memberships enable row level security;
alter table public.ops_vehicles enable row level security;
alter table public.ops_vehicle_year_odometer enable row level security;
alter table public.ops_mileage_rates enable row level security;
alter table public.ops_mileage_trips enable row level security;
alter table public.ops_mileage_points enable row level security;
alter table public.ops_mileage_segments enable row level security;
alter table public.ops_mileage_trip_audit enable row level security;
alter table public.ops_shared_records enable row level security;
alter table public.ops_invoice_number_state enable row level security;
alter table public.ops_invoice_number_registry enable row level security;
alter table public.ops_action_queue enable row level security;
alter table public.ops_receipt_files enable row level security;
alter table public.ops_notifications enable row level security;
drop policy if exists ops_businesses_read on public.ops_businesses;
create policy ops_businesses_read on public.ops_businesses for select to authenticated
using (public.ops_has_permission(id, 'view'));
drop policy if exists ops_memberships_read on public.ops_business_memberships;
create policy ops_memberships_read on public.ops_business_memberships for select to authenticated
using (user_id = auth.uid() or public.is_admin());
drop policy if exists ops_memberships_admin on public.ops_business_memberships;
create policy ops_memberships_admin on public.ops_business_memberships for all to authenticated
using (public.is_admin()) with check (public.is_admin());
drop policy if exists ops_vehicles_access on public.ops_vehicles;
create policy ops_vehicles_access on public.ops_vehicles for all to authenticated
using (business_id is null or public.ops_has_permission(business_id, 'mileage'))
with check (business_id is null or public.ops_has_permission(business_id, 'mileage'));
drop policy if exists ops_vehicle_odometer_access on public.ops_vehicle_year_odometer;
create policy ops_vehicle_odometer_access on public.ops_vehicle_year_odometer for all to authenticated
using (exists (select 1 from public.ops_vehicles vehicle where vehicle.id = vehicle_id and (vehicle.business_id is null or public.ops_has_permission(vehicle.business_id, 'mileage'))))
with check (exists (select 1 from public.ops_vehicles vehicle where vehicle.id = vehicle_id and (vehicle.business_id is null or public.ops_has_permission(vehicle.business_id, 'mileage'))));
drop policy if exists ops_mileage_rates_read on public.ops_mileage_rates;
create policy ops_mileage_rates_read on public.ops_mileage_rates for select to authenticated using (true);
drop policy if exists ops_trips_read on public.ops_mileage_trips;
create policy ops_trips_read on public.ops_mileage_trips for select to authenticated
using (driver_user_id = auth.uid() or public.ops_has_permission(business_id, 'mileage'));
drop policy if exists ops_trips_insert on public.ops_mileage_trips;
create policy ops_trips_insert on public.ops_mileage_trips for insert to authenticated
with check (driver_user_id = auth.uid() and created_by = auth.uid() and public.ops_has_permission(business_id, 'mileage'));
drop policy if exists ops_trips_update on public.ops_mileage_trips;
create policy ops_trips_update on public.ops_mileage_trips for update to authenticated
using (driver_user_id = auth.uid() or public.ops_has_permission(business_id, 'mileage'))
with check (driver_user_id = auth.uid() or public.ops_has_permission(business_id, 'mileage'));
drop policy if exists ops_points_access on public.ops_mileage_points;
create policy ops_points_access on public.ops_mileage_points for all to authenticated
using (exists (select 1 from public.ops_mileage_trips trip where trip.id = ops_mileage_points.trip_id and (trip.driver_user_id = auth.uid() or public.ops_has_permission(trip.business_id, 'mileage'))))
with check (exists (select 1 from public.ops_mileage_trips trip where trip.id = ops_mileage_points.trip_id and trip.driver_user_id = auth.uid()));
drop policy if exists ops_segments_access on public.ops_mileage_segments;
create policy ops_segments_access on public.ops_mileage_segments for all to authenticated
using (exists (select 1 from public.ops_mileage_trips trip where trip.id = ops_mileage_segments.trip_id and (trip.driver_user_id = auth.uid() or public.ops_has_permission(trip.business_id, 'mileage'))))
with check (exists (select 1 from public.ops_mileage_trips trip where trip.id = ops_mileage_segments.trip_id and (trip.driver_user_id = auth.uid() or public.ops_has_permission(trip.business_id, 'mileage'))));
drop policy if exists ops_trip_audit_read on public.ops_mileage_trip_audit;
create policy ops_trip_audit_read on public.ops_mileage_trip_audit for select to authenticated
using (exists (select 1 from public.ops_mileage_trips trip where trip.id = ops_mileage_trip_audit.trip_id and (trip.driver_user_id = auth.uid() or public.ops_has_permission(trip.business_id, 'mileage'))));
drop policy if exists ops_shared_records_read on public.ops_shared_records;
create policy ops_shared_records_read on public.ops_shared_records for select to authenticated
using (public.ops_has_permission(business_id, 'finances'));
drop policy if exists ops_shared_records_insert on public.ops_shared_records;
create policy ops_shared_records_insert on public.ops_shared_records for insert to authenticated
with check (public.ops_has_permission(business_id, 'finances') and created_by = auth.uid() and source_system = 'mobile_companion');
drop policy if exists ops_shared_records_update on public.ops_shared_records;
create policy ops_shared_records_update on public.ops_shared_records for update to authenticated
using (public.ops_has_permission(business_id, 'finances'))
with check (public.ops_has_permission(business_id, 'finances'));
drop policy if exists ops_invoice_state_read on public.ops_invoice_number_state;
create policy ops_invoice_state_read on public.ops_invoice_number_state for select to authenticated
using (public.ops_has_permission(business_id, 'finances'));
drop policy if exists ops_invoice_registry_read on public.ops_invoice_number_registry;
create policy ops_invoice_registry_read on public.ops_invoice_number_registry for select to authenticated
using (public.ops_has_permission(business_id, 'finances'));
drop policy if exists ops_action_queue_read on public.ops_action_queue;
create policy ops_action_queue_read on public.ops_action_queue for select to authenticated
using (requested_by = auth.uid() or public.ops_has_permission(business_id, 'finances'));
drop policy if exists ops_action_queue_insert on public.ops_action_queue;
create policy ops_action_queue_insert on public.ops_action_queue for insert to authenticated
with check (requested_by = auth.uid() and (
  (action_type = 'send_invoice' and public.ops_has_permission(business_id, 'send_invoices'))
  or (action_type = 'update_order' and public.ops_has_permission(business_id, 'orders'))
  or (action_type = 'sync_record' and public.ops_has_permission(business_id, 'finances'))
));
drop policy if exists ops_receipt_files_access on public.ops_receipt_files;
create policy ops_receipt_files_access on public.ops_receipt_files for all to authenticated
using (public.ops_has_permission(business_id, 'finances'))
with check (uploaded_by = auth.uid() and public.ops_has_permission(business_id, 'finances'));
drop policy if exists ops_notifications_access on public.ops_notifications;
create policy ops_notifications_access on public.ops_notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists ops_notifications_update on public.ops_notifications;
create policy ops_notifications_update on public.ops_notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('business-receipts', 'business-receipts', false, 20971520, array['image/jpeg','image/png','image/heic','image/heif','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists ops_receipts_upload on storage.objects;
create policy ops_receipts_upload on storage.objects for insert to authenticated
with check (bucket_id = 'business-receipts' and owner = auth.uid() and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists ops_receipts_read on storage.objects;
create policy ops_receipts_read on storage.objects for select to authenticated
using (bucket_id = 'business-receipts' and (
  owner = auth.uid() or exists (
    select 1 from public.ops_receipt_files receipt
    where receipt.storage_path = name and public.ops_has_permission(receipt.business_id, 'finances')
  )
));
drop policy if exists ops_receipts_delete on storage.objects;
create policy ops_receipts_delete on storage.objects for delete to authenticated
using (bucket_id = 'business-receipts' and owner = auth.uid());
grant select on public.ops_businesses, public.ops_business_memberships, public.ops_vehicles,
  public.ops_vehicle_year_odometer, public.ops_mileage_rates, public.ops_mileage_trips,
  public.ops_mileage_points, public.ops_mileage_segments, public.ops_mileage_trip_audit,
  public.ops_shared_records, public.ops_invoice_number_state, public.ops_invoice_number_registry,
  public.ops_action_queue, public.ops_receipt_files,
  public.ops_notifications, public.ops_mobile_account_setup_report to authenticated;
grant insert, update on public.ops_vehicles, public.ops_vehicle_year_odometer,
  public.ops_mileage_trips, public.ops_mileage_points, public.ops_mileage_segments,
  public.ops_shared_records, public.ops_action_queue, public.ops_receipt_files to authenticated;
grant update on public.ops_notifications to authenticated;
commit;
