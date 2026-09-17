begin;

alter table public.homepage_specials
  add column if not exists badge_label text not null default 'Current Pick';

alter table public.homepage_specials
  drop constraint if exists homepage_specials_badge_label_check;
alter table public.homepage_specials
  add constraint homepage_specials_badge_label_check check (badge_label in (
    'Current Pick', 'Great Blank Price', 'Bulk Friendly', 'Cold Weather Pick',
    'Creator Favorite', 'Team Order Pick', 'Brand Builder Pick'
  ));

-- Keep the public projection narrow: never expose S&S cost or admin review data.
-- A verified vendor special overrides the manually chosen featured-product label.
create or replace view public.storefront_homepage_specials
with (security_barrier = true) as
select h.id, p.id as product_id, h.sku, p.brand,
  coalesce(nullif(btrim(h.headline), ''), p.name) as name,
  h.subtitle, p.category,
  coalesce(nullif(h.promo_image_url, ''), nullif(s.color_front_image, ''),
    nullif(s.color_on_model_front_image, ''), p.image_url) as image_url,
  coalesce((
    select (v.value ->> 'price')::numeric
    from jsonb_array_elements(case when jsonb_typeof(p.size_prices) = 'array' then p.size_prices else '[]'::jsonb end) v(value)
    where v.value ->> 'sku' = h.sku and v.value ->> 'price' ~ '^\d+(\.\d+)?$'
    limit 1
  ), coalesce(p.sale_price, p.price)) as price,
  case when s.sale_price > 0 and s.sale_price = s.customer_price
    and s.piece_price > s.sale_price and s.sale_expiration is null
    then s.piece_price + coalesce((
      select (v.value ->> 'price')::numeric
      from jsonb_array_elements(case when jsonb_typeof(p.size_prices) = 'array' then p.size_prices else '[]'::jsonb end) v(value)
      where v.value ->> 'sku' = h.sku and v.value ->> 'price' ~ '^\d+(\.\d+)?$'
      limit 1
    ), coalesce(p.sale_price, p.price)) - s.customer_price
    else null end as comparison_price,
  case when s.sale_price > 0 and s.sale_price = s.customer_price
      and s.piece_price > s.sale_price and s.sale_expiration is null then 'Special'
    else h.badge_label end as badge,
  h.display_order
from public.homepage_specials h
join public.products p on p.id = h.product_id
join lateral (
  select staged.* from public.ss_sku_staging staged
  where staged.sku = h.sku and staged.customer_price > 0
  order by staged.fetched_at desc limit 1
) s on true
where h.approved and h.active and h.rejected_at is null
  and (h.starts_at is null or h.starts_at <= now())
  and (h.ends_at is null or h.ends_at > now())
  and p.visibility = 'public' and p.is_active is true and p.is_sample is false
  and p.product_type = 'physical' and p.vendor_source = 'S&S Activewear'
  and p.stock > 0 and s.inventory_qty > 0 and s.noe_retailing is false
  and s.fetched_at >= now() - interval '30 days'
  and upper(btrim(s.part_number)) = upper(btrim(p.style_number))
  and lower(btrim(s.brand)) = lower(btrim(p.brand))
  and nullif(btrim(p.name), '') is not null
  and lower(p.name) !~ '(test|qa|sample|placeholder)'
  and nullif(btrim(coalesce(s.color_name, '')), '') is not null
  and lower(s.color_name) not in ('?', 'unknown', 'color unavailable')
  and nullif(btrim(coalesce(s.size_name, '')), '') is not null
  and nullif(btrim(coalesce(h.promo_image_url, s.color_front_image, s.color_on_model_front_image, p.image_url)), '') is not null
  and coalesce((
    select (v.value ->> 'price')::numeric
    from jsonb_array_elements(case when jsonb_typeof(p.size_prices) = 'array' then p.size_prices else '[]'::jsonb end) v(value)
    where v.value ->> 'sku' = h.sku and v.value ->> 'price' ~ '^\d+(\.\d+)?$'
    limit 1
  ), coalesce(p.sale_price, p.price)) >= s.customer_price + coalesce(nullif(p.storefront_price_buffer, 0), 3.00);

revoke all on public.storefront_homepage_specials from public;
grant select on public.storefront_homepage_specials to anon, authenticated;

commit;
