begin;

alter table public.marketing_settings
  add column if not exists analytics_reliable_since timestamptz,
  add column if not exists analytics_baseline_note text;

update public.marketing_settings
set analytics_reliable_since = coalesce(analytics_reliable_since, '2026-09-28 12:23:15+00'::timestamptz),
    analytics_baseline_note = coalesce(
      analytics_baseline_note,
      'All required funnel trackers became consistently available with production deployment dpl_7zduHoPM3imjppSzQsjKCNaghxdi.'
    )
where id = true;

create or replace function public.marketing_analytics_health()
returns table (
  event_name text,
  first_recorded timestamptz,
  last_recorded timestamptz,
  event_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  return query
  with required(event_name) as (
    values
      ('page_view'::text),
      ('product_view'::text),
      ('account_signup'::text),
      ('add_to_cart'::text),
      ('checkout_started'::text),
      ('purchase_completed'::text)
  ), normalized as (
    select
      case
        when me.event_name = 'view_product' then 'product_view'
        when me.event_name = 'begin_checkout' then 'checkout_started'
        when me.event_name = 'purchase' then 'purchase_completed'
        else me.event_name
      end as event_name,
      me.created_at
    from public.marketing_events me
    where me.is_test = false
  )
  select
    required.event_name,
    min(normalized.created_at) as first_recorded,
    max(normalized.created_at) as last_recorded,
    count(normalized.created_at)::bigint as event_count
  from required
  left join normalized using (event_name)
  group by required.event_name
  order by array_position(
    array['page_view','product_view','account_signup','add_to_cart','checkout_started','purchase_completed'],
    required.event_name
  );
end;
$$;

revoke all on function public.marketing_analytics_health() from public;
grant execute on function public.marketing_analytics_health() to authenticated, service_role;

commit;
