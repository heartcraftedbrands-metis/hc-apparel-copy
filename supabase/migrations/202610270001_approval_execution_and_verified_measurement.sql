begin;

-- Approval is an audited decision. Execution is a separate, durable lifecycle.
alter table public.operations_action_items drop constraint if exists operations_action_items_status_check;
alter table public.operations_action_items add constraint operations_action_items_status_check
  check (status in ('proposed','approved','revision_requested','deferred','queued','in_progress','blocked','completed','cancelled'));

create table if not exists public.operations_action_executions (
  id uuid primary key default gen_random_uuid(),
  approval_action_id uuid not null unique references public.operations_action_items(id) on delete cascade,
  implementation_task_id uuid not null unique references public.operations_action_items(id) on delete cascade,
  status text not null default 'awaiting_implementation' check (status in ('awaiting_implementation','queued','in_progress','blocked','completed')),
  worker_kind text,
  worker_label text,
  next_step text not null,
  evidence jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  last_updated_at timestamptz not null default now()
);
alter table public.operations_action_executions enable row level security;
create policy operations_action_executions_staff_read on public.operations_action_executions
  for select to authenticated using (public.is_hc_operations_staff());
revoke all on public.operations_action_executions from anon,authenticated;
grant select on public.operations_action_executions to authenticated;
grant all on public.operations_action_executions to service_role;

create or replace function public.ensure_operations_implementation_task(p_action public.operations_action_items)
returns public.operations_action_executions language plpgsql security definer set search_path=public,auth as $$
declare v_task public.operations_action_items; v_execution public.operations_action_executions;
begin
  if p_action.action_type <> 'proposal' then raise exception 'Only proposals create implementation tasks'; end if;
  insert into public.operations_action_items(
    generated_key,action_type,owner_role,title,finding,evidence,recommended_action,rationale,measure,
    baseline,target,review_date,budget_cents,action_path,source_kind,source_id,status,decision_note,decided_by,decided_at
  ) values (
    'implementation:'||p_action.id,'task',p_action.owner_role,'Implement approved action: '||p_action.title,
    'The owner approved the linked proposal. Approval records the decision; this task records whether authorized implementation actually starts and finishes.',
    jsonb_build_object('approval_action_id',p_action.id,'approved_scope',p_action.recommended_action,'approved_budget_cents',p_action.budget_cents),
    p_action.recommended_action,'Implementation must stay inside the approved scope and budget.',p_action.measure,
    p_action.baseline,p_action.target,p_action.review_date,p_action.budget_cents,
    '/AdminBusinessIntelligence?action='||p_action.id||'#action-'||p_action.id,'approved_proposal',p_action.id::text,
    'approved','Approved — awaiting implementation.',p_action.decided_by,p_action.decided_at
  ) on conflict(generated_key) do nothing;
  select * into v_task from public.operations_action_items where generated_key='implementation:'||p_action.id;
  insert into public.operations_action_executions(
    approval_action_id,implementation_task_id,status,worker_kind,worker_label,next_step,evidence
  ) values (
    p_action.id,v_task.id,'awaiting_implementation',null,null,
    'An authorized person or worker must accept this exact implementation task before it can be marked queued or in progress.',
    jsonb_build_object('approval_recorded_at',p_action.decided_at,'approved_budget_cents',p_action.budget_cents)
  ) on conflict(approval_action_id) do nothing;
  select * into v_execution from public.operations_action_executions where approval_action_id=p_action.id;
  return v_execution;
end $$;
revoke all on function public.ensure_operations_implementation_task(public.operations_action_items) from public,anon,authenticated;
grant execute on function public.ensure_operations_implementation_task(public.operations_action_items) to service_role;

create or replace function public.record_operations_action_decision(p_action_id uuid,p_decision text,p_note text default null)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_action public.operations_action_items; v_prior text; v_next text; v_role text;
  v_execution public.operations_action_executions; v_duplicate boolean:=false;
