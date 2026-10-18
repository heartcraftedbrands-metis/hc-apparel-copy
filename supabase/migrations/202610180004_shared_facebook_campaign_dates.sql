begin;

alter table public.marketing_agent_settings
  add column if not exists facebook_campaign_dates date[] not null default array[
    '2026-10-19'::date,'2026-10-22'::date,'2026-10-26'::date,
    '2026-10-29'::date,'2026-11-02'::date,'2026-11-05'::date
  ];

update public.marketing_agent_settings
set facebook_posting_slots = array['15:00'::time, '09:00'::time, '18:00'::time],
    facebook_campaign_dates = array[
      '2026-10-19'::date,'2026-10-22'::date,'2026-10-26'::date,
      '2026-10-29'::date,'2026-11-02'::date,'2026-11-05'::date
    ],
    facebook_posting_batch_size = 6,
    facebook_next_slot_index = 3,
    facebook_next_batch_position = 1,
    updated_at = now()
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
  v_next_slot integer;
  v_next_position integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required';
  end if;

  select * into v_settings
  from public.marketing_agent_settings
  where id = true
  for update;

  if not found then raise exception 'Marketing Agent settings are missing'; end if;
  if array_length(v_settings.facebook_campaign_dates,1) <> v_settings.facebook_posting_batch_size then
    raise exception 'Facebook campaign dates must contain exactly % dates', v_settings.facebook_posting_batch_size;
  end if;

  v_date := v_settings.facebook_campaign_dates[v_settings.facebook_next_batch_position];
  v_time := v_settings.facebook_posting_slots[v_settings.facebook_next_slot_index];
  v_due := (v_date + v_time) at time zone 'America/New_York';

  if exists (
    select 1 from public.social_studio_posts post
    where post.platform = 'facebook'
      and post.workflow_status in ('Draft','Approved','Publishing','Scheduled')
      and post.scheduled_at = v_due
  ) then
    raise exception 'The HC Apparel Facebook slot at % America/New_York is already reserved', v_date + v_time;
  end if;

  if v_settings.facebook_next_batch_position >= v_settings.facebook_posting_batch_size then
    v_next_position := 1;
    v_next_slot := case
      when v_settings.facebook_next_slot_index = array_length(v_settings.facebook_posting_slots,1) then 1
      else v_settings.facebook_next_slot_index + 1
    end;
  else
    v_next_position := v_settings.facebook_next_batch_position + 1;
    v_next_slot := v_settings.facebook_next_slot_index;
  end if;

  update public.marketing_agent_settings
  set facebook_next_batch_position = v_next_position,
      facebook_next_slot_index = v_next_slot,
      updated_at = now()
  where id = true;

  return query select v_due,'America/New_York'::text,v_date,v_time,
    v_settings.facebook_next_batch_position,v_settings.facebook_posting_batch_size,
    v_settings.facebook_next_slot_index;
end;
$$;

revoke all on function public.reserve_next_hc_facebook_posting_slot() from public,anon,authenticated;
grant execute on function public.reserve_next_hc_facebook_posting_slot() to service_role;

comment on function public.reserve_next_hc_facebook_posting_slot() is
  'Reserves one of six shared Eastern campaign dates. Each six-post batch uses one time slot; batches rotate 3 PM, 9 AM, and 6 PM. Only the same Page timestamp collides.';

commit;
