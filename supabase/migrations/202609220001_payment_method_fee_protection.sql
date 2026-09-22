begin;

alter table public.checkout_financial_settings
  add column if not exists payment_method_costs jsonb not null default jsonb_build_object(
    'card', jsonb_build_object('label', 'Card', 'enabled', true, 'percentage', 2.90, 'fixed_fee', 0.30, 'updated_at', now()),
    'apple_pay', jsonb_build_object('label', 'Apple Pay', 'enabled', true, 'percentage', 2.90, 'fixed_fee', 0.30, 'updated_at', now()),
    'cashapp', jsonb_build_object('label', 'Cash App Pay', 'enabled', true, 'percentage', 2.90, 'fixed_fee', 0.30, 'updated_at', now()),
    'link', jsonb_build_object('label', 'Link / Card', 'enabled', true, 'percentage', 2.90, 'fixed_fee', 0.30, 'updated_at', now()),
    'afterpay_clearpay', jsonb_build_object('label', 'Cash App Afterpay', 'enabled', true, 'percentage', 6.00, 'fixed_fee', 0.30, 'updated_at', now()),
    'klarna', jsonb_build_object('label', 'Klarna', 'enabled', true, 'percentage', 5.99, 'fixed_fee', 0.30, 'updated_at', now())
  );

update public.checkout_financial_settings
set payment_method_costs = jsonb_build_object(
      'card', jsonb_build_object('label', 'Card', 'enabled', true, 'percentage', 2.90, 'fixed_fee', 0.30, 'updated_at', now()),
      'apple_pay', jsonb_build_object('label', 'Apple Pay', 'enabled', true, 'percentage', 2.90, 'fixed_fee', 0.30, 'updated_at', now()),
      'cashapp', jsonb_build_object('label', 'Cash App Pay', 'enabled', true, 'percentage', 2.90, 'fixed_fee', 0.30, 'updated_at', now()),
      'link', jsonb_build_object('label', 'Link / Card', 'enabled', true, 'percentage', 2.90, 'fixed_fee', 0.30, 'updated_at', now()),
      'afterpay_clearpay', jsonb_build_object('label', 'Cash App Afterpay', 'enabled', true, 'percentage', 6.00, 'fixed_fee', 0.30, 'updated_at', now()),
      'klarna', jsonb_build_object('label', 'Klarna', 'enabled', true, 'percentage', 5.99, 'fixed_fee', 0.30, 'updated_at', now())
    ),
    processing_percent = 6.00,
    processing_fixed_fee = 0.30
where id = 'default';

alter table public.orders
  add column if not exists payment_method_type text,
  add column if not exists estimated_processing_cost numeric,
  add column if not exists actual_processing_cost numeric,
  add column if not exists processing_rate_used jsonb;

alter table public.product_price_audit
  add column if not exists safe_floor_price numeric(10,2);

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
  return round(v_floor, 2);
end;
$$;

create or replace function public.guard_admin_product_price()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_floor numeric;
begin
  if auth.role() <> 'authenticated' or not public.is_admin() then return new; end if;
  if new.price is not distinct from old.price and new.sale_price is not distinct from old.sale_price then return new; end if;
  v_floor := public.product_payment_safe_floor(new);
  if v_floor is not null and (
    new.price < v_floor or (new.sale_price is not null and new.sale_price < v_floor)
  ) and nullif(btrim(new.price_edit_note), '') is null then
    raise exception 'Price is below the payment-protected floor ($%). Add an override reason to continue.', v_floor;
  end if;
  return new;
end;
$$;

create or replace function public.audit_product_price_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.price is distinct from old.price or new.sale_price is distinct from old.sale_price then
    insert into public.product_price_audit (
      product_id, old_price, new_price, old_sale_price, new_sale_price,
      safe_floor_price, edited_by, reason
    ) values (
      new.id, old.price, new.price, old.sale_price, new.sale_price,
      public.product_payment_safe_floor(new), auth.uid(), nullif(btrim(new.price_edit_note), '')
    );
  end if;
  return new;
end;
$$;

comment on column public.checkout_financial_settings.payment_method_costs is 'Admin-only domestic processing assumptions used for margin protection; never a customer surcharge.';
comment on column public.orders.actual_processing_cost is 'Admin-only Stripe fee when available from the charge balance transaction.';

commit;
