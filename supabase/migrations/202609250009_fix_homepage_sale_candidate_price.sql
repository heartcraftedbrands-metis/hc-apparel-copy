begin;

create or replace function public.homepage_special_candidates()
returns table (
  product_id text, sku text, brand text, product_name text, style_number text, category text,
  image_url text, inventory_qty integer, vendor_price numeric,
  vendor_special_price numeric, reference_vendor_price numeric,
  public_price numeric, markup numeric, is_vendor_special boolean,
  sale_field_source text, sale_expiration text,
  fetched_at timestamptz, eligible boolean, reason text
)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  return query
  with matched as (
    select distinct on (p.id) p, s,
      coalesce(nullif(p.storefront_price_buffer, 0), 3.00)::numeric as buffer,
      coalesce((
        select (v.value ->> 'price')::numeric
        from jsonb_array_elements(case when jsonb_typeof(p.size_prices) = 'array' then p.size_prices else '[]'::jsonb end) v(value)
        where v.value ->> 'sku' = s.sku and v.value ->> 'price' ~ '^\d+(\.\d+)?$'
        limit 1
      ), coalesce(p.sale_price, p.price))::numeric as hc_customer_price
    from public.products p
    cross join lateral (
      select latest.* from (
        select distinct on (staged.sku) staged.*
        from public.ss_sku_staging staged
        where upper(btrim(staged.part_number)) = upper(btrim(p.style_number))
          and lower(btrim(staged.brand)) = lower(btrim(p.brand))
          and staged.customer_price > 0
        order by staged.sku, staged.fetched_at desc
      ) latest
      order by public.ss_sale_is_current(latest.sale_price, latest.sale_expiration) desc,
        (latest.inventory_qty > 0) desc, latest.inventory_qty desc,
        (latest.fetched_at >= now() - interval '30 days') desc, latest.fetched_at desc
      limit 1
    ) s
    where p.vendor_source = 'S&S Activewear' and p.visibility = 'public'
      and p.is_active is true and p.is_sample is false and p.product_type = 'physical'
    order by p.id, public.ss_sale_is_current(s.sale_price, s.sale_expiration) desc,
      (s.inventory_qty > 0) desc, s.inventory_qty desc, s.fetched_at desc
  )
  select p.id, s.sku, p.brand, p.name, p.style_number, p.category,
    coalesce(nullif(s.color_front_image, ''), nullif(s.color_on_model_front_image, ''), p.image_url),
    s.inventory_qty, s.customer_price,
    case when public.ss_sale_is_current(s.sale_price, s.sale_expiration) then s.sale_price else null end,
    case when public.ss_sale_is_current(s.sale_price, s.sale_expiration) then s.piece_price else null end,
    m.hc_customer_price, m.buffer, public.ss_sale_is_current(s.sale_price, s.sale_expiration),
    case when public.ss_sale_is_current(s.sale_price, s.sale_expiration) then 'S&S salePrice' else null end,
    s.sale_expiration, s.fetched_at,
    s.inventory_qty > 0 and p.stock > 0 and s.noe_retailing is false
      and nullif(btrim(p.name), '') is not null
      and lower(p.name) !~ '(test|qa|sample|placeholder)'
      and nullif(btrim(coalesce(s.color_name, '')), '') is not null
      and lower(s.color_name) not in ('?', 'unknown', 'color unavailable')
      and nullif(btrim(coalesce(s.size_name, '')), '') is not null
      and nullif(btrim(coalesce(s.color_front_image, s.color_on_model_front_image, p.image_url)), '') is not null
      and m.hc_customer_price >= s.customer_price + m.buffer
      and s.fetched_at >= now() - interval '30 days',
    case
      when not public.ss_sale_is_current(s.sale_price, s.sale_expiration) then 'S&S salePrice is missing or expired'
      when s.inventory_qty <= 0 or p.stock <= 0 then 'Out of stock'
      when s.noe_retailing then 'Vendor restriction'
      when s.fetched_at < now() - interval '30 days' then 'Refresh S&S inventory/pricing before approval'
      when m.hc_customer_price < s.customer_price + m.buffer then 'HC Apparel customer price is below the applicable vendor-plus-buffer floor'
      when nullif(btrim(p.name), '') is null or lower(p.name) ~ '(test|qa|sample|placeholder)' then 'Unusable product name'
      when nullif(btrim(coalesce(s.color_name, '')), '') is null or lower(s.color_name) in ('?', 'unknown', 'color unavailable') then 'Missing color'
      when nullif(btrim(coalesce(s.size_name, '')), '') is null then 'Missing size'
      when nullif(btrim(coalesce(s.color_front_image, s.color_on_model_front_image, p.image_url)), '') is null then 'Missing image'
      else 'Ready for admin review'
    end
  from matched m cross join lateral (select (m.p).*) p cross join lateral (select (m.s).*) s;
end;
$$;

commit;
