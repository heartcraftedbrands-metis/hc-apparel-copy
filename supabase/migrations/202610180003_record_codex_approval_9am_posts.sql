begin;
with owner as (
  select id from auth.users
  where lower(email) = 'heartfamilyco@gmail.com' and email_confirmed_at is not null
  limit 1
), approved as (
  update public.marketing_approval_requests a
  set status = 'approved',
      approved_version = a.content_version,
      approved_hash = a.content_hash,
      approved_by = o.id,
      approved_at = now(),
      approval_source = 'codex_conversation',
      approval_source_reference = 'Codex conversation 01a140b9-0df4-71f1-b38e-14d13cdd5d81',
      approval_evidence = 'Approve all four',
      updated_at = now()
  from owner o
  where a.id in (
    '52000000-0000-4000-8000-000000000002',
    '52000000-0000-4000-8000-000000000004',
    '52000000-0000-4000-8000-000000000005',
    '52000000-0000-4000-8000-000000000006'
  )
    and a.status = 'pending'
    and a.content_version = 1
  returning a.id,a.linked_post_id,a.content_version,a.approved_by,a.approved_at,a.scheduled_at
)
update public.social_studio_posts p
set workflow_status = 'Approved',
    approved_by = a.approved_by,
    approved_at = a.approved_at,
    scheduled_at = a.scheduled_at,
    updated_at = now()
from approved a
where p.id = a.linked_post_id
  and p.workflow_status = 'Draft';
insert into public.marketing_approval_events(approval_request_id,content_version,actor_id,event_type,details)
select a.id,a.content_version,a.approved_by,'approved_for_scheduling',
  jsonb_build_object(
    'scheduled_at',a.scheduled_at,
    'destination_page','HC Apparel',
    'approval_source','codex_conversation',
    'approval_source_reference','Codex conversation 01a140b9-0df4-71f1-b38e-14d13cdd5d81',
    'approval_evidence','Approve all four'
  )
from public.marketing_approval_requests a
where a.id in (
  '52000000-0000-4000-8000-000000000002',
  '52000000-0000-4000-8000-000000000004',
  '52000000-0000-4000-8000-000000000005',
  '52000000-0000-4000-8000-000000000006'
)
and a.approval_source = 'codex_conversation'
and not exists (
  select 1 from public.marketing_approval_events e
  where e.approval_request_id = a.id
    and e.content_version = a.content_version
    and e.event_type = 'approved_for_scheduling'
    and e.details->>'approval_source' = 'codex_conversation'
);
commit;
