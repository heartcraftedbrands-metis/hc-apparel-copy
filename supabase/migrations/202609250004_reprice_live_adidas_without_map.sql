begin;

create or replace function public.product_variant_safe_price(
  p_product public.products,
  p_vendor_cost numeric
)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rule public.storefront_pricing_rules%rowtype;
  v_settings public.checkout_financial_settings%rowtype;
  v_method record;
  v_margin numeric;
  v_floor numeric;
  v_method_floor numeric;
begin
  if p_vendor_cost is null or p_vendor_cost <= 0 then return null; end if;
  select * into v_settings from public.checkout_financial_settings where id = 'default';
  select * into v_rule from public.storefront_pricing_rules
    where rule_key = p_product.storefront_pricing_rule_key and is_active;
  if not found then
    select * into v_rule from public.storefront_pricing_rules
    where rule_key = case
      when p_product.category ilike '%hood%' then 'hoodie'
      when p_product.category ilike '%crew%' or p_product.category ilike '%sweat%' then 'crewneck'
      when p_product.category ilike '%long_sleeve%' then 'long_sleeve'
      when p_product.category ilike '%jacket%' or p_product.category ilike '%outerwear%' then 'outerwear'
      when p_product.category ilike '%fleece%' then 'fleece'
      when p_product.category ilike '%hat%' then 'hat'
      when p_product.category ilike '%youth%' then 'youth_kids'
      else 'premium_tshirt'
    end and is_active;
  end if;
  if not found then return null; end if;

  v_margin := greatest(
    coalesce(v_settings.minimum_margin_per_item, 3),
    coalesce(v_rule.storefront_margin_buffer, 3)
  );
  v_floor := greatest(
    coalesce(v_rule.minimum_price, 0),
    p_vendor_cost + coalesce(v_rule.storefront_margin_buffer, 3),
    p_vendor_cost * coalesce(v_rule.cost_multiplier, 1)
      + coalesce(v_rule.fixed_allowance, 0)
      + coalesce(v_rule.storefront_margin_buffer, 3),
    p_vendor_cost / nullif(1 - coalesce(v_rule.minimum_margin_percent, 0), 0)
  );
  if coalesce(v_settings.processing_enabled, true) then
    for v_method in
      select value from jsonb_each(coalesce(v_settings.payment_method_costs, '{}'::jsonb))
    loop
      if coalesce((v_method.value->>'enabled')::boolean, false) then
        v_method_floor := (
          p_vendor_cost + v_margin + coalesce((v_method.value->>'fixed_fee')::numeric, 0)
        ) / nullif(1 - coalesce((v_method.value->>'percentage')::numeric, 0) / 100, 0);
        v_floor := greatest(v_floor, v_method_floor);
      end if;
    end loop;
  end if;
  return ceil(v_floor * 100) / 100;
end;
$$;

comment on function public.product_variant_safe_price(public.products, numeric) is
  'HC Apparel price floor from vendor cost, selected pricing rule, margin and enabled payment fees. MAP/MSRP excluded.';

create or replace function public.worst_enabled_processing_cost(p_price numeric)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_settings public.checkout_financial_settings%rowtype;
  v_method record;
  v_cost numeric := 0;
begin
  select * into v_settings from public.checkout_financial_settings where id = 'default';
  if not coalesce(v_settings.processing_enabled, true) then return 0; end if;
  for v_method in select value from jsonb_each(coalesce(v_settings.payment_method_costs, '{}'::jsonb))
  loop
    if coalesce((v_method.value->>'enabled')::boolean, false) then
      v_cost := greatest(v_cost,
        p_price * coalesce((v_method.value->>'percentage')::numeric, 0) / 100
        + coalesce((v_method.value->>'fixed_fee')::numeric, 0));
    end if;
  end loop;
  return round(v_cost, 2);
end;
$$;

do $$
declare
  v_products integer;
  v_matched integer;
