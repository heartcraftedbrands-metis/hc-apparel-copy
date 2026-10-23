begin;

-- The storefront role is intentionally narrower than the existing Command Center
-- membership. Operations managers use purpose-built RPCs and cannot inherit owner
-- payment, refund, credential, deployment, or supplier-purchase controls.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('customer','admin','operations_manager'));

do $$
declare v_count integer;
begin
  select count(*) into v_count
  from public.profiles p join auth.users u on u.id=p.id
  where lower(trim(p.email))='indy.j5557@gmail.com'
    and lower(trim(u.email))='indy.j5557@gmail.com'
    and u.email_confirmed_at is not null;
  if v_count <> 1 then
    raise exception 'YHo verified recipient/account could not be uniquely confirmed';
  end if;
  update public.profiles set role='operations_manager',updated_at=now()
  where lower(trim(email))='indy.j5557@gmail.com';
end $$;

create or replace function public.is_hc_operations_staff()
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_admin() or public.ops_has_permission('hc-apparel','view');
$$;
revoke all on function public.is_hc_operations_staff() from public;
grant execute on function public.is_hc_operations_staff() to authenticated,service_role;

create table if not exists public.operations_report_recipients (
  email text primary key,
  display_name text not null,
  user_id uuid not null references auth.users(id) on delete restrict,
  recipient_role text not null check (recipient_role in ('owner','operations_manager')),
  daily_enabled boolean not null default true,
  weekly_enabled boolean not null default true,
  monthly_enabled boolean not null default true,
  verified_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.operations_report_recipients(email,display_name,user_id,recipient_role,verified_at)
select lower(u.email),case when lower(u.email)='heartfamilyco@gmail.com' then 'King Terik' else 'YHo' end,
  u.id,case when lower(u.email)='heartfamilyco@gmail.com' then 'owner' else 'operations_manager' end,now()
from auth.users u join public.profiles p on p.id=u.id
where lower(u.email) in ('heartfamilyco@gmail.com','indy.j5557@gmail.com')
  and lower(p.email)=lower(u.email) and u.email_confirmed_at is not null
on conflict(email) do update set user_id=excluded.user_id,display_name=excluded.display_name,
  recipient_role=excluded.recipient_role,verified_at=excluded.verified_at,updated_at=now();

create table if not exists public.operations_report_runs (
  id uuid primary key default gen_random_uuid(),
  operation_key text not null unique,
  report_type text not null check (report_type in ('sample','daily','weekly','monthly','combined')),
  reporting_window_start timestamptz not null,
  reporting_window_end timestamptz not null,
  status text not null default 'queued' check (status in ('queued','generating','accepted','delivered','partial','failed')),
  recipient_count integer not null default 0,
  provider_message_ids jsonb not null default '{}'::jsonb,
  delivery_events jsonb not null default '{}'::jsonb,
  accepted_at timestamptz,
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.operations_monitor_checks (
  id bigint generated always as identity primary key,
  check_key text not null,
  severity text not null check (severity in ('info','warning','critical')),
  status text not null check (status in ('healthy','degraded','failed','unavailable')),
  evidence jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now()
);
create index if not exists operations_monitor_checks_latest_idx on public.operations_monitor_checks(check_key,checked_at desc);

create table if not exists public.operations_alerts (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  workflow text not null,
  severity text not null check (severity in ('warning','critical')),
  status text not null default 'open' check (status in ('open','acknowledged','recovered')),
  customer_impact text,
  evidence text,
  owner_label text not null default 'YHo',
  next_action text not null,
  detected_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  recovered_at timestamptz,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.industry_sources (
  id text primary key,
  name text not null,
  source_url text not null,
  source_type text not null,
  access_status text not null default 'configured' check (access_status in ('operational','configured','blocked','unavailable')),
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.industry_sources(id,name,source_url,source_type,access_status) values
 ('ss-pressroom','S&S Activewear pressroom','https://www.ssactivewear.com/about/pressroom','official_supplier','configured'),
 ('printing-impressions','Printing Impressions','https://www.piworld.com/rss-feeds/','industry_publication','configured')
on conflict(id) do update set name=excluded.name,source_url=excluded.source_url,source_type=excluded.source_type;

create table if not exists public.industry_trends (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.industry_sources(id) on delete restrict,
  headline text not null,
  source_url text not null,
  observed_or_published_on date not null,
  verified_fact text not null,
  interpretation text,
  trend_shape text not null default 'insufficient evidence' check (trend_shape in ('short spike','sustained','insufficient evidence')),
  evidence text,
  relevance text,
  opportunity text,
  effort text,
  cost_implication text,
  margin_implication text,
  timing text,
  recommended_next_step text,
  created_at timestamptz not null default now(),
  unique(source_id,source_url,headline)
);
insert into public.industry_trends(source_id,headline,source_url,observed_or_published_on,verified_fact,interpretation,trend_shape,evidence,relevance,opportunity,effort,cost_implication,margin_implication,timing,recommended_next_step) values
 ('ss-pressroom','S&S Activewear announced a Phoenix distribution center','https://www.ssactivewear.com/about/pressroom','2026-10-06','S&S announced a new 500,000-square-foot Phoenix distribution center.','This may strengthen western distribution capacity, but current HC Apparel lead-time effects are not yet verified.','insufficient evidence','Official supplier announcement.','Relevant to future blank-apparel availability and shipping resilience.','Compare western destination availability and freight after the facility becomes operational.','Low','No spend required for monitoring.','Potential shipping or lead-time benefit is not yet measurable.','Monitor over the next quarter.','Record actual quote and fulfillment changes before changing customer promises.'),
 ('ss-pressroom','DTF transfers can be ordered alongside apparel','https://www.ssactivewear.com/welcometossactivewear','2026-10-23','S&S states that DTF transfers can be ordered alongside apparel and accessories, subject to its freight terms.','This supports the existing combined-cart quote workflow; it does not prove a public custom-transfer API exists.','sustained','Current official supplier welcome information.','Directly relevant to HC Apparel DTF freight verification.','Continue authenticated cart quotes and measure transfer quote-to-purchase conversion.','Low','No additional subscription required.','A combined quote may reduce duplicated shipping, but actual margin depends on verified freight.','Now.','Keep supplier submission manual and approval-gated until an authorized transfer API is verified.')
on conflict(source_id,source_url,headline) do nothing;

create table if not exists public.customer_response_drafts (
  id uuid primary key default gen_random_uuid(),
  contact_message_id text references public.contact_messages(id) on delete set null,
  order_id text references public.orders(id) on delete set null,
  subject text not null,
  body text not null,
  status text not null default 'draft' check (status in ('draft','approved','sent','discarded')),
  assigned_to uuid references public.team_members(id) on delete set null,
  created_by uuid not null default auth.uid() references auth.users(id),
  approved_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.operations_runtime_config (
  id boolean primary key default true check(id),
  monitor_token text not null default encode(extensions.gen_random_bytes(32),'hex'),
  sample_pending boolean not null default true,
  sample_operation_key text not null default 'business-operations-sample-2026-10-23',
  site_url text not null default 'https://www.ilovehcapparel.net',
  updated_at timestamptz not null default now()
);
insert into public.operations_runtime_config(id) values(true) on conflict(id) do nothing;

alter table public.operations_report_recipients enable row level security;
alter table public.operations_report_runs enable row level security;
alter table public.operations_monitor_checks enable row level security;
alter table public.operations_alerts enable row level security;
alter table public.industry_sources enable row level security;
alter table public.industry_trends enable row level security;
alter table public.customer_response_drafts enable row level security;
alter table public.operations_runtime_config enable row level security;

create policy operations_recipients_staff_read on public.operations_report_recipients for select to authenticated using(public.is_hc_operations_staff());
create policy operations_runs_staff_read on public.operations_report_runs for select to authenticated using(public.is_hc_operations_staff());
create policy operations_checks_staff_read on public.operations_monitor_checks for select to authenticated using(public.is_hc_operations_staff());
create policy operations_alerts_staff_read on public.operations_alerts for select to authenticated using(public.is_hc_operations_staff());
create policy operations_alerts_staff_update on public.operations_alerts for update to authenticated using(public.is_hc_operations_staff()) with check(public.is_hc_operations_staff());
create policy industry_sources_staff_read on public.industry_sources for select to authenticated using(public.is_hc_operations_staff());
create policy industry_trends_staff_read on public.industry_trends for select to authenticated using(public.is_hc_operations_staff());
create policy customer_response_drafts_staff on public.customer_response_drafts for all to authenticated using(public.is_hc_operations_staff()) with check(public.is_hc_operations_staff());

revoke all on public.operations_report_recipients,public.operations_report_runs,public.operations_monitor_checks,
 public.operations_alerts,public.industry_sources,public.industry_trends,public.customer_response_drafts,public.operations_runtime_config from anon,authenticated;
grant select on public.operations_report_recipients,public.operations_report_runs,public.operations_monitor_checks,
 public.operations_alerts,public.industry_sources,public.industry_trends to authenticated;
grant select,insert,update on public.customer_response_drafts to authenticated;
grant update(status,updated_at) on public.operations_alerts to authenticated;
grant all on public.operations_report_recipients,public.operations_report_runs,public.operations_monitor_checks,
 public.operations_alerts,public.industry_sources,public.industry_trends,public.customer_response_drafts,public.operations_runtime_config to service_role;

-- Task access is shared only with authenticated HC operations members.
drop policy if exists productivity_tasks_operations on public.productivity_tasks;
create policy productivity_tasks_operations on public.productivity_tasks for all to authenticated
 using(public.ops_has_permission('hc-apparel','view')) with check(public.ops_has_permission('hc-apparel','view'));
drop policy if exists team_members_operations_read on public.team_members;
create policy team_members_operations_read on public.team_members for select to authenticated using(public.ops_has_permission('hc-apparel','view'));

drop policy if exists "dtf artwork operations read" on storage.objects;
create policy "dtf artwork operations read" on storage.objects for select to authenticated
 using(bucket_id='dtf-artwork' and public.ops_has_permission('hc-apparel','orders'));

create or replace function public.record_operations_dtf_shipping_quote(
  p_order_id uuid,p_freight numeric,p_source text,p_quoted_at timestamptz,p_expires_at timestamptz,p_free_freight boolean default false
) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_row public.dtf_transfer_orders;
begin
  if not public.ops_has_permission('hc-apparel','orders') then raise exception 'HC Apparel operations permission required'; end if;
  if p_freight<0 or nullif(btrim(p_source),'') is null then raise exception 'Exact freight and source are required'; end if;
  if p_expires_at<=p_quoted_at or p_expires_at<=now() then raise exception 'Quote expiration must be in the future'; end if;
  select * into v_row from public.dtf_transfer_orders where id=p_order_id for update;
  if not found then raise exception 'Transfer order not found'; end if;
  if p_free_freight and coalesce(v_row.combined_ss_supplier_subtotal,0)<200 then raise exception 'Verified free freight requires at least $200 eligible supplier subtotal'; end if;
  update public.dtf_transfer_orders set supplier_shipping=p_freight,
    shipping_quote_status=case when p_free_freight then 'verified_free' else 'quoted' end,
    shipping_quote_source=left(p_source,200),shipping_quote_at=p_quoted_at,shipping_quote_expires_at=p_expires_at,
    shipping_pricing_snapshot=jsonb_build_object('fingerprint',quote_fingerprint,'freight',p_freight,'source',left(p_source,200),
      'quoted_at',p_quoted_at,'expires_at',p_expires_at,'free_freight',p_free_freight,'recorded_by',auth.uid()),updated_at=now()
  where id=p_order_id returning * into v_row;
  return jsonb_build_object('id',v_row.id,'shipping_quote_status',v_row.shipping_quote_status,'supplier_shipping',v_row.supplier_shipping,'expires_at',v_row.shipping_quote_expires_at);
end $$;
revoke all on function public.record_operations_dtf_shipping_quote(uuid,numeric,text,timestamptz,timestamptz,boolean) from public;
grant execute on function public.record_operations_dtf_shipping_quote(uuid,numeric,text,timestamptz,timestamptz,boolean) to authenticated;

create or replace function public.operations_business_snapshot(p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path=public,auth as $$
declare v_start timestamptz:=now()-(greatest(1,least(coalesce(p_days,30),365))||' days')::interval; v_result jsonb;
begin
  if coalesce(auth.role(),'') <> 'service_role' and not public.is_hc_operations_staff() then raise exception 'HC Apparel operations access required'; end if;
  select jsonb_build_object(
    'generated_at',now(),'period_start',v_start,'period_end',now(),'period_days',p_days,
    'definitions',jsonb_build_object('net_sales','Paid, non-test, non-refunded order total less refunded orders.','conversion_rate','Completed purchases divided by tracked checkout starts.','gross_profit','Recorded order estimated profit; unavailable when fulfillment costs are missing.','qualified_traffic','Tracked non-admin page views with a campaign or referrer source.'),
    'kpis',jsonb_build_object(
      'orders',(select count(*) from public.orders where created_date>=v_start and is_sample=false and payment_status='paid' and status not in('canceled','refunded')),
      'net_sales',(select coalesce(sum(total_amount),0) from public.orders where created_date>=v_start and is_sample=false and payment_status='paid' and status not in('canceled','refunded')),
      'average_order_value',(select case when count(*)=0 then null else round(avg(total_amount),2) end from public.orders where created_date>=v_start and is_sample=false and payment_status='paid' and status not in('canceled','refunded')),
      'gross_profit',(select case when count(*) filter(where coalesce(estimated_profit,0)<>0)=0 then null else round(sum(estimated_profit),2) end from public.orders where created_date>=v_start and is_sample=false and payment_status='paid' and status not in('canceled','refunded')),
      'shipping_revenue',(select case when count(shipping_amount)=0 then null else round(sum(coalesce(shipping_amount,0)),2) end from public.orders where created_date>=v_start and is_sample=false and payment_status='paid' and status not in('canceled','refunded')),
      'shipping_cost',null,
      'website_visits',(select count(*) from public.marketing_events where created_at>=v_start and is_test=false and event_name='page_view'),
      'qualified_traffic',(select count(*) from public.marketing_events where created_at>=v_start and is_test=false and event_name='page_view' and (source is not null or metadata ? 'utm_campaign')),
      'checkout_starts',(select count(*) from public.marketing_events where created_at>=v_start and is_test=false and event_name in('checkout_started','begin_checkout')),
      'purchases',(select count(*) from public.marketing_events where created_at>=v_start and is_test=false and event_name in('purchase_completed','purchase')),
      'conversion_rate',(select case when count(*) filter(where event_name in('checkout_started','begin_checkout'))=0 then null else round(100.0*count(*) filter(where event_name in('purchase_completed','purchase'))/count(*) filter(where event_name in('checkout_started','begin_checkout')),2) end from public.marketing_events where created_at>=v_start and is_test=false),
      'returning_customers',(select count(*) from (select customer_email from public.orders where created_date>=v_start and is_sample=false and payment_status='paid' group by customer_email having count(*)>1) q),
      'dtf_calculator_engagements',(select count(*) from public.marketing_events where created_at>=v_start and is_test=false and event_name='dtf_calculator_engaged'),
      'dtf_upload_failures',(select count(*) from public.marketing_events where created_at>=v_start and is_test=false and event_name='artwork_upload_failure'),
      'dtf_quote_requests',(select count(*) from public.marketing_events where created_at>=v_start and is_test=false and event_name='freight_review_requested'),
      'dtf_paid_orders',(select count(*) from public.dtf_transfer_orders where created_at>=v_start and coalesce(is_sample,false)=false and payment_status='paid')
    ),
    'work_queues',jsonb_build_object(
      'orders_needing_attention',(select coalesce(jsonb_agg(row_to_json(q)),'[]'::jsonb) from (select id,customer_name,customer_email,status,payment_status,fulfillment_status,total_amount,created_date,
        case when payment_status in('unpaid','awaiting_payment') then 'Confirm payment or customer follow-up' when fulfillment_status in('not_started','vendor_order_needed') then 'Prepare fulfillment' when fulfillment_status='issue_hold' then 'Resolve fulfillment hold' else 'Review order' end next_action
        from public.orders where is_sample=false and status not in('completed','canceled','refunded') order by created_date asc limit 30) q),
      'dtf_orders',(select coalesce(jsonb_agg(row_to_json(q)),'[]'::jsonb) from (select id,order_reference,status,payment_status,width_inches,height_inches,quantity,production_options,artwork_storage_path,artwork_original_name,shipping_address,shipping_quote_status,supplier_shipping,shipping_quote_expires_at,created_at,
        case when shipping_quote_status in('pending','supplier_quote_required','expired') then 'Verify freight' when payment_status<>'paid' then 'Await customer payment' when status='draft' then 'Owner approval required before supplier submission' else 'Track confirmed supplier progress' end next_action
        from public.dtf_transfer_orders where coalesce(is_sample,false)=false and status<>'delivered' order by created_at asc limit 30) q),
      'inquiries',(select coalesce(jsonb_agg(row_to_json(q)),'[]'::jsonb) from (select id,name,email,subject,status,created_date,'Draft response for approval' next_action from public.contact_messages where is_sample=false and status in('new','reviewed') order by created_date asc limit 30) q),
      'tasks',(select coalesce(jsonb_agg(row_to_json(q)),'[]'::jsonb) from (select t.id,t.title,t.description,t.status,t.priority,t.due_date,t.assigned_to,m.name assigned_name from public.productivity_tasks t left join public.team_members m on m.id=t.assigned_to where t.status not in('completed','dismissed') order by t.due_date nulls last,t.created_at limit 50) q)
    ),
    'alerts',(select coalesce(jsonb_agg(row_to_json(q)),'[]'::jsonb) from (select id,workflow,severity,status,customer_impact,evidence,owner_label,next_action,detected_at,last_seen_at from public.operations_alerts where status<>'recovered' order by case severity when 'critical' then 0 else 1 end,detected_at desc limit 30) q),
    'trends',(select coalesce(jsonb_agg(row_to_json(q)),'[]'::jsonb) from (select headline,source_url,observed_or_published_on,verified_fact,interpretation,trend_shape,evidence,relevance,opportunity,effort,cost_implication,margin_implication,timing,recommended_next_step from public.industry_trends order by observed_or_published_on desc limit 10) q),
    'data_availability',jsonb_build_object('traffic','Internal event tracking; GA4 only when configured.','gross_profit','Available only where estimated product and fulfillment costs are recorded.','shipping_cost','not available: no complete carrier-cost ledger is connected.','customer_response_time','not available: sent-response timestamps are not consistently linked to inquiries.','acquisition_cost','not available while paid advertising is disabled and no spend is recorded.','forecast','not available until sufficient reliable weekly history is accumulated.'),
    'system_separation','Website Admin manages commerce workflows. Heart Command Center remains a separate finance/operations system with shared authenticated memberships only.'
  ) into v_result;
  return v_result;
end $$;
revoke all on function public.operations_business_snapshot(integer) from public;
grant execute on function public.operations_business_snapshot(integer) to authenticated,service_role;

-- DTF funnel events share the same canonical source as the calculator and checkout.
alter table public.marketing_events drop constraint if exists marketing_events_event_name_check;
alter table public.marketing_events add constraint marketing_events_event_name_check check(event_name in(
  'page_view','product_view','view_product','brand_view','category_view','account_signup','login','add_to_cart','remove_from_cart',
  'checkout_started','begin_checkout','shipping_quote_success','payment_method_selected','purchase_completed','purchase',
  'quote_request_submitted','bulk_quote_submit','contact_submitted','contact_submit','email_subscribed','newsletter_signup',
  'sale_promo_clicked','search_used','track_order_used','social_post_created','social_post_sent_to_buffer',
  'dtf_calculator_engaged','artwork_upload_success','artwork_upload_failure','freight_review_requested'
));

create or replace function public.log_marketing_event_v3(p_event_name text,p_product_id text default null,p_product_name text default null,
 p_source text default null,p_path text default null,p_attribution jsonb default '{}'::jsonb,p_dedupe_key text default null,p_context jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare v_metadata jsonb;
begin
 if p_event_name not in('page_view','product_view','brand_view','category_view','account_signup','login','add_to_cart','remove_from_cart','checkout_started','shipping_quote_success','payment_method_selected','quote_request_submitted','contact_submitted','email_subscribed','sale_promo_clicked','search_used','track_order_used','dtf_calculator_engaged','artwork_upload_success','artwork_upload_failure','freight_review_requested') then return; end if;
 v_metadata:=jsonb_strip_nulls(jsonb_build_object('utm_source',nullif(left(p_attribution->>'utm_source',80),''),'utm_medium',nullif(left(p_attribution->>'utm_medium',80),''),'utm_campaign',nullif(left(p_attribution->>'utm_campaign',120),''),'utm_content',nullif(left(p_attribution->>'utm_content',120),''),'cart_quantity',case when (p_context->>'cart_quantity')~'^\d{1,4}$' then (p_context->>'cart_quantity')::integer end,'width_inches',case when (p_context->>'width_inches')~'^\d+(\.\d+)?$' then (p_context->>'width_inches')::numeric end,'height_inches',case when (p_context->>'height_inches')~'^\d+(\.\d+)?$' then (p_context->>'height_inches')::numeric end,'quantity',case when (p_context->>'quantity')~'^\d{1,5}$' then (p_context->>'quantity')::integer end,'reason',nullif(left(p_context->>'reason',160),'')));
 insert into public.marketing_events(event_name,product_id,product_name,source,path,metadata,dedupe_key)
 values(p_event_name,left(p_product_id,100),left(p_product_name,180),left(p_source,80),left(p_path,500),v_metadata,nullif(left(p_dedupe_key,200),'')) on conflict(dedupe_key) do update set metadata=excluded.metadata,path=excluded.path;
end $$;
revoke all on function public.log_marketing_event_v3(text,text,text,text,text,jsonb,text,jsonb) from public;
grant execute on function public.log_marketing_event_v3(text,text,text,text,text,jsonb,text,jsonb) to anon,authenticated;

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
create or replace function public.invoke_business_operations_monitor()
returns bigint language plpgsql security definer set search_path=public,extensions as $$
declare v_token text; v_request bigint;
begin
 select monitor_token into v_token from public.operations_runtime_config where id=true;
 select net.http_post(url:='https://bxsdajpldrdesnvjiubt.supabase.co/functions/v1/operations-intelligence',
   headers:=jsonb_build_object('content-type','application/json','x-operations-token',v_token),
   body:=jsonb_build_object('action','tick','requested_at',now()),timeout_milliseconds:=25000) into v_request;
 return v_request;
end $$;
revoke all on function public.invoke_business_operations_monitor() from public,anon,authenticated;
grant execute on function public.invoke_business_operations_monitor() to service_role;

do $$ begin perform cron.unschedule('hc-business-operations-monitor'); exception when others then null; end $$;
select cron.schedule('hc-business-operations-monitor','*/15 * * * *','select public.invoke_business_operations_monitor();');

commit;
