-- Verify the approved experiment is attached to exactly the ten highest-ranked
-- eligible products. Zero-view products complete the list deterministically
-- when fewer than ten products have historical view events.
do $$
declare
  v_experiment public.operations_experiments;
  v_target_count integer;
  v_eligible_count integer;
  v_verified_at timestamptz := now();
begin
  select * into v_experiment
  from public.operations_experiments
  where experiment_key = 'dtf-product-cross-sell-2026-10'
  for update;

  if not found then
    raise exception 'Approved DTF experiment is missing';
  end if;

  select count(*) into v_eligible_count
  from public.products p
  where p.is_active is true
    and p.visibility = 'public'
    and p.product_type = 'physical';

  if v_eligible_count < 10 then
    raise exception 'Approved DTF experiment requires 10 eligible products; only % are available', v_eligible_count;
  end if;

  delete from public.operations_experiment_targets
  where experiment_id = v_experiment.id;

  insert into public.operations_experiment_targets(
    experiment_id,
    product_id,
    baseline_product_views,
    rank
  )
  select
    v_experiment.id,
    ranked.product_id,
    ranked.views,
    ranked.rank
  from (
    select
      p.id::text as product_id,
      count(m.id)::integer as views,
      row_number() over (
        order by count(m.id) desc,
          max(m.created_at) desc nulls last,
          p.id
      )::integer as rank
    from public.products p
    left join public.marketing_events m
      on m.product_id = p.id::text
      and m.created_at >= v_experiment.live_at - interval '30 days'
      and m.created_at < v_experiment.live_at
      and m.is_test is false
      and m.is_internal is false
      and m.event_name in ('product_view', 'view_product')
    where p.is_active is true
      and p.visibility = 'public'
      and p.product_type = 'physical'
    group by p.id
    order by count(m.id) desc,
      max(m.created_at) desc nulls last,
      p.id
    limit 10
  ) ranked;

  select count(*) into v_target_count
  from public.operations_experiment_targets
  where experiment_id = v_experiment.id;

  if v_target_count <> 10 then
    raise exception 'DTF experiment target verification failed: expected 10, found %', v_target_count;
  end if;

  update public.operations_action_executions
  set evidence = evidence || jsonb_build_object(
        'target_count', v_target_count,
        'targeting_rule', 'Top ten eligible public physical products by retained non-test, non-staff product-view events in the 30 days before activation; deterministic zero-view fallback.',
        'targeting_verified_at', v_verified_at
      ),
      last_updated_at = v_verified_at
  where approval_action_id = v_experiment.approval_action_id;

  update public.operations_experiments
  set updated_at = v_verified_at
  where id = v_experiment.id;
end
$$;