begin
  select count(*) into v_products from public.products
  where lower(brand) = 'adidas' and visibility = 'public' and is_active;
  if v_products <> 27 then
    raise exception 'Expected exactly 27 live Adidas products; found %', v_products;
  end if;

  with latest as (
    select import_session_id from public.ss_import_staging
    where lower(brand) = 'adidas' and row_status = 'pending'
      and import_session_id like 'ss-brand-adidas-%'
    order by created_date desc limit 1
  )
  select count(distinct p.id) into v_matched
  from public.products p
  cross join latest l
  join public.ss_sku_staging s on s.style_session_id = l.import_session_id
    and lower(s.brand) = 'adidas'
    and (lower(s.style_name) = lower(p.style_number)
      or lower(s.part_number) = lower(p.supplier_sku))
  where lower(p.brand) = 'adidas' and p.visibility = 'public' and p.is_active
    and s.inventory_qty > 0
    and coalesce(nullif(s.customer_price, 0), nullif(s.piece_price, 0)) > 0
    and public.product_variant_safe_price(
      p, coalesce(nullif(s.customer_price, 0), nullif(s.piece_price, 0))
    ) > 0;
  if v_matched <> 27 then
    raise exception 'Adidas repricing stopped: only % of 27 live products matched current S&S cost and inventory', v_matched;
  end if;
end;
$$;

with latest as (
  select import_session_id from public.ss_import_staging
  where lower(brand) = 'adidas' and row_status = 'pending'
    and import_session_id like 'ss-brand-adidas-%'
  order by created_date desc limit 1
), priced as (
  select p.id, s.sku, s.size_name, s.color_name, s.color_code,
    s.color_swatch_image, s.color_front_image, s.color_on_model_front_image,
    s.unit_weight, s.inventory_qty, s.fetched_at,
    coalesce(nullif(s.customer_price, 0), nullif(s.piece_price, 0)) vendor_cost,
    public.product_variant_safe_price(
      p, coalesce(nullif(s.customer_price, 0), nullif(s.piece_price, 0))
    ) customer_price
  from public.products p
  cross join latest l
  join public.ss_sku_staging s on s.style_session_id = l.import_session_id
    and lower(s.brand) = 'adidas'
    and (lower(s.style_name) = lower(p.style_number)
      or lower(s.part_number) = lower(p.supplier_sku))
  where lower(p.brand) = 'adidas' and p.visibility = 'public' and p.is_active
    and s.inventory_qty > 0
    and coalesce(nullif(s.customer_price, 0), nullif(s.piece_price, 0)) > 0
), grouped as (
  select id, min(customer_price) customer_price, min(vendor_cost) vendor_cost,
    sum(inventory_qty) inventory, max(fetched_at) refreshed_at,
    jsonb_agg(jsonb_build_object(
      'sku', sku, 'size', size_name, 'color', color_name,
      'price', customer_price, 'vendor_cost', vendor_cost,
      'inventory', inventory_qty, 'color_name', color_name,
      'color_code', color_code,
      'image_url', coalesce(color_on_model_front_image, color_front_image),
      'color_swatch_image', color_swatch_image,
      'unit_weight', unit_weight
    ) order by color_name, size_name, sku) size_prices
  from priced group by id
)
update public.products p set
  price_edit_note = 'Removed HC Apparel MAP pricing policy; repriced from current S&S cost, HC pricing rule, margin, and payment-processing protection.',
  price = g.customer_price,
  vendor_cost = g.vendor_cost,
  stock = g.inventory,
  size_prices = g.size_prices,
  profit_estimate = round(g.customer_price - g.vendor_cost
    - public.worst_enabled_processing_cost(g.customer_price), 2),
  vendor_data_refreshed_at = g.refreshed_at,
  storefront_price_applied_at = now()
from grouped g
where p.id = g.id;

do $$
begin
  if (select count(*) from public.products p
      where lower(p.brand) = 'adidas' and p.visibility = 'public' and p.is_active
        and p.price = public.product_variant_safe_price(p, p.vendor_cost)
        and p.price > p.vendor_cost
        and jsonb_array_length(p.size_prices) > 0) <> 27 then
    raise exception 'Adidas no-MAP repricing verification failed; rolling back';
  end if;
end;
$$;

commit;
