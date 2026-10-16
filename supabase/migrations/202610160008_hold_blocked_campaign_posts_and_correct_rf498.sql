begin;

alter table public.social_studio_posts
  add column if not exists held_at timestamptz,
  add column if not exists hold_reason text,
  add column if not exists platform_cancelled_at timestamptz;

alter table public.social_studio_posts
  drop constraint if exists social_studio_posts_workflow_status_check;
alter table public.social_studio_posts
  add constraint social_studio_posts_workflow_status_check
  check (workflow_status in ('Draft','Approved','Scheduled','Publishing','Published','Failed','Held','Cancelled'));

create or replace function public.marketing_agent_validate_transition()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.workflow_status is not distinct from old.workflow_status then return new; end if;
  if not (
    (old.workflow_status = 'Draft' and new.workflow_status in ('Approved','Held','Cancelled')) or
    (old.workflow_status = 'Approved' and new.workflow_status in ('Draft','Scheduled','Publishing','Held','Cancelled')) or
    (old.workflow_status = 'Scheduled' and new.workflow_status in ('Publishing','Published','Failed','Held','Cancelled')) or
    (old.workflow_status = 'Publishing' and new.workflow_status in ('Scheduled','Published','Failed','Held','Cancelled')) or
    (old.workflow_status = 'Failed' and new.workflow_status in ('Approved','Publishing','Held','Cancelled')) or
    (old.workflow_status = 'Held' and new.workflow_status in ('Draft','Approved','Cancelled'))
  ) then
    raise exception 'Invalid marketing post workflow transition: % -> %', old.workflow_status, new.workflow_status;
  end if;
  return new;
end;
$$;

with held as (
  update public.social_studio_posts
  set workflow_status = 'Held',
      held_at = now(),
      hold_reason = 'Storefront-readiness hold: one or more pictured garments are not yet available on the public HC Apparel storefront.',
      updated_at = now()
  where id in (
    '41000000-0000-4000-8000-000000000001',
    '41000000-0000-4000-8000-000000000002',
    '41000000-0000-4000-8000-000000000003',
    '41000000-0000-4000-8000-000000000006'
  )
    and workflow_status in ('Scheduled','Publishing','Failed')
  returning id, campaign_id, platform_post_id
)
insert into public.marketing_agent_events(
  actor_id,campaign_id,post_id,event_type,from_status,to_status,platform_request_id,details
)
select null,campaign_id,id,'storefront_readiness_hold','Scheduled','Held',platform_post_id,
  jsonb_build_object('provider_id_preserved',true,'content_preserved',true,'approval_history_preserved',true)
from held;

do $$
declare
  v_id text := 'bf4b8a0f-4a7e-4126-8afa-ed6685df7f4a';
begin
  if not exists (
    select 1 from public.products
    where id = v_id
      and brand = 'American Apparel'
      and style_number = '02527'
      and name = 'American Apparel RF498'
  ) then
    raise exception 'The verified production RF498 record changed; no catalog copy was modified';
  end if;

  update public.products
  set name = 'American Apparel Unisex ReFlex Fleece Hoodie Sweatshirt',
      description = 'American Apparel RF498 Unisex ReFlex Fleece Hoodie Sweatshirt. Available as a blank garment in the listed colors and sizes. DTF and DTG printing are quoted separately after garment and artwork review.',
      updated_date = now()
  where id = v_id;

  if not exists (
    select 1 from public.storefront_products
    where id = v_id
      and name = 'American Apparel Unisex ReFlex Fleece Hoodie Sweatshirt'
  ) then
    raise exception 'The corrected RF498 record is not visible through the production storefront view';
  end if;
end;
$$;

commit;
