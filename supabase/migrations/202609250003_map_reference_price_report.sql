begin;

create or replace function public.admin_map_reference_price_audit()
returns table (
  product_id text,
  brand text,
  style_number text,
  product_name text,
  current_customer_price numeric,
  reference_map_price numeric,
  hc_safe_floor numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with matched as (
    select p.id product_id, p.brand, p.style_number, p.name product_name,
      p.price current_customer_price,
      min(s.map_price) filter (where s.inventory_qty > 0 and s.map_price > 0.01) reference_map_price,
      public.product_payment_safe_floor(p) hc_safe_floor
    from public.products p
    join public.ss_sku_staging s
      on lower(s.brand) = lower(p.brand)
     and (
       lower(coalesce(s.style_name, '')) = lower(coalesce(p.style_number, ''))
       or lower(coalesce(s.part_number, '')) = lower(coalesce(p.supplier_sku, ''))
     )
    where public.is_admin()
      and p.visibility = 'public' and p.is_active
      and lower(p.brand) <> 'adidas'
    group by p.id
  )
  select m.product_id, m.brand, m.style_number, m.product_name,
    m.current_customer_price, m.reference_map_price, m.hc_safe_floor
  from matched m
  where m.reference_map_price is not null
    and abs(m.current_customer_price - m.reference_map_price) <= 0.01
    and m.current_customer_price > coalesce(m.hc_safe_floor, 0) + 0.01
  order by m.brand, m.style_number;
$$;

revoke all on function public.admin_map_reference_price_audit() from public, anon;
grant execute on function public.admin_map_reference_price_audit() to authenticated;

commit;
