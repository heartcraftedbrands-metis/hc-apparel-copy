begin;

create or replace function public.product_payment_safe_floor(p_product public.products)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  v_rule public.storefront_pricing_rules%rowtype;
  v_settings public.checkout_financial_settings%rowtype;
  v_method record;
  v_margin numeric;
  v_floor numeric;
  v_method_floor numeric;
begin
  if p_product.vendor_cost is null or p_product.vendor_cost <= 0 then return null; end if;
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
  v_margin := greatest(coalesce(v_settings.minimum_margin_per_item, 3), coalesce(v_rule.storefront_margin_buffer, 3));
  v_floor := greatest(
    coalesce(v_rule.minimum_price, 0),
    p_product.vendor_cost / nullif(1 - coalesce(v_rule.minimum_margin_percent, 0), 0)
  );
  for v_method in select value from jsonb_each(coalesce(v_settings.payment_method_costs, '{}'::jsonb))
  loop
    if coalesce((v_method.value->>'enabled')::boolean, false) then
      v_method_floor := (
        p_product.vendor_cost + v_margin + coalesce((v_method.value->>'fixed_fee')::numeric, 0)
      ) / nullif(1 - coalesce((v_method.value->>'percentage')::numeric, 0) / 100, 0);
      v_floor := greatest(v_floor, v_method_floor);
    end if;
  end loop;
  -- Never round a safety floor down. Product pricing uses cent precision.
  return ceil(v_floor * 100) / 100;
end;
$$;

commit;
