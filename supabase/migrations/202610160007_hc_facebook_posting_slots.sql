alter table public.marketing_agent_settings
  add column if not exists facebook_posting_slots time[] not null default array['15:00'::time, '09:00'::time, '18:00'::time],
  add column if not exists facebook_posting_batch_size integer not null default 6 check (facebook_posting_batch_size > 0),
  add column if not exists facebook_next_slot_index integer not null default 2 check (facebook_next_slot_index between 1 and 3),
  add column if not exists facebook_next_batch_position integer not null default 1 check (facebook_next_batch_position > 0),
  add column if not exists facebook_last_planned_date date not null default '2026-11-05',
  add column if not exists facebook_cadence_days integer[] not null default array[4,3],
  add column if not exists facebook_next_cadence_index integer not null default 1 check (facebook_next_cadence_index between 1 and 2);
update public.marketing_agent_settings
set facebook_posting_slots = array['15:00'::time, '09:00'::time, '18:00'::time],
    facebook_posting_batch_size = 6,
    facebook_next_slot_index = 2,
    facebook_next_batch_position = 1,
    facebook_last_planned_date = greatest(facebook_last_planned_date, '2026-11-05'::date),
    facebook_cadence_days = array[4,3],
    facebook_next_cadence_index = 1
where id = true;
create or replace function public.reserve_next_hc_facebook_posting_slot()
returns table (
  scheduled_at timestamptz,
  timezone text,
  local_date date,
  local_time time,
  batch_position integer,
  batch_size integer,
  rotation_slot integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_settings public.marketing_agent_settings%rowtype;
  v_date date;
  v_time time;
  v_due timestamptz;
  v_attempt integer := 0;
  v_next_slot integer;
  v_next_position integer;
  v_next_cadence integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required';
  end if;

  select * into v_settings
  from public.marketing_agent_settings
  where id = true
  for update;

  if not found then
    raise exception 'Marketing Agent settings are missing';
  end if;

  v_time := v_settings.facebook_posting_slots[v_settings.facebook_next_slot_index];
  v_date := v_settings.facebook_last_planned_date
    + v_settings.facebook_cadence_days[v_settings.facebook_next_cadence_index];

  loop
    v_due := (v_date + v_time) at time zone 'America/New_York';
    exit when not exists (
      select 1
      from public.social_studio_posts post
      where post.platform = 'facebook'
        and post.workflow_status in ('Draft','Approved','Publishing','Scheduled')
        and post.scheduled_at = v_due
    );
    v_date := v_date + 1;
    v_attempt := v_attempt + 1;
    if v_attempt > 31 then
      raise exception 'No collision-free Facebook posting date is available in the next 31 days';
    end if;
  end loop;

  v_next_cadence := case when v_settings.facebook_next_cadence_index = array_length(v_settings.facebook_cadence_days, 1) then 1 else v_settings.facebook_next_cadence_index + 1 end;
  if v_settings.facebook_next_batch_position >= v_settings.facebook_posting_batch_size then
    v_next_position := 1;
    v_next_slot := case when v_settings.facebook_next_slot_index = array_length(v_settings.facebook_posting_slots, 1) then 1 else v_settings.facebook_next_slot_index + 1 end;
  else
    v_next_position := v_settings.facebook_next_batch_position + 1;
    v_next_slot := v_settings.facebook_next_slot_index;
  end if;

  update public.marketing_agent_settings
  set facebook_last_planned_date = v_date,
      facebook_next_cadence_index = v_next_cadence,
      facebook_next_batch_position = v_next_position,
      facebook_next_slot_index = v_next_slot,
      updated_at = now()
  where id = true;

  return query select v_due, 'America/New_York'::text, v_date, v_time,
    v_settings.facebook_next_batch_position, v_settings.facebook_posting_batch_size,
    v_settings.facebook_next_slot_index;
end;
$$;
revoke all on function public.reserve_next_hc_facebook_posting_slot() from public, anon, authenticated;
grant execute on function public.reserve_next_hc_facebook_posting_slot() to service_role;
comment on function public.reserve_next_hc_facebook_posting_slot() is
  'Atomically reserves the next collision-free HC Apparel Facebook proposal using six-post Eastern-time batches rotating 3 PM, 9 AM, and 6 PM. DST conversion is performed by PostgreSQL.';
