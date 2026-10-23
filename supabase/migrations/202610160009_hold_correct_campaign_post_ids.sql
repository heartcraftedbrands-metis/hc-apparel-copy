begin;
with targets(id) as (
  values
    ('31000000-0000-4000-8000-000000000001'::uuid),
    ('31000000-0000-4000-8000-000000000002'::uuid),
    ('31000000-0000-4000-8000-000000000003'::uuid),
    ('31000000-0000-4000-8000-000000000006'::uuid)
), held as (
  update public.social_studio_posts post
  set workflow_status = 'Held',
      held_at = now(),
      hold_reason = 'Storefront-readiness hold: one or more pictured garments are not yet available on the public HC Apparel storefront.',
      updated_at = now()
  from targets
  where post.id = targets.id
    and post.workflow_status in ('Scheduled','Publishing','Failed')
  returning post.id, post.campaign_id, post.platform_post_id
)
insert into public.marketing_agent_events(
  actor_id,campaign_id,post_id,event_type,from_status,to_status,platform_request_id,details
)
select null,campaign_id,id,'storefront_readiness_hold','Scheduled','Held',platform_post_id,
  jsonb_build_object('provider_id_preserved',true,'content_preserved',true,'approval_history_preserved',true)
from held;
do $$
begin
  if (select count(*) from public.social_studio_posts
      where id in (
        '31000000-0000-4000-8000-000000000001',
        '31000000-0000-4000-8000-000000000002',
        '31000000-0000-4000-8000-000000000003',
        '31000000-0000-4000-8000-000000000006'
      ) and workflow_status = 'Held') <> 4 then
    raise exception 'All four storefront-blocked posts were not placed on hold';
  end if;
end;
$$;
commit;
