begin;

create table if not exists public.operations_action_items (
  id uuid primary key default gen_random_uuid(),
  generated_key text not null unique,
  action_type text not null check (action_type in ('proposal','task','draft_review')),
  owner_role text not null check (owner_role in ('owner','operations_manager')),
  title text not null,
  finding text not null,
  evidence jsonb not null default '{}'::jsonb,
  recommended_action text not null,
  rationale text not null,
  measure text not null,
  baseline text,
  target text,
  review_date date,
  budget_cents integer not null default 0 check (budget_cents >= 0),
  action_path text not null check (action_path ~ '^/(AdminBusinessIntelligence|AdminOrderDetail|AdminDTFTransfers|AdminOperationsInbox)(\?|$)'),
  source_kind text,
  source_id text,
  status text not null default 'proposed' check (status in ('proposed','approved','revision_requested','deferred','in_progress','completed','cancelled')),
  decision_note text,
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.operations_action_decisions (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references public.operations_action_items(id) on delete cascade,
  decision text not null check (decision in ('approve','revise','defer','complete','reopen')),
  prior_status text not null,
  new_status text not null,
  note text,
  decided_by uuid not null references auth.users(id),
  decided_at timestamptz not null default now()
);

alter table public.operations_action_items enable row level security;
alter table public.operations_action_decisions enable row level security;
create policy operations_action_items_staff_read on public.operations_action_items for select to authenticated using(public.is_hc_operations_staff());
create policy operations_action_decisions_staff_read on public.operations_action_decisions for select to authenticated using(public.is_hc_operations_staff());
revoke all on public.operations_action_items,public.operations_action_decisions from anon,authenticated;
grant select on public.operations_action_items,public.operations_action_decisions to authenticated;
grant all on public.operations_action_items,public.operations_action_decisions to service_role;

create or replace function public.record_operations_action_decision(p_action_id uuid,p_decision text,p_note text default null)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_action public.operations_action_items; v_prior text; v_next text; v_role text;
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
  elsif p_decision='complete' then
    if v_action.action_type='proposal' then raise exception 'Approved proposals must be implemented as separately scoped work before completion'; end if;
    if not public.is_admin() and not (v_role='operations_manager' and v_action.owner_role='operations_manager') then raise exception 'This task is not assigned to your role'; end if;
    v_next:='completed';
  elsif p_decision='reopen' then
    if not public.is_admin() then raise exception 'Owner access is required to reopen an action'; end if;
    v_next:=case when v_action.action_type='proposal' then 'proposed' else 'in_progress' end;
  else raise exception 'Unsupported decision';
  end if;
  update public.operations_action_items set status=v_next,decision_note=nullif(btrim(coalesce(p_note,'')),''),decided_by=auth.uid(),decided_at=now(),completed_at=case when v_next='completed' then now() else null end,updated_at=now() where id=p_action_id returning * into v_action;
  insert into public.operations_action_decisions(action_id,decision,prior_status,new_status,note,decided_by) values(p_action_id,p_decision,v_prior,v_next,nullif(btrim(coalesce(p_note,'')),''),auth.uid());
  return to_jsonb(v_action);
end $$;
revoke all on function public.record_operations_action_decision(uuid,text,text) from public;
grant execute on function public.record_operations_action_decision(uuid,text,text) to authenticated;

create or replace function public.refresh_operations_action_items()
returns void language plpgsql security definer set search_path=public,auth as $$
declare
  v_now timestamptz:=now(); v_start timestamptz:=now()-interval '7 days'; v_prior_start timestamptz:=now()-interval '14 days';
  v_visits integer; v_prior_visits integer; v_views integer; v_cart integer; v_checkout integer; v_purchases integer; v_paid integer;
  v_week text:=to_char((now() at time zone 'America/New_York')::date,'IYYY-IW'); r record;
begin
  if coalesce(auth.role(),'')<>'service_role' and not public.is_admin() then raise exception 'Service or owner access required'; end if;
  select count(*) into v_visits from public.marketing_events where created_at>=v_start and created_at<v_now and is_test=false and event_name='page_view';
  select count(*) into v_prior_visits from public.marketing_events where created_at>=v_prior_start and created_at<v_start and is_test=false and event_name='page_view';
  select count(*) into v_views from public.marketing_events where created_at>=v_start and created_at<v_now and is_test=false and event_name in('product_view','view_product');
  select count(*) into v_cart from public.marketing_events where created_at>=v_start and created_at<v_now and is_test=false and event_name='add_to_cart';
  select count(*) into v_checkout from public.marketing_events where created_at>=v_start and created_at<v_now and is_test=false and event_name in('checkout_started','begin_checkout');
  select count(*) into v_purchases from public.marketing_events where created_at>=v_start and created_at<v_now and is_test=false and event_name in('purchase_completed','purchase');
  select count(*) into v_paid from public.orders where created_date>=v_start and created_date<v_now and is_sample=false and payment_status='paid' and status not in('canceled','refunded');

  insert into public.operations_action_items(generated_key,action_type,owner_role,title,finding,evidence,recommended_action,rationale,measure,baseline,target,review_date,budget_cents,action_path,source_kind,source_id)
  values(
    'growth-funnel-'||v_week,'proposal','owner','Approve a 14-day product-to-DTF cross-sell experiment',
    format('%s tracked page views (%s versus the prior seven days) produced %s product views, %s add-to-cart events, %s checkout starts, %s purchase events, and %s paid non-test orders.',v_visits,case when v_visits-v_prior_visits>=0 then '+'||(v_visits-v_prior_visits) else (v_visits-v_prior_visits)::text end,v_views,v_cart,v_checkout,v_purchases,v_paid),
    jsonb_build_object('period_start',v_start,'period_end',v_now,'prior_period_start',v_prior_start,'prior_period_end',v_start,'page_views',v_visits,'prior_page_views',v_prior_visits,'product_views',v_views,'add_to_cart',v_cart,'checkout_started',v_checkout,'purchase_events',v_purchases,'paid_orders',v_paid,'test_rows_excluded',true,'internal_admin_exclusion','not available','unique_visitors','not available','journey_stitching','not available'),
    'For 14 days, add one secondary “Need prints only? Check DTF prices” link to the ten most-viewed garment product pages. Tag every link with the same dedicated UTM campaign and record DTF calculator engagement. Approval authorizes this defined $0 experiment only; it does not authorize paid media, unrelated copy, or pricing changes.',
    'The largest measured loss is between product views and cart activity. A relevant DTF cross-sell uses an existing HC Apparel service, supports creative customers, and can be tested without ad spend.',
    'Dedicated campaign landings, DTF calculator engagements, artwork-upload successes, freight requests, and paid non-test orders attributable to the experiment.',
    format('%s product views; %s add-to-cart events; %s DTF-attributed paid orders during the seven-day baseline.',v_views,v_cart,v_paid),
    'Within 14 days: at least 20 attributed DTF landings, 5 calculator engagements, and 1 artwork upload or freight-review request. Paid orders are observed but not promised.',
    (now() at time zone 'America/New_York')::date+14,0,'/AdminBusinessIntelligence','growth_experiment',v_week
  ) on conflict(generated_key) do update set finding=excluded.finding,evidence=excluded.evidence,baseline=excluded.baseline,updated_at=now() where operations_action_items.status='proposed';

  for r in select id,customer_name,customer_email,payment_status,status,total_amount,created_date from public.orders where is_sample=false and status not in('completed','canceled','refunded') and payment_status in('unpaid','awaiting_payment') loop
    insert into public.operations_action_items(generated_key,action_type,owner_role,title,finding,evidence,recommended_action,rationale,measure,baseline,target,review_date,budget_cents,action_path,source_kind,source_id,status)
    values('order-payment-'||r.id,'task','operations_manager','Resolve payment status for Order #'||upper(right(r.id::text,8)),format('%s (%s) has a %s order recorded on %s with payment status %s.',coalesce(r.customer_name,'Customer'),r.customer_email,to_char(r.total_amount,'FM$999999990.00'),to_char(r.created_date at time zone 'America/New_York','Mon DD, YYYY HH12:MI AM'),r.payment_status),jsonb_build_object('order_id',r.id,'payment_status',r.payment_status,'order_status',r.status,'amount',r.total_amount,'created_at',r.created_date),'Open the exact order, verify whether payment or customer follow-up is needed, and record only the confirmed next status. Do not create a charge, refund, or supplier order.','A stale unpaid order can hide a customer need or inflate the attention queue.','The order has a verified payment/follow-up status and a documented next step.',r.payment_status,'Resolved or documented blocker by the review date.',(now() at time zone 'America/New_York')::date+1,0,'/AdminOrderDetail?order_id='||r.id,'order',r.id,'in_progress')
    on conflict(generated_key) do update set finding=excluded.finding,evidence=excluded.evidence,baseline=excluded.baseline,action_path=excluded.action_path,updated_at=now() where operations_action_items.status not in('completed','cancelled');
  end loop;

  for r in select d.id,d.subject,d.created_at from public.customer_response_drafts d where d.status='draft' loop
    insert into public.operations_action_items(generated_key,action_type,owner_role,title,finding,evidence,recommended_action,rationale,measure,baseline,target,review_date,budget_cents,action_path,source_kind,source_id)
    values('draft-review-'||r.id,'draft_review','owner','Review customer draft: '||r.subject,format('A customer-facing response draft has been waiting since %s.',to_char(r.created_at at time zone 'America/New_York','Mon DD, YYYY HH12:MI AM')),jsonb_build_object('draft_id',r.id,'created_at',r.created_at),'Open this exact draft, revise or approve it through the existing authenticated response workflow.','Customer care is strongest when the reviewer sees the actual draft and context, not a generic queue.','The specific draft is approved, revised, sent through an authorized workflow, or discarded.',null,'Decision recorded by the review date.',(now() at time zone 'America/New_York')::date+1,0,'/AdminOperationsInbox?draft='||r.id,'customer_response_draft',r.id)
    on conflict(generated_key) do update set finding=excluded.finding,action_path=excluded.action_path,updated_at=now() where operations_action_items.status not in('completed','cancelled');
  end loop;
  update public.operations_action_items a set status='completed',completed_at=now(),updated_at=now(),decision_note='Closed automatically because the linked order no longer needs payment follow-up.'
    where a.source_kind='order' and a.status not in('completed','cancelled') and not exists(select 1 from public.orders o where o.id::text=a.source_id and o.is_sample=false and o.status not in('completed','canceled','refunded') and o.payment_status in('unpaid','awaiting_payment'));
  update public.operations_action_items a set status='completed',completed_at=now(),updated_at=now(),decision_note='Closed automatically because the linked draft is no longer waiting.'
    where a.source_kind='customer_response_draft' and a.status not in('completed','cancelled') and not exists(select 1 from public.customer_response_drafts d where d.id::text=a.source_id and d.status='draft');
end $$;
revoke all on function public.refresh_operations_action_items() from public,anon,authenticated;
grant execute on function public.refresh_operations_action_items() to service_role;

create or replace function public.operations_actionable_snapshot(p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path=public,auth as $$
declare v_base jsonb; v_start timestamptz:=now()-(greatest(1,least(coalesce(p_days,30),365))||' days')::interval; v_previous timestamptz; v_now timestamptz:=now(); v_result jsonb;
begin
  if coalesce(auth.role(),'')<>'service_role' and not public.is_hc_operations_staff() then raise exception 'HC Apparel operations access required'; end if;
  v_previous:=v_start-(greatest(1,least(coalesce(p_days,30),365))||' days')::interval;
  v_base:=public.operations_business_snapshot(p_days);
  v_result:=v_base||jsonb_build_object(
    'reporting_period',jsonb_build_object('current_start',v_start,'current_end',v_now,'previous_start',v_previous,'previous_end',v_start,'timezone','America/New_York'),
    'traffic_quality',jsonb_build_object(
      'current_page_views',(select count(*) from public.marketing_events where created_at>=v_start and created_at<v_now and is_test=false and event_name='page_view'),
      'previous_page_views',(select count(*) from public.marketing_events where created_at>=v_previous and created_at<v_start and is_test=false and event_name='page_view'),
      'test_rows_excluded',true,
      'internal_or_admin_traffic_exclusion','Not available: events do not store a reliable staff/internal marker.',
      'unique_visitors','Not available: no privacy-safe session or visitor identifier is stored.',
      'quality_warning','The source field frequently contains route names and page labels, so source-present page views are not a verified qualified-visitor count.',
      'landing_paths',(select coalesce(jsonb_agg(row_to_json(q)),'[]'::jsonb) from (select coalesce(nullif(path,''),nullif(source,''),'Direct / unknown') landing_path,count(*) views from public.marketing_events where created_at>=v_start and created_at<v_now and is_test=false and event_name='page_view' group by 1 order by count(*) desc limit 12) q)
    ),
    'funnel',(select jsonb_build_object(
      'page_view',count(*) filter(where event_name='page_view'),
      'product_view',count(*) filter(where event_name in('product_view','view_product')),
      'account_signup',count(*) filter(where event_name='account_signup'),
      'add_to_cart',count(*) filter(where event_name='add_to_cart'),
      'checkout_started',count(*) filter(where event_name in('checkout_started','begin_checkout')),
      'purchase_event',count(*) filter(where event_name in('purchase_completed','purchase')),
      'paid_orders',(select count(*) from public.orders where created_date>=v_start and created_date<v_now and is_sample=false and payment_status='paid' and status not in('canceled','refunded')),
      'missing_tracking',jsonb_build_array('Internal/admin traffic marker','Unique visitor/session identifier','Cross-session funnel journey','Verified referrer classification for route-labeled source values')
    ) from public.marketing_events where created_at>=v_start and created_at<v_now and is_test=false),
    'actions',(select coalesce(jsonb_agg(row_to_json(q)),'[]'::jsonb) from (select * from public.operations_action_items where status in('proposed','approved','revision_requested','in_progress') order by case owner_role when 'owner' then 0 else 1 end,case action_type when 'proposal' then 0 when 'draft_review' then 1 else 2 end,review_date nulls last,created_at) q),
    'recent_decisions',(select coalesce(jsonb_agg(row_to_json(q)),'[]'::jsonb) from (select d.*,a.title from public.operations_action_decisions d join public.operations_action_items a on a.id=d.action_id order by d.decided_at desc limit 20) q),
    'trend_assignment_status',case when exists(select 1 from public.industry_trends where trend_shape in('sustained','short spike') and coalesce(evidence,'')~*'(growth|increase|demand|search|sales|orders|survey|percent|%)') then 'Supported trend evidence is available.' else 'No trend task assigned: current sources describe supplier capabilities or operations, but do not provide sufficient dated demand or growth evidence.' end
  );
  return v_result;
end $$;
revoke all on function public.operations_actionable_snapshot(integer) from public;
grant execute on function public.operations_actionable_snapshot(integer) to authenticated,service_role;

commit;