begin
  if not public.is_hc_operations_staff() then raise exception 'HC Apparel operations access required'; end if;
  select * into v_action from public.operations_action_items where id=p_action_id for update;
  if not found then raise exception 'Action item not found'; end if;
  select role into v_role from public.profiles where id=auth.uid();
  v_prior:=v_action.status;
  if p_decision in ('approve','revise','defer') then
    if not public.is_admin() then raise exception 'Owner approval is required for proposal decisions'; end if;
    if v_action.action_type<>'proposal' then raise exception 'Approve, revise, and defer apply only to proposals'; end if;
    if p_decision='revise' and nullif(btrim(coalesce(p_note,'')),'') is null then raise exception 'Revision guidance is required'; end if;
    v_next:=case p_decision when 'approve' then 'approved' when 'revise' then 'revision_requested' else 'deferred' end;
    if v_action.status=v_next then
      v_duplicate:=true;
    elsif (p_decision='approve' and v_action.status not in('proposed','revision_requested'))
       or (p_decision in('revise','defer') and v_action.status not in('proposed','revision_requested')) then
      raise exception 'This proposal already has a different final decision';
    end if;
  elsif p_decision='complete' then
    if v_action.action_type='proposal' then raise exception 'Approved proposals must be implemented as separately scoped work before completion'; end if;
    if not public.is_admin() and not (v_role='operations_manager' and v_action.owner_role='operations_manager') then raise exception 'This task is not assigned to your role'; end if;
    v_next:='completed';
    v_duplicate:=v_action.status='completed';
  elsif p_decision='reopen' then
    if not public.is_admin() then raise exception 'Owner access is required to reopen an action'; end if;
    v_next:=case when v_action.action_type='proposal' then 'proposed' else 'in_progress' end;
    v_duplicate:=v_action.status=v_next;
  else raise exception 'Unsupported decision';
  end if;
  if not v_duplicate then
    update public.operations_action_items set status=v_next,decision_note=nullif(btrim(coalesce(p_note,'')),''),decided_by=auth.uid(),decided_at=now(),
      completed_at=case when v_next='completed' then now() else null end,updated_at=now()
      where id=p_action_id returning * into v_action;
    insert into public.operations_action_decisions(action_id,decision,prior_status,new_status,note,decided_by)
      values(p_action_id,p_decision,v_prior,v_next,nullif(btrim(coalesce(p_note,'')),''),auth.uid());
  end if;
  if p_decision='approve' then v_execution:=public.ensure_operations_implementation_task(v_action); end if;
  return jsonb_build_object('action',to_jsonb(v_action),'duplicate_prevented',v_duplicate,'implementation',case when v_execution.id is null then null else to_jsonb(v_execution) end);
end $$;
revoke all on function public.record_operations_action_decision(uuid,text,text) from public;
grant execute on function public.record_operations_action_decision(uuid,text,text) to authenticated;

-- Backfill one implementation record for every approval already saved before this repair.
do $$ declare r public.operations_action_items; begin
  for r in select * from public.operations_action_items where action_type='proposal' and status='approved'
  loop perform public.ensure_operations_implementation_task(r); end loop;
end $$;

-- Privacy-conscious first-party measurement. Old rows remain untouched and explicitly limited.
alter table public.marketing_events
  add column if not exists session_id text,
  add column if not exists browser_id text,
  add column if not exists is_internal boolean not null default false,
  add column if not exists referrer_host text,
  add column if not exists acquisition_source text;
create index if not exists marketing_events_verified_funnel_idx on public.marketing_events(is_test,is_internal,event_name,created_at desc);
create index if not exists marketing_events_session_idx on public.marketing_events(session_id,created_at desc) where session_id is not null;

