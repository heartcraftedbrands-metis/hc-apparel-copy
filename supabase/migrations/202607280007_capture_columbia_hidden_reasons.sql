begin;

do $$
declare
  v_definition text;
  v_block text := E'  if v_activated = 0 then\n    raise exception ''No Columbia products passed the required public storefront checks'';\n  end if;\n\n';
begin
  select pg_get_functiondef('public.publish_eligible_columbia_session(text)'::regprocedure)
  into v_definition;
  if strpos(v_definition, v_block) = 0 then
    raise exception 'Expected Columbia zero-result guard was not found';
  end if;
  v_definition := replace(
    v_definition,
    v_block,
    E'  if v_activated = 0 then\n    raise notice ''No Columbia products passed; hidden reasons retained for review'';\n  end if;\n\n'
  );
  execute v_definition;
end;
$$;

create or replace function public.diagnose_latest_columbia_stage()
returns jsonb
language sql
security definer
set search_path = public
as $$
  with latest as (
    select import_session_id
    from public.ss_import_staging
    where import_session_id like 'ss-columbia-public-%'
    order by created_date desc
    limit 1
  ),
  reasons as (
    select hidden_reason, count(*)::integer as item_count
    from public.ss_columbia_publication_reviews
    where session_id = (select import_session_id from latest)
      and review_status = 'hidden'
    group by hidden_reason
  )
  select jsonb_build_object(
    'session_id', (select import_session_id from latest),
    'published_reviews', (
      select count(*)::integer
      from public.ss_columbia_publication_reviews
      where session_id = (select import_session_id from latest)
        and review_status = 'published'
    ),
    'hidden_reviews', (
      select count(*)::integer
      from public.ss_columbia_publication_reviews
      where session_id = (select import_session_id from latest)
        and review_status = 'hidden'
    ),
    'hidden_reason_counts', coalesce(
      (select jsonb_object_agg(hidden_reason, item_count) from reasons),
      '{}'::jsonb
    )
  );
$$;

commit;
