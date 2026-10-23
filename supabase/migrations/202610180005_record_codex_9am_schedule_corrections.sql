begin;
with corrections(approval_request_id, previous_scheduled_at, scheduled_at, provider_id) as (
  values
    ('52000000-0000-4000-8000-000000000002'::uuid, '2026-11-12T14:00:00Z'::timestamptz, '2026-10-22T13:00:00Z'::timestamptz, '6ad4baa3938409f1d0cd6207'),
    ('52000000-0000-4000-8000-000000000004'::uuid, '2026-11-19T14:00:00Z'::timestamptz, '2026-10-29T13:00:00Z'::timestamptz, '6ad4bac10b0d72757a20336c'),
    ('52000000-0000-4000-8000-000000000005'::uuid, '2026-11-23T14:00:00Z'::timestamptz, '2026-11-02T14:00:00Z'::timestamptz, '6ad4bac40b0d72757a2033de'),
    ('52000000-0000-4000-8000-000000000006'::uuid, '2026-11-26T14:00:00Z'::timestamptz, '2026-11-05T14:00:00Z'::timestamptz, '6ad4bac70a208cb32364dff2')
), owner as (
  select id
  from auth.users
  where lower(email) = 'heartfamilyco@gmail.com'
    and email_confirmed_at is not null
  limit 1
)
insert into public.marketing_approval_events(
  approval_request_id,
  content_version,
  actor_id,
  event_type,
  details
)
select
  a.id,
  a.content_version,
  o.id,
  'codex_schedule_change_approved',
  jsonb_build_object(
    'previous_scheduled_at', c.previous_scheduled_at,
    'scheduled_at', c.scheduled_at,
    'timezone', 'America/New_York',
    'provider_id', c.provider_id,
    'buffer_status', 'scheduled',
    'approval_source', 'codex_conversation',
    'approval_source_reference', 'Codex conversation 01a140b9-0df4-71f1-b38e-14d13cdd5d81',
    'approval_evidence', 'Correct the 9 AM batch dates. This message authorizes these exact schedule corrections.'
  )
from corrections c
join public.marketing_approval_requests a on a.id = c.approval_request_id
cross join owner o
where a.scheduled_at = c.scheduled_at
  and a.platform_request_id = c.provider_id
  and not exists (
    select 1
    from public.marketing_approval_events e
    where e.approval_request_id = a.id
      and e.content_version = a.content_version
      and e.event_type = 'codex_schedule_change_approved'
      and e.details->>'provider_id' = c.provider_id
  );
commit;
