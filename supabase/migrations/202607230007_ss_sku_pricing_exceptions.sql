create or replace function public.ss_sku_pricing_exceptions(p_style_session_id text)
returns table (
  issue_type text,
  brand text,
  style_id bigint,
  part_number text,
  style_name text,
  affected_skus bigint,
  minimum_customer_cost numeric,
  maximum_customer_cost numeric,
  minimum_map_price numeric,
  maximum_map_price numeric,
  minimum_vendor_retail numeric,
  maximum_vendor_retail numeric,
  minimum_proposed_price numeric,
  maximum_proposed_price numeric,
  minimum_contribution_margin numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  return query
  with tiered as (
    select
      s.*,
      (
        (s.customer_price + 1.00 + 0.30)
        /
        (
          1
          - 0.029
          - case
              when s.customer_price <= 5 then 0.45
              when s.customer_price <= 15 then 0.40
              when s.customer_price <= 30 then 0.35
              else 0.30
            end
        )
      )::numeric as margin_floor_price
    from public.ss_sku_staging s
    where s.style_session_id = p_style_session_id
      and s.customer_price > 0
  ),
  candidates as (
    select
      t.*,
      (
        ceil(greatest(t.margin_floor_price, 7.99) + 0.01) - 0.01
      )::numeric as rounded_margin_price
    from tiered t
  ),
  proposed as (
    select
      c.*,
      round(
        greatest(
          coalesce(nullif(c.map_price, 0), 0),
          case
            when coalesce(c.retail_price, 0) > 0
              then least(c.rounded_margin_price, c.retail_price)
            else c.rounded_margin_price
          end
        ),
        2
      ) as proposed_price
    from candidates c
  ),
  classified as (
    select
      p.*,
      (
        (
          p.proposed_price
          - p.customer_price
          - 1.00
          - (p.proposed_price * 0.029 + 0.30)
        ) / nullif(p.proposed_price, 0)
      ) * 100 as contribution_margin,
      coalesce(p.retail_price, 0) > 0
        and p.proposed_price > p.retail_price as has_retail_conflict
    from proposed p
  ),
  exceptions as (
    select c.*, 'map_above_vendor_retail'::text as issue_type
    from classified c
    where c.has_retail_conflict
    union all
    select c.*, 'below_20_percent_margin'::text as issue_type
    from classified c
    where c.contribution_margin < 20
  )
  select
    e.issue_type,
    e.brand,
    e.style_id,
    max(e.part_number) as part_number,
    max(e.style_name) as style_name,
    count(distinct e.sku)::bigint as affected_skus,
    min(e.customer_price) as minimum_customer_cost,
    max(e.customer_price) as maximum_customer_cost,
    min(e.map_price) as minimum_map_price,
    max(e.map_price) as maximum_map_price,
    min(e.retail_price) as minimum_vendor_retail,
    max(e.retail_price) as maximum_vendor_retail,
    min(e.proposed_price) as minimum_proposed_price,
    max(e.proposed_price) as maximum_proposed_price,
    round(min(e.contribution_margin), 1) as minimum_contribution_margin
  from exceptions e
  group by e.issue_type, e.brand, e.style_id
  order by e.issue_type, e.brand, max(e.style_name), max(e.part_number);
end;
$$;

revoke all on function public.ss_sku_pricing_exceptions(text) from public, anon;
grant execute on function public.ss_sku_pricing_exceptions(text) to authenticated;
