begin;

update public.storefront_pricing_rules
set
  maximum_price = 6.99,
  storefront_margin_buffer = 3.00,
  updated_date = now()
where rule_key = 'basic_tshirt';

with capped as (
  select
    product.id,
    product.price as previous_price,
    9.99::numeric(10, 2) as public_price,
    greatest(
      coalesce(product.blank_garment_cost, 0),
      coalesce(product.vendor_cost, 0),
      0
    ) as vendor_cost
  from public.products product
  where product.visibility = 'public'
    and product.is_active
    and product.product_type = 'physical'
    and product.storefront_pricing_rule_key = 'basic_tshirt'
    and product.price > 9.99
),
audit as (
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
    capped.id,
    'basic_tshirt',
    capped.previous_price,
    capped.public_price,
    capped.vendor_cost,
    greatest(capped.public_price - capped.vendor_cost, 0),
    'repriced',
    'Customer-friendly basic tee cap retained after configured $3.00 storefront buffer.'
  from capped
  returning product_id
)
update public.products product
set
  price = capped.public_price,
  sale_price = null,
  storefront_price_before_buffer = 6.99,
  storefront_price_buffer = 3.00,
  size_prices = case
    when jsonb_typeof(product.size_prices) = 'array' then (
      select coalesce(
        jsonb_agg(
          case
            when jsonb_typeof(variant.value) = 'object'
              and nullif(variant.value ->> 'price', '') is not null
              then jsonb_set(
                variant.value,
                '{price}',
                to_jsonb(
                  least((variant.value ->> 'price')::numeric, capped.public_price)
                    ::numeric(10, 2)
                ),
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
  profit_estimate = greatest(capped.public_price - capped.vendor_cost, 0),
  updated_date = now()
from capped
where product.id = capped.id;

do $$
begin
  if exists (
    select 1
    from public.storefront_products storefront
    join public.products product on product.id = storefront.id
    where product.storefront_pricing_rule_key = 'basic_tshirt'
      and storefront.price > 9.99
  ) then
    raise exception 'A basic blank tee exceeds the customer-friendly buffered cap';
  end if;

  if (select count(*) from public.storefront_products) <> 57 then
    raise exception 'The public product count changed while capping basic tee pricing';
  end if;
end;
$$;

commit;
