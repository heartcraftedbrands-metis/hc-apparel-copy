create or replace function public.ss_sku_pricing_preview(p_style_session_id text)
returns table (
  brand text,
  total_skus bigint,
  average_customer_cost numeric,
  minimum_proposed_price numeric,
  average_proposed_price numeric,
  maximum_proposed_price numeric,
  estimated_contribution_margin numeric,
  map_enforced_skus bigint,
  above_vendor_retail_skus bigint,
  marketplace_restricted_skus bigint
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
      case
        when s.customer_price <= 5 then 0.45
        when s.customer_price <= 15 then 0.40
        when s.customer_price <= 30 then 0.35
        else 0.30
      end::numeric as target_margin,
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
  proposed as (
    select
      t.*,
      (
        ceil(
          greatest(
            t.margin_floor_price,
            coalesce(nullif(t.map_price, 0), 0),
            7.99
          ) + 0.01
        ) - 0.01
      )::numeric as proposed_price
    from tiered t
  )
  select
    p.brand,
    count(*)::bigint as total_skus,
    round(avg(p.customer_price), 2) as average_customer_cost,
    min(p.proposed_price) as minimum_proposed_price,
    round(avg(p.proposed_price), 2) as average_proposed_price,
    max(p.proposed_price) as maximum_proposed_price,
    round(
      (
        sum(
          p.proposed_price
          - p.customer_price
          - 1.00
          - (p.proposed_price * 0.029 + 0.30)
        )
        / nullif(sum(p.proposed_price), 0)
      ) * 100,
      1
    ) as estimated_contribution_margin,
    count(*) filter (
      where coalesce(p.map_price, 0) > p.margin_floor_price
        and coalesce(p.map_price, 0) > 7.99
    )::bigint as map_enforced_skus,
    count(*) filter (
      where coalesce(p.retail_price, 0) > 0
        and p.proposed_price > p.retail_price
    )::bigint as above_vendor_retail_skus,
    count(*) filter (where p.noe_retailing is true)::bigint
      as marketplace_restricted_skus
  from proposed p
  group by p.brand
  order by p.brand;
end;
$$;

revoke all on function public.ss_sku_pricing_preview(text) from public, anon;
grant execute on function public.ss_sku_pricing_preview(text) to authenticated;
