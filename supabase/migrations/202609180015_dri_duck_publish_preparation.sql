begin;

do $$
begin
  if (select count(*) from public.storefront_products) <> 102 then
    raise exception 'Public catalog changed before DRI DUCK publication preparation';
  end if;
  if (select count(*) from public.products p
      where p.id in (
        '3599aa56-e60a-4228-bda7-94429b9ff12c',
        'bef05148-962a-4e6b-b00d-906569121f60',
        '2cbb2d17-f451-4c6e-9536-82f5b28cb625',
        '94305c4b-4391-47ea-8ff1-cb50299fc462',
        '898b762a-4f9d-4857-a284-de179f368de5'
      ) and p.brand = 'DRI DUCK' and p.visibility = 'draft'
        and p.is_active is false and p.vendor_source = 'S&S Activewear'
        and p.stock > 0 and p.price > 0 and p.vendor_cost > 0
        and p.image_url like 'https://www.ssactivewear.com/Images/%'
        and jsonb_array_length(p.size_prices) > 0) <> 5 then
    raise exception 'The five private DRI DUCK drafts are not intact';
  end if;
end;
$$;

-- Keep the existing category-wide rules unchanged. These DRI DUCK-only caps
-- admit real S&S MAP-backed prices without lowering MAP or margin floors.
insert into public.storefront_pricing_rules (
  rule_key, display_name, minimum_price, maximum_price, cost_multiplier,
  fixed_allowance, minimum_margin_percent, hide_above_maximum, is_active,
  sort_order, storefront_margin_buffer
)
select 'dri_duck_outerwear', 'DRI DUCK outerwear', minimum_price, 129.99,
  cost_multiplier, fixed_allowance, minimum_margin_percent,
  hide_above_maximum, true, sort_order + 1, storefront_margin_buffer
from public.storefront_pricing_rules where rule_key = 'outerwear' and is_active
union all
select 'dri_duck_fleece', 'DRI DUCK fleece', minimum_price, 79.99,
  cost_multiplier, fixed_allowance, minimum_margin_percent,
  hide_above_maximum, true, sort_order + 1, storefront_margin_buffer
from public.storefront_pricing_rules where rule_key = 'fleece' and is_active;

do $$
begin
  if (select count(*) from public.storefront_pricing_rules
      where rule_key in ('dri_duck_outerwear', 'dri_duck_fleece') and is_active) <> 2 then
    raise exception 'DRI DUCK-specific pricing rules were not created';
  end if;
end;
$$;

update public.products p set
  name = case p.style_number
    when '3458' then 'DRI DUCK - 3458 - Territory Trucker Cap'
    when '5020' then 'DRI DUCK - 5020 - Men''s Cheyenne Boulder Cloth Hooded Jacket'
    when '7035' then 'DRI DUCK - 7035 - Men''s Woodland Fleece Hooded Pullover'
    when '9340' then 'DRI DUCK - 9340 - Women''s Denali Mountain Fleece Pullover'
    when '9416' then 'DRI DUCK - 9416 - Women''s Motion Soft Shell Jacket'
  end,
  storefront_pricing_rule_key = case
    when p.style_number in ('5020', '9416') then 'dri_duck_outerwear'
    when p.style_number in ('7035', '9340') then 'dri_duck_fleece'
    else p.storefront_pricing_rule_key end,
  -- The vendor source and SKU staging remain admin-side. Avoid exposing the
  -- S&S source URL or MAP review flag in customer-facing Specs later.
  vendor_specs = '{}'::jsonb,
  internal_notes = case p.style_number
    when '9340' then 'Publication preparation only — private. Authenticated S&S image and stocked SKUs verified. S&S MAP is a $0.01 placeholder (not a verified floor); owner explicitly requested removal of the MAP-review publication barrier on 2026-09-18. Public prices still follow the stored DRI DUCK fleece margin rule. Complete private detail/cart QA before publication.'
    else 'Publication preparation only — private. Authenticated S&S image, stocked SKUs, real MAP, and DRI DUCK-specific price cap verified on 2026-09-18. Complete private detail/cart QA before publication.'
  end
where p.brand = 'DRI DUCK' and p.created_date::date = date '2026-09-18'
  and p.style_number in ('3458', '5020', '7035', '9340', '9416')
  and p.visibility = 'draft' and p.is_active is false;

do $$
begin
  if (select count(*) from public.storefront_products) <> 102
     or (select count(*) from public.products where brand = 'DRI DUCK'
         and created_date::date = date '2026-09-18'
         and visibility = 'draft' and is_active is false) <> 5 then
    raise exception 'DRI DUCK preparation changed public visibility';
  end if;
end;
$$;

commit;
