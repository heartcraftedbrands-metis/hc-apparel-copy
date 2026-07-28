begin;

create table if not exists public.storefront_pricing_rules (
  rule_key text primary key,
  display_name text not null,
  minimum_price numeric(10, 2) not null check (minimum_price >= 0),
  maximum_price numeric(10, 2) not null check (maximum_price >= minimum_price),
  cost_multiplier numeric(8, 4) not null default 1.30 check (cost_multiplier >= 1),
  fixed_allowance numeric(10, 2) not null default 0 check (fixed_allowance >= 0),
  minimum_margin_percent numeric(8, 4) not null default 0.10
    check (minimum_margin_percent >= 0 and minimum_margin_percent < 1),
  hide_above_maximum boolean not null default true,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

drop trigger if exists storefront_pricing_rules_set_updated_date
on public.storefront_pricing_rules;
create trigger storefront_pricing_rules_set_updated_date
before update on public.storefront_pricing_rules
for each row execute function public.set_updated_date();

alter table public.storefront_pricing_rules enable row level security;
drop policy if exists admin_all_storefront_pricing_rules
on public.storefront_pricing_rules;
create policy admin_all_storefront_pricing_rules
on public.storefront_pricing_rules
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

revoke all on public.storefront_pricing_rules from public, anon;
grant select, insert, update, delete
on public.storefront_pricing_rules to authenticated;

insert into public.storefront_pricing_rules (
  rule_key,
  display_name,
  minimum_price,
  maximum_price,
  cost_multiplier,
  fixed_allowance,
  minimum_margin_percent,
  hide_above_maximum,
  sort_order
)
values
  ('basic_tshirt', 'Basic blank T-shirt', 4.99, 7.99, 1.30, 0.50, 0.08, true, 10),
  ('premium_tshirt', 'Premium T-shirt', 7.99, 11.99, 1.25, 0.75, 0.08, true, 20),
  ('long_sleeve', 'Long sleeve shirt', 9.99, 14.99, 1.25, 0.75, 0.10, true, 30),
  ('tank_top', 'Tank top', 6.99, 11.99, 1.25, 0.50, 0.08, true, 40),
  ('youth_kids', 'Youth / kids shirt', 4.99, 8.99, 1.25, 0.50, 0.08, true, 50),
  ('crewneck', 'Crewneck / sweatshirt', 14.99, 24.99, 1.25, 1.00, 0.10, true, 60),
  ('hoodie', 'Hoodie', 18.99, 34.99, 1.25, 1.00, 0.10, true, 70),
  ('hat', 'Hat / headwear', 7.99, 18.99, 1.25, 0.75, 0.10, true, 80),
  ('bag', 'Bag', 7.99, 39.99, 1.25, 1.00, 0.10, true, 90),
  ('premium_specialty', 'Premium / specialty item', 12.99, 49.99, 1.25, 1.00, 0.12, true, 100)
on conflict (rule_key) do update set
  display_name = excluded.display_name,
  minimum_price = excluded.minimum_price,
  maximum_price = excluded.maximum_price,
  cost_multiplier = excluded.cost_multiplier,
  fixed_allowance = excluded.fixed_allowance,
  minimum_margin_percent = excluded.minimum_margin_percent,
  hide_above_maximum = excluded.hide_above_maximum,
  is_active = true,
  sort_order = excluded.sort_order,
  updated_date = now();

alter table public.products
  add column if not exists storefront_pricing_tier text,
  add column if not exists storefront_pricing_rule_key text,
  add column if not exists storefront_price_applied_at timestamptz,
  add column if not exists storefront_premium boolean not null default false,
  add column if not exists storefront_image_approved boolean not null default false;

create table if not exists public.storefront_pricing_adjustments (
  id text primary key default gen_random_uuid()::text,
  product_id text not null references public.products(id) on delete cascade,
  pricing_rule_key text not null
    references public.storefront_pricing_rules(rule_key),
  previous_price numeric(10, 2) not null,
  public_price numeric(10, 2),
  vendor_cost numeric(10, 2) not null default 0,
  estimated_profit numeric(10, 2),
  visibility_action text not null
    check (visibility_action in ('repriced', 'hidden')),
  reason text not null,
  applied_at timestamptz not null default now()
);

create index if not exists idx_storefront_pricing_adjustments_product
on public.storefront_pricing_adjustments(product_id, applied_at desc);

alter table public.storefront_pricing_adjustments enable row level security;
drop policy if exists admin_all_storefront_pricing_adjustments
on public.storefront_pricing_adjustments;
create policy admin_all_storefront_pricing_adjustments
on public.storefront_pricing_adjustments
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

revoke all on public.storefront_pricing_adjustments from public, anon;
grant select, insert, update, delete
on public.storefront_pricing_adjustments to authenticated;

create or replace function public.hc_storefront_pricing_rule_key(
  p_name text,
  p_style_name text,
  p_brand text,
  p_supplier_sku text,
  p_category text,
  p_categories jsonb,
  p_tags jsonb
)
returns text
language sql
immutable
parallel safe
as $$
  with normalized as (
    select
      lower(concat_ws(
        ' ',
        coalesce(p_name, ''),
        coalesce(p_style_name, ''),
        coalesce(p_supplier_sku, ''),
        coalesce(p_category, ''),
        coalesce(p_categories::text, ''),
        coalesce(p_tags::text, '')
      )) as product_text,
      lower(coalesce(p_brand, '')) as brand_text
  )
  select case
    when product_text ~
      '(backpack|back pack|duffel|duffle|tote|cinch|drawstring bag|messenger bag|gear bag|travel bag|laptop bag|waist pack|pouch)'
      then 'bag'
    when product_text ~
      '(^|[^a-z])(cap|hat|beanie|visor|snapback|headwear)([^a-z]|$)'
      then 'hat'
    when product_text ~
      '(hoodie|hooded|pullover hood|hooded sweatshirt)'
      or product_text ~ '(^|[^a-z0-9])(18500|s700|p170|996mr|ls14001)([^a-z0-9]|$)'
      then 'hoodie'
    when product_text ~
      '(crewneck|crew neck|sweatshirt|fleece crew)'
      or product_text ~ '(^|[^a-z0-9])(18000|s600|1566|562mr|ls14004)([^a-z0-9]|$)'
      then 'crewneck'
    when product_text ~
      '(long sleeve|long-sleeve|l/s tee|l/s t-shirt)'
      or product_text ~ '(^|[^a-z0-9])(2400|29lsr|3501)([^a-z0-9]|$)'
      then 'long_sleeve'
    when product_text ~ '(tank|sleeveless|muscle tank)'
      or product_text ~ '(^|[^a-z0-9])2200([^a-z0-9]|$)'
      then 'tank_top'
    when brand_text = 'rabbit skins'
      or product_text ~ '(youth|toddler|infant|baby|kids|kid''s)'
      then 'youth_kids'
    when (
      product_text ~ '(t-shirt|t shirt|(^|[^a-z])tee([^a-z]|$)|short sleeve|softstyle|jersey tee|pocket tee)'
      or p_category in (
        'short_sleeve_shirts',
        'mens_short_sleeve_shirts',
        'womens_short_sleeve_shirts'
      )
    )
      and brand_text in ('gildan', 'hanes', 'tultex', 'jerzees')
      then 'basic_tshirt'
    when product_text ~
      '(t-shirt|t shirt|(^|[^a-z])tee([^a-z]|$)|short sleeve|softstyle|jersey tee|pocket tee)'
      then 'premium_tshirt'
    else 'premium_specialty'
  end
  from normalized;
$$;

revoke all on function public.hc_storefront_pricing_rule_key(
  text, text, text, text, text, jsonb, jsonb
) from public, anon;
grant execute on function public.hc_storefront_pricing_rule_key(
  text, text, text, text, text, jsonb, jsonb
) to authenticated;

create temporary table hc_storefront_price_plan on commit drop as
with metadata as (
  select
    product.id,
    product.name,
    product.price as previous_price,
    product.image_url,
    product.category,
    product.categories,
    product.tags,
    product.supplier_sku,
    product.storefront_premium,
    product.storefront_image_approved,
    greatest(
      coalesce(product.blank_garment_cost, 0),
      coalesce(product.vendor_cost, 0),
      0
    )::numeric as vendor_cost,
    coalesce(
      max(batch_item.brand),
      case
        when lower(product.name) like 'bella + canvas %' then 'Bella + Canvas'
        when lower(product.name) like 'american apparel %' then 'American Apparel'
        when lower(product.name) like 'comfort colors %' then 'Comfort Colors'
        when lower(product.name) like 'next level %' then 'Next Level'
        when lower(product.name) like 'rabbit skins %' then 'Rabbit Skins'
        when lower(product.name) like 'lane seven %' then 'Lane Seven'
        when lower(product.name) like 'shaka wear %' then 'Shaka Wear'
        else split_part(product.name, ' ', 1)
      end
    ) as brand,
    concat_ws(
      ' ',
      product.name,
      product.description,
      max(approved_price.style_name),
      max(catalog_item.product_name)
    ) as style_name
  from public.products product
  left join public.ss_launch_batch_items batch_item
    on batch_item.product_id = product.id
  left join public.ss_sku_approved_prices approved_price
    on approved_price.style_id = batch_item.style_id
   and lower(approved_price.brand) = lower(batch_item.brand)
  left join public.garment_catalog_items catalog_item
    on lower(catalog_item.style_number) = lower(product.supplier_sku)
  where product.product_type = 'physical'
    and product.visibility = 'public'
    and product.is_active is true
  group by product.id
),
classified as (
  select
    metadata.*,
    public.hc_storefront_pricing_rule_key(
      metadata.name,
      metadata.style_name,
      metadata.brand,
      metadata.supplier_sku,
      metadata.category,
      metadata.categories,
      metadata.tags
    ) as rule_key
  from metadata
),
calculated as (
  select
    classified.*,
    rule.display_name,
    rule.minimum_price,
    rule.maximum_price,
    rule.minimum_margin_percent,
    (
      ceil(
        greatest(
          rule.minimum_price,
          classified.vendor_cost * rule.cost_multiplier + rule.fixed_allowance
        ) - 0.99
      ) + 0.99
    )::numeric(10, 2) as uncapped_price
  from classified
  join public.storefront_pricing_rules rule
    on rule.rule_key = classified.rule_key
   and rule.is_active is true
)
select
  calculated.*,
  least(calculated.maximum_price, calculated.uncapped_price)::numeric(10, 2)
    as public_price,
  case
    when calculated.storefront_image_approved is false
      and (
        nullif(btrim(calculated.image_url), '') is null
        or lower(calculated.image_url) ~
          '(placeholder|no[-_ ]?image|image[-_ ]?unavailable|coming[-_ ]?soon)'
      )
      then 'hidden'
    when calculated.previous_price >= 50
      and calculated.storefront_premium is false
      then 'hidden'
    when calculated.uncapped_price > calculated.maximum_price
      and (
        calculated.maximum_price - calculated.vendor_cost
      ) / nullif(calculated.maximum_price, 0) < calculated.minimum_margin_percent
      then 'hidden'
    else 'repriced'
  end as visibility_action,
  case
    when calculated.storefront_image_approved is false
      and (
        nullif(btrim(calculated.image_url), '') is null
        or lower(calculated.image_url) ~
          '(placeholder|no[-_ ]?image|image[-_ ]?unavailable|coming[-_ ]?soon)'
      )
      then 'Customer-ready product image is missing.'
    when calculated.previous_price >= 50
      and calculated.storefront_premium is false
      then 'Current public price is extreme and no intentional premium override is set.'
    when calculated.uncapped_price > calculated.maximum_price
      and (
        calculated.maximum_price - calculated.vendor_cost
      ) / nullif(calculated.maximum_price, 0) < calculated.minimum_margin_percent
      then 'Customer-friendly maximum would not preserve the rule minimum margin.'
    else 'Customer-friendly blank-garment price applied; decoration remains separate.'
  end as reason
from calculated;

insert into public.storefront_pricing_adjustments (
  product_id,
  pricing_rule_key,
  previous_price,
  public_price,
  vendor_cost,
  estimated_profit,
  visibility_action,
  reason
)
select
  plan.id,
  plan.rule_key,
  plan.previous_price,
  case when plan.visibility_action = 'repriced' then plan.public_price else null end,
  plan.vendor_cost,
  case
    when plan.visibility_action = 'repriced'
      then greatest(plan.public_price - plan.vendor_cost, 0)
    else null
  end,
  plan.visibility_action,
  plan.reason
from hc_storefront_price_plan plan;

update public.products product
set
  price = plan.public_price,
  sale_price = null,
  size_prices = case
    when jsonb_typeof(product.size_prices) = 'array' then (
      select coalesce(
        jsonb_agg(
          case
            when jsonb_typeof(variant.value) = 'object'
              then jsonb_set(
                variant.value,
                '{price}',
                to_jsonb(plan.public_price),
                true
              )
            else variant.value
          end
          order by variant.ordinality
        ),
        '[]'::jsonb
      )
      from jsonb_array_elements(product.size_prices)
        with ordinality as variant(value, ordinality)
    )
    else product.size_prices
  end,
  profit_estimate = greatest(plan.public_price - plan.vendor_cost, 0),
  storefront_pricing_tier = plan.display_name,
  storefront_pricing_rule_key = plan.rule_key,
  storefront_price_applied_at = now(),
  storefront_premium = case
    when lower(plan.brand) in ('adidas', 'oakley')
      and plan.public_price >= 24.99 then true
    else product.storefront_premium
  end,
  updated_date = now()
from hc_storefront_price_plan plan
where product.id = plan.id
  and plan.visibility_action = 'repriced';

update public.products product
set
  is_active = false,
  visibility = 'hidden',
  storefront_pricing_tier = plan.display_name,
  storefront_pricing_rule_key = plan.rule_key,
  storefront_price_applied_at = now(),
  internal_notes = case
    when lower(plan.brand) = 'adidas'
      and plan.previous_price between 85 and 100
      then concat_ws(
        E'\n',
        nullif(btrim(product.internal_notes), ''),
        'Hidden from public shop due to high retail price.'
      )
    else concat_ws(
      E'\n',
      nullif(btrim(product.internal_notes), ''),
      'Hidden from public shop by customer-friendly storefront pricing safeguards. '
        || plan.reason
    )
  end,
  updated_date = now()
from hc_storefront_price_plan plan
where product.id = plan.id
  and plan.visibility_action = 'hidden';

create or replace view public.storefront_products
with (security_barrier = true) as
select
  id,
  name,
  description,
  price,
  sale_price,
  product_type,
  product_subtype,
  design_type,
  visibility,
  image_url,
  mockup_images,
  stock,
  category,
  categories,
  tags,
  is_featured,
  is_best_seller,
  available_sizes,
  available_colors,
  size_prices,
  care_instructions,
  shipping_note,
  is_active,
  created_date,
  updated_date,
  storefront_premium as is_premium
from public.products
where visibility = 'public'
  and is_active is true
  and product_type = 'physical'
  and nullif(btrim(image_url), '') is not null
  and (
    storefront_image_approved is true
    or lower(image_url) !~
      '(placeholder|no[-_ ]?image|image[-_ ]?unavailable|coming[-_ ]?soon)'
  );

revoke all on public.storefront_products from public;
grant select on public.storefront_products to anon, authenticated;

do $$
begin
  if exists (
    select 1
    from public.storefront_products
    where lower(name) like 'gildan 5000%'
      and price not between 4.99 and 7.99
  ) then
    raise exception 'Basic Gildan 5000 pricing is outside the approved range.';
  end if;

  if exists (
    select 1
    from public.storefront_products
    where lower(name) like 'gildan 64000%'
      and price not between 4.99 and 7.99
  ) then
    raise exception 'Basic Gildan 64000 pricing is outside the approved range.';
  end if;

  if exists (
    select 1
    from public.storefront_products
    where price >= 50
      and coalesce(is_premium, false) is false
  ) then
    raise exception 'An unapproved extreme-price product remains public.';
  end if;

  if exists (
    select 1
    from public.storefront_products
    where nullif(btrim(image_url), '') is null
       or lower(image_url) ~
         '(placeholder|no[-_ ]?image|image[-_ ]?unavailable|coming[-_ ]?soon)'
  ) then
    raise exception 'A product without a customer-ready image remains public.';
  end if;
end;
$$;

commit;
