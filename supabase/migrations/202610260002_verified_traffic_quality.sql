begin;

create or replace function public.operations_actionable_snapshot(p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path=public,auth as $$
declare v_base jsonb; v_start timestamptz:=now()-(greatest(1,least(coalesce(p_days,30),365))||' days')::interval; v_previous timestamptz; v_now timestamptz:=now(); v_result jsonb;
begin
  if coalesce(auth.role(),'')<>'service_role' and not public.is_hc_operations_staff() then raise exception 'HC Apparel operations access required'; end if;
  v_previous:=v_start-(greatest(1,least(coalesce(p_days,30),365))||' days')::interval;
  v_base:=public.operations_business_snapshot(p_days);
  v_base:=jsonb_set(v_base,'{kpis,qualified_traffic}','null'::jsonb,true);
  v_base:=jsonb_set(v_base,'{definitions,qualified_traffic}',to_jsonb('Not available until campaign/referrer values are separated from route labels and internal traffic can be excluded.'::text),true);
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