create table if not exists public.marketing_measurement_health (
  id boolean primary key default true check(id),
  status text not null check(status in('repairing','verified','degraded')),
  reliable_since timestamptz not null,
  owner_label text not null,
  summary text not null,
  detailed_diagnostics jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.marketing_measurement_health enable row level security;
create policy marketing_measurement_health_staff_read on public.marketing_measurement_health
  for select to authenticated using(public.is_hc_operations_staff());
revoke all on public.marketing_measurement_health from anon,authenticated;
grant select on public.marketing_measurement_health to authenticated;
grant all on public.marketing_measurement_health to service_role;

alter table public.marketing_events drop constraint if exists marketing_events_event_name_check;
alter table public.marketing_events add constraint marketing_events_event_name_check check(event_name in(
  'page_view','product_view','view_product','brand_view','category_view','account_signup','login','add_to_cart','remove_from_cart',
  'checkout_started','begin_checkout','shipping_quote_success','payment_method_selected','purchase_completed','purchase',
  'quote_request_submitted','bulk_quote_submit','contact_submitted','contact_submit','email_subscribed','newsletter_signup',
  'sale_promo_clicked','search_used','track_order_used','social_post_created','social_post_sent_to_buffer',
  'dtf_calculator_engaged','artwork_upload_success','artwork_upload_failure','freight_review_requested',
  'dtf_cross_sell_click','dtf_experiment_landing'
));

create or replace function public.log_marketing_event_v4(
  p_event_name text,p_product_id text default null,p_product_name text default null,
  p_acquisition_source text default null,p_path text default null,p_referrer_host text default null,
  p_attribution jsonb default '{}'::jsonb,p_session_id text default null,p_browser_id text default null,
  p_is_internal boolean default false,p_is_test boolean default false,p_dedupe_key text default null,p_context jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path=public,auth as $$
declare v_metadata jsonb; v_role text; v_internal boolean; v_path text; v_source text;
begin
  if p_event_name not in('page_view','product_view','brand_view','category_view','account_signup','login','add_to_cart','remove_from_cart','checkout_started','shipping_quote_success','payment_method_selected','quote_request_submitted','contact_submitted','email_subscribed','sale_promo_clicked','search_used','track_order_used','dtf_calculator_engaged','artwork_upload_success','artwork_upload_failure','freight_review_requested','dtf_cross_sell_click','dtf_experiment_landing') then return; end if;
  select role into v_role from public.profiles where id=auth.uid();
  v_internal:=coalesce(p_is_internal,false) or coalesce(v_role,'') in('admin','operations_manager');
  v_path:=case when coalesce(p_path,'') ~ '^/[A-Za-z0-9_./-]*$' then left(split_part(p_path,'?',1),240) end;
  v_source:=coalesce(nullif(left(p_attribution->>'utm_source',80),''),nullif(left(lower(p_referrer_host),120),''),nullif(left(p_acquisition_source,120),''),'direct_or_unknown');
  v_metadata:=jsonb_strip_nulls(jsonb_build_object(
    'utm_source',nullif(left(p_attribution->>'utm_source',80),''),'utm_medium',nullif(left(p_attribution->>'utm_medium',80),''),
    'utm_campaign',nullif(left(p_attribution->>'utm_campaign',120),''),'utm_content',nullif(left(p_attribution->>'utm_content',120),''),
    'placement',nullif(left(p_context->>'placement',80),''),'actor_scope',nullif(left(p_context->>'actor_scope',40),''),
    'experiment_key',nullif(left(p_context->>'experiment_key',120),''),'category',nullif(left(p_context->>'category',100),''),
    'cart_quantity',case when (p_context->>'cart_quantity')~'^\d{1,4}$' then (p_context->>'cart_quantity')::integer end,
    'width_inches',case when (p_context->>'width_inches')~'^\d+(\.\d+)?$' then (p_context->>'width_inches')::numeric end,
    'height_inches',case when (p_context->>'height_inches')~'^\d+(\.\d+)?$' then (p_context->>'height_inches')::numeric end,
    'quantity',case when (p_context->>'quantity')~'^\d{1,5}$' then (p_context->>'quantity')::integer end,
    'reason',nullif(left(p_context->>'reason',160),'')
  ));
  insert into public.marketing_events(event_name,product_id,product_name,source,path,metadata,dedupe_key,is_test,session_id,browser_id,is_internal,referrer_host,acquisition_source)
  values(p_event_name,left(p_product_id,100),left(p_product_name,180),v_source,v_path,v_metadata,nullif(left(p_dedupe_key,200),''),coalesce(p_is_test,false),
    case when coalesce(p_session_id,'')~'^[A-Za-z0-9-]{10,80}$' then p_session_id end,
    case when coalesce(p_browser_id,'')~'^[A-Za-z0-9-]{10,80}$' then p_browser_id end,v_internal,
    case when coalesce(p_referrer_host,'')~'^[A-Za-z0-9.-]{1,120}$' then lower(p_referrer_host) end,v_source)
  on conflict(dedupe_key) do update set metadata=excluded.metadata,path=excluded.path,is_internal=excluded.is_internal,is_test=excluded.is_test,
    session_id=excluded.session_id,browser_id=excluded.browser_id,referrer_host=excluded.referrer_host,acquisition_source=excluded.acquisition_source,source=excluded.source;
end $$;
revoke all on function public.log_marketing_event_v4(text,text,text,text,text,text,jsonb,text,text,boolean,boolean,text,jsonb) from public;
grant execute on function public.log_marketing_event_v4(text,text,text,text,text,text,jsonb,text,text,boolean,boolean,text,jsonb) to anon,authenticated;

-- Preserve DTF attribution on the owned draft so a later verified payment can be attributed across sessions.
alter table public.dtf_transfer_orders add column if not exists marketing_attribution jsonb not null default '{}'::jsonb;
create or replace function public.record_owned_dtf_marketing_attribution(p_order_id uuid,p_attribution jsonb)
returns void language plpgsql security definer set search_path=public,auth as $$
begin
  update public.dtf_transfer_orders set marketing_attribution=jsonb_strip_nulls(jsonb_build_object(
    'utm_source',nullif(left(p_attribution->>'utm_source',80),''),'utm_medium',nullif(left(p_attribution->>'utm_medium',80),''),
    'utm_campaign',nullif(left(p_attribution->>'utm_campaign',120),''),'utm_content',nullif(left(p_attribution->>'utm_content',120),''))),updated_at=now()
  where id=p_order_id and owner_user_id=auth.uid() and status='draft' and payment_status in('unpaid','quote_required','awaiting_payment');
  if not found then raise exception 'Owned editable DTF order not found'; end if;
end $$;
revoke all on function public.record_owned_dtf_marketing_attribution(uuid,jsonb) from public;
grant execute on function public.record_owned_dtf_marketing_attribution(uuid,jsonb) to authenticated;

create or replace function public.attribute_marketing_purchase(p_order_id text,p_attribution jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path=public,auth as $$
declare v_attribution jsonb; v_saved jsonb; v_revenue numeric; v_product_ids jsonb;
begin
  select coalesce(product_subtotal,total_amount-shipping_amount-sales_tax_amount,0),
    coalesce((select jsonb_agg(distinct coalesce(item->>'product_id',item->>'id')) from jsonb_array_elements(coalesce(o.order_items,'[]'::jsonb)) item where coalesce(item->>'product_id',item->>'id') is not null),'[]'::jsonb),
    coalesce((select d.marketing_attribution from public.dtf_transfer_orders d where d.linked_customer_order_id=o.id limit 1),'{}'::jsonb)
  into v_revenue,v_product_ids,v_saved from public.orders o
  where o.id=p_order_id and o.owner_user_id=auth.uid() and o.payment_status='paid' and o.is_sample=false and o.status not in('canceled','refunded');
  if not found then return; end if;
  v_attribution:=coalesce(nullif(p_attribution,'{}'::jsonb),v_saved,'{}'::jsonb);
  v_attribution:=jsonb_strip_nulls(jsonb_build_object(
    'utm_source',nullif(left(v_attribution->>'utm_source',80),''),'utm_medium',nullif(left(v_attribution->>'utm_medium',80),''),
    'utm_campaign',nullif(left(v_attribution->>'utm_campaign',120),''),'utm_content',nullif(left(v_attribution->>'utm_content',120),''),
    'order_id',p_order_id,'revenue',greatest(v_revenue,0),'product_ids',v_product_ids,'verified_by','paid_order_record'));
  insert into public.marketing_events(event_name,source,acquisition_source,metadata,dedupe_key,is_test,is_internal)
  values('purchase_completed',coalesce(v_attribution->>'utm_source','orders'),coalesce(v_attribution->>'utm_source','orders'),v_attribution,'purchase_completed:'||p_order_id,false,false)
  on conflict(dedupe_key) do update set metadata=excluded.metadata,source=excluded.source,acquisition_source=excluded.acquisition_source;
end $$;
revoke all on function public.attribute_marketing_purchase(text,jsonb) from public;
grant execute on function public.attribute_marketing_purchase(text,jsonb) to authenticated;

create or replace function public.marketing_record_event()
returns trigger language plpgsql security definer set search_path=public as $$
declare event_type text; v_metadata jsonb:='{}'::jsonb; v_source text;
begin
  if tg_table_name='orders' then
    if new.is_sample or new.payment_status<>'paid' or new.status in('canceled','refunded') then return new; end if;
    if tg_op='UPDATE' and old.payment_status='paid' then return new; end if;
    event_type:='purchase_completed';
    select coalesce(d.marketing_attribution,'{}'::jsonb) into v_metadata from public.dtf_transfer_orders d where d.linked_customer_order_id=new.id limit 1;
    v_metadata:=coalesce(v_metadata,'{}'::jsonb)||jsonb_build_object('order_id',new.id,'revenue',coalesce(new.product_subtotal,new.total_amount-new.shipping_amount-new.sales_tax_amount,0),'verified_by','paid_order_trigger');
    v_source:=coalesce(nullif(v_metadata->>'utm_source',''),'orders');
  elsif tg_table_name='quote_requests' then if new.is_sample then return new; end if; event_type:='bulk_quote_submit'; v_source:=tg_table_name;
  elsif tg_table_name='contact_messages' then if new.is_sample then return new; end if; event_type:='contact_submit'; v_source:=tg_table_name;
  elsif tg_table_name='social_studio_posts' then
    if tg_op='INSERT' then event_type:='social_post_created'; elsif new.buffer_post_id is not null and old.buffer_post_id is null then event_type:='social_post_sent_to_buffer'; else return new; end if;
    v_source:=tg_table_name;
  end if;
  if event_type is not null and (select internal_analytics_enabled from public.marketing_settings where id=true) then
    insert into public.marketing_events(event_name,source,acquisition_source,metadata,dedupe_key,is_test,is_internal)
    values(event_type,v_source,v_source,v_metadata,event_type||':'||new.id::text,false,false)
    on conflict(dedupe_key) do update set metadata=excluded.metadata,source=excluded.source,acquisition_source=excluded.acquisition_source;
  end if;
  return new;
end $$;

-- The exact approved $0 DTF experiment. It is activated only when this post-deploy migration runs.
create table if not exists public.operations_experiments (
  id uuid primary key default gen_random_uuid(),
  experiment_key text not null unique,
  approval_action_id uuid not null unique references public.operations_action_items(id),
  title text not null,
  campaign_key text not null unique,
  status text not null check(status in('ready','live','paused','completed','blocked')),
  budget_cents integer not null default 0 check(budget_cents>=0),
  baseline_start timestamptz not null,
  baseline_end timestamptz not null,
  live_at timestamptz,
  review_date date,
  baseline jsonb not null,
  event_definitions jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.operations_experiment_targets (
  experiment_id uuid not null references public.operations_experiments(id) on delete cascade,
  product_id text not null,
  baseline_product_views integer not null,
  rank integer not null,
  primary key(experiment_id,product_id),
  unique(experiment_id,rank)
);
alter table public.operations_experiments enable row level security;
alter table public.operations_experiment_targets enable row level security;
create policy operations_experiments_staff_read on public.operations_experiments for select to authenticated using(public.is_hc_operations_staff());
create policy operations_experiment_targets_staff_read on public.operations_experiment_targets for select to authenticated using(public.is_hc_operations_staff());
revoke all on public.operations_experiments,public.operations_experiment_targets from anon,authenticated;
grant select on public.operations_experiments,public.operations_experiment_targets to authenticated;
grant all on public.operations_experiments,public.operations_experiment_targets to service_role;

do $$ declare v_action public.operations_action_items; v_experiment uuid; v_task uuid; v_started timestamptz:=now(); begin
  select * into v_action from public.operations_action_items
    where id='299ec69f-69ee-4408-94a8-f09a9934fa55'::uuid and action_type='proposal' and status='approved';
  if found then
    perform public.ensure_operations_implementation_task(v_action);
    insert into public.operations_experiments(experiment_key,approval_action_id,title,campaign_key,status,budget_cents,baseline_start,baseline_end,live_at,review_date,baseline,event_definitions)
    values('dtf-product-cross-sell-2026-10',v_action.id,v_action.title,'dtf_cross_sell_2026_10','live',0,v_started-interval '7 days',v_started,v_started,(v_started at time zone 'America/New_York')::date+14,
      jsonb_build_object('period_start',v_started-interval '7 days','period_end',v_started,
        'product_views',(select count(*) from public.marketing_events where created_at>=v_started-interval '7 days' and created_at<v_started and is_test=false and event_name in('product_view','view_product')),
        'dtf_paid_orders',(select count(*) from public.marketing_events where created_at>=v_started-interval '7 days' and created_at<v_started and is_test=false and event_name in('purchase','purchase_completed') and metadata->>'utm_campaign'='dtf_cross_sell_2026_10'),
        'quality','Historical baseline retained, but staff exclusion, sessions, and acquisition source were not reliable before the repair timestamp.'),
      jsonb_build_object('link_click','dtf_cross_sell_click','landing','dtf_experiment_landing','calculator','dtf_calculator_engaged','artwork_upload','artwork_upload_success','freight_request','freight_review_requested','purchase','provider-confirmed paid non-test order trigger with the experiment campaign'))
    on conflict(experiment_key) do update set status='live',live_at=coalesce(public.operations_experiments.live_at,excluded.live_at),review_date=coalesce(public.operations_experiments.review_date,excluded.review_date),updated_at=now()
    returning id into v_experiment;
    insert into public.operations_experiment_targets(experiment_id,product_id,baseline_product_views,rank)
    select v_experiment,q.product_id,q.views,q.rank from (
      select m.product_id,count(*)::integer views,row_number() over(order by count(*) desc,max(m.created_at) desc,m.product_id)::integer rank
      from public.marketing_events m join public.products p on p.id::text=m.product_id
      where m.created_at>=v_started-interval '30 days' and m.is_test=false and m.event_name in('product_view','view_product')
        and p.is_active=true and p.visibility='public' and coalesce(p.product_type,'physical')='physical'
      group by m.product_id order by count(*) desc,max(m.created_at) desc limit 10
    ) q on conflict do nothing;
    select id into v_task from public.operations_action_items where generated_key='implementation:'||v_action.id;
    update public.operations_action_items set status='completed',completed_at=v_started,updated_at=v_started,
      decision_note='Implemented and activated within the approved $0 scope. The 14-day measurement period starts at the verified activation timestamp.' where id=v_task;
    update public.operations_action_items set review_date=(v_started at time zone 'America/New_York')::date+14,
      evidence=evidence||jsonb_build_object('implementation_started_at',v_started,'measurement_review_date',(v_started at time zone 'America/New_York')::date+14,'campaign_key','dtf_cross_sell_2026_10'),updated_at=v_started where id=v_action.id;
    update public.operations_action_executions set status='completed',worker_kind='codex_deployment',worker_label='Codex — authorized HC Apparel deployment',
      next_step='Measure the live experiment for 14 days; review verified results on the displayed review date.',started_at=v_started,completed_at=v_started,last_updated_at=v_started,
      evidence=jsonb_build_object('experiment_key','dtf-product-cross-sell-2026-10','campaign_key','dtf_cross_sell_2026_10','activated_at',v_started,'verification','Frontend offer is gated by this live experiment record; tracking uses server-deduplicated v4 events and paid-order triggers.')
      where approval_action_id=v_action.id;
  end if;
  insert into public.marketing_measurement_health(id,status,reliable_since,owner_label,summary,detailed_diagnostics,updated_at)
  values(true,'verified',v_started,'Codex — HC Apparel implementation','Verified measurement is active for new events. Historical events are preserved and labeled with their known limitations.',
    jsonb_build_object('staff_exclusion','Authenticated admin and operations-manager events are marked internal and excluded from growth KPIs.','test_exclusion','Explicit test visits and sample orders are retained but excluded.','identity','Random first-party session IDs and 90-day browser IDs; browser counts are estimates, not people.','attribution','Page path, sanitized referrer host, UTM campaign, and acquisition source are stored separately.','purchase','Purchases come from paid non-test order records, not confirmation-page visits.'),v_started)
  on conflict(id) do update set status='verified',reliable_since=excluded.reliable_since,owner_label=excluded.owner_label,summary=excluded.summary,detailed_diagnostics=excluded.detailed_diagnostics,updated_at=v_started;
end $$;

create or replace function public.public_dtf_cross_sell_offer(p_product_id text)
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce((select jsonb_build_object('active',true,'experiment_key',e.experiment_key,'campaign_key',e.campaign_key,'review_date',e.review_date)
    from public.operations_experiments e join public.operations_experiment_targets t on t.experiment_id=e.id
    where e.status='live' and t.product_id=p_product_id and e.live_at<=now() order by e.live_at desc limit 1),jsonb_build_object('active',false));
$$;
revoke all on function public.public_dtf_cross_sell_offer(text) from public;
grant execute on function public.public_dtf_cross_sell_offer(text) to anon,authenticated;

create or replace function public.operations_actionable_snapshot(p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path=public,auth as $$
declare v_base jsonb; v_start timestamptz:=now()-(greatest(1,least(coalesce(p_days,30),365))||' days')::interval;
  v_previous timestamptz; v_now timestamptz:=now(); v_reliable timestamptz; v_verified_start timestamptz; v_result jsonb;
begin
  if coalesce(auth.role(),'')<>'service_role' and not public.is_hc_operations_staff() then raise exception 'HC Apparel operations access required'; end if;
  v_previous:=v_start-(greatest(1,least(coalesce(p_days,30),365))||' days')::interval;
  select reliable_since into v_reliable from public.marketing_measurement_health where id=true;
  v_verified_start:=greatest(v_start,coalesce(v_reliable,v_now));
  v_base:=public.operations_business_snapshot(p_days);
  v_base:=jsonb_set(v_base,'{kpis,website_visits}',to_jsonb((select count(*) from public.marketing_events where created_at>=v_verified_start and created_at<v_now and is_test=false and is_internal=false and event_name='page_view')),true);
  v_base:=jsonb_set(v_base,'{kpis,qualified_traffic}','null'::jsonb,true);
  v_base:=jsonb_set(v_base,'{definitions,website_visits}',to_jsonb('Verified non-test, non-staff page-view events since the measurement repair; page views are not unique people.'::text),true);
  v_base:=jsonb_set(v_base,'{definitions,qualified_traffic}',to_jsonb('Not labeled until a documented qualification rule is approved.'::text),true);
  v_result:=v_base||jsonb_build_object(
    'reporting_period',jsonb_build_object('current_start',v_start,'current_end',v_now,'previous_start',v_previous,'previous_end',v_start,'timezone','America/New_York','verified_measurement_start',v_reliable),
    'measurement_health',(select to_jsonb(h)||jsonb_build_object('action_path','/AdminBusinessIntelligence#measurement-health') from public.marketing_measurement_health h where id=true),
    'traffic_quality',jsonb_build_object(
      'current_page_views',(select count(*) from public.marketing_events where created_at>=v_verified_start and created_at<v_now and is_test=false and is_internal=false and event_name='page_view'),
      'previous_page_views',null,
      'sessions',(select count(distinct session_id) from public.marketing_events where created_at>=v_verified_start and created_at<v_now and is_test=false and is_internal=false and session_id is not null and event_name='page_view'),
      'estimated_unique_browsers',(select count(distinct browser_id) from public.marketing_events where created_at>=v_verified_start and created_at<v_now and is_test=false and is_internal=false and browser_id is not null and event_name='page_view'),
      'test_rows_excluded',true,'staff_rows_excluded',true,
      'internal_or_admin_traffic_exclusion','Active for events on or after the verified measurement start. Authenticated admin and operations-manager activity is retained as internal diagnostics.',
      'unique_visitors','Not claimed. Estimated unique browsers use random first-party IDs and may not equal people.',
      'quality_warning','Pre-repair history is preserved separately and must not be compared as if it had the same coverage.',
      'landing_paths',(select coalesce(jsonb_agg(row_to_json(q)),'[]'::jsonb) from (select coalesce(nullif(path,''),'Unknown path') landing_path,count(*) views from public.marketing_events where created_at>=v_verified_start and created_at<v_now and is_test=false and is_internal=false and event_name='page_view' group by 1 order by count(*) desc limit 12) q),
      'acquisition_sources',(select coalesce(jsonb_agg(row_to_json(q)),'[]'::jsonb) from (select coalesce(nullif(acquisition_source,''),'direct_or_unknown') acquisition_source,count(*) events from public.marketing_events where created_at>=v_verified_start and created_at<v_now and is_test=false and is_internal=false group by 1 order by count(*) desc limit 12) q),
      'historical_limited',jsonb_build_object('period_start',v_start,'period_end',least(v_now,coalesce(v_reliable,v_now)),'page_views',(select count(*) from public.marketing_events where created_at>=v_start and created_at<least(v_now,coalesce(v_reliable,v_now)) and is_test=false and event_name='page_view'),'limitations','Staff exclusion, session counts, and clean acquisition-source classification were unavailable for these rows.')
    ),
    'funnel',(select jsonb_build_object(
      'page_view',count(*) filter(where event_name='page_view'),'product_view',count(*) filter(where event_name in('product_view','view_product')),
      'account_signup',count(*) filter(where event_name='account_signup'),'add_to_cart',count(*) filter(where event_name='add_to_cart'),
      'checkout_started',count(*) filter(where event_name in('checkout_started','begin_checkout')),
      'purchase_event',count(*) filter(where event_name in('purchase_completed','purchase')),
      'paid_orders',(select count(*) from public.orders where created_date>=v_verified_start and created_date<v_now and is_sample=false and payment_status='paid' and status not in('canceled','refunded')),
      'missing_tracking',jsonb_build_array('Journeys across browser resets, devices, or cleared storage remain unavailable unless a permitted authenticated order relationship exists.'),
      'interpretation','Counts describe instrumented steps. A lower later-stage count is not proof of customer abandonment until coverage is validated for the full period.'
    ) from public.marketing_events where created_at>=v_verified_start and created_at<v_now and is_test=false and is_internal=false),
    'actions',(select coalesce(jsonb_agg(row_to_json(q)),'[]'::jsonb) from (
      select a.*,e.status implementation_status,e.worker_kind,e.worker_label,e.next_step implementation_next_step,e.started_at implementation_started_at,e.completed_at implementation_completed_at,e.last_updated_at implementation_last_updated_at,e.evidence implementation_evidence,
        x.status experiment_status,x.live_at experiment_live_at,x.review_date experiment_review_date,x.campaign_key
      from public.operations_action_items a left join public.operations_action_executions e on e.approval_action_id=a.id left join public.operations_experiments x on x.approval_action_id=a.id
      where a.status in('proposed','approved','revision_requested','queued','in_progress','blocked') and a.source_kind<>'approved_proposal'
      order by case a.owner_role when 'owner' then 0 else 1 end,case a.action_type when 'proposal' then 0 when 'draft_review' then 1 else 2 end,a.review_date nulls last,a.created_at
    ) q),
    'recent_decisions',(select coalesce(jsonb_agg(row_to_json(q)),'[]'::jsonb) from (select d.*,a.title from public.operations_action_decisions d join public.operations_action_items a on a.id=d.action_id order by d.decided_at desc limit 20) q),
    'trend_assignment_status',case when exists(select 1 from public.industry_trends where trend_shape in('sustained','short spike') and coalesce(evidence,'')~*'(growth|increase|demand|search|sales|orders|survey|percent|%)') then 'Supported trend evidence is available.' else 'No trend task assigned: current sources do not provide sufficient dated demand or growth evidence.' end
  );
  return v_result;
end $$;
revoke all on function public.operations_actionable_snapshot(integer) from public;
grant execute on function public.operations_actionable_snapshot(integer) to authenticated,service_role;

-- Correct the already-approved wording: incomplete events are not proof of abandonment.
update public.operations_action_items set
  rationale='Pre-repair funnel events were incomplete, so this is an instrumentation-backed relevance experiment—not proof that customers abandoned a measured step. A product-to-DTF link uses an existing HC Apparel service and costs $0.',
  baseline=coalesce(baseline,'Historical baseline unavailable')||' Historical event coverage is limited until the verified measurement start shown in the dashboard.',
  updated_at=now()
where id='299ec69f-69ee-4408-94a8-f09a9934fa55'::uuid;

-- Keep the existing order/draft task refresh, then repair each new growth proposal with verified-only definitions.
alter function public.refresh_operations_action_items() rename to refresh_operations_action_items_legacy;
create or replace function public.refresh_operations_action_items()
returns void language plpgsql security definer set search_path=public,auth as $$
declare v_now timestamptz:=now(); v_reliable timestamptz; v_start timestamptz; v_week text;
  v_views integer; v_product integer; v_cart integer; v_checkout integer; v_paid integer;
begin
  if coalesce(auth.role(),'')<>'service_role' and not public.is_admin() then raise exception 'Service or owner access required'; end if;
  perform public.refresh_operations_action_items_legacy();
  select reliable_since into v_reliable from public.marketing_measurement_health where id=true;
  v_start:=greatest(v_now-interval '7 days',coalesce(v_reliable,v_now));
  v_week:=to_char((v_now at time zone 'America/New_York')::date,'IYYY-IW');
  select count(*) filter(where event_name='page_view'),count(*) filter(where event_name in('product_view','view_product')),
    count(*) filter(where event_name='add_to_cart'),count(*) filter(where event_name in('checkout_started','begin_checkout'))
  into v_views,v_product,v_cart,v_checkout from public.marketing_events
  where created_at>=v_start and created_at<v_now and is_test=false and is_internal=false;
  select count(*) into v_paid from public.orders where created_date>=v_start and created_date<v_now and is_sample=false and payment_status='paid' and status not in('canceled','refunded');
  update public.operations_action_items set
    finding=format('Since verified measurement began on %s: %s non-test, non-staff page views, %s product views, %s add-to-cart events, %s checkout starts, and %s paid non-test orders. These are instrumented step counts, not proof of abandonment.',to_char(v_start at time zone 'America/New_York','Mon DD, YYYY HH12:MI AM'),v_views,v_product,v_cart,v_checkout,v_paid),
    evidence=jsonb_build_object('period_start',v_start,'period_end',v_now,'page_views',v_views,'product_views',v_product,'add_to_cart',v_cart,'checkout_started',v_checkout,'paid_orders',v_paid,'test_rows_excluded',true,'staff_rows_excluded',true,'session_definition','Random first-party tab session','browser_definition','Random first-party 90-day browser estimate; not a person'),
    rationale='Instrumented counts do not by themselves prove customer abandonment. A bounded $0 experiment may test a relevant customer path only when its clicks, landings, interactions, uploads, freight requests, and verified paid orders are measured.',
    baseline=format('%s product views; %s add-to-cart events; %s paid non-test orders from %s through %s Eastern under the verified event definitions.',v_product,v_cart,v_paid,to_char(v_start at time zone 'America/New_York','Mon DD, YYYY'),to_char(v_now at time zone 'America/New_York','Mon DD, YYYY')),
    updated_at=now()
  where generated_key='growth-funnel-'||v_week and status='proposed';
end $$;
revoke all on function public.refresh_operations_action_items() from public,anon,authenticated;
grant execute on function public.refresh_operations_action_items() to service_role;
revoke all on function public.refresh_operations_action_items_legacy() from public,anon,authenticated;
grant execute on function public.refresh_operations_action_items_legacy() to service_role;

commit;
