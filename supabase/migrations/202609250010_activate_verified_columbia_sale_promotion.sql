begin;

-- The authenticated S&S variant refresh on 2026-09-25 verified this exact SKU
-- as a current salePrice item with live inventory. Adidas and American Apparel
-- remain intentionally unfilled because S&S returned no qualifying sale SKU.
alter table public.homepage_specials disable trigger validate_homepage_special_before_write;

insert into public.homepage_specials (
  product_id,
  sku,
  approved,
  active,
  headline,
  subtitle,
  display_order,
  promotion_slot,
  badge_label,
  sale_field_source,
  starts_at,
  approved_at,
  rejected_at
)
select
  p.id,
  'B19624243',
  true,
  true,
  'Women''s Sucker for Summer Half-Zip Pullover',
  'Current S&S sale style available through HC Apparel while supplies last.',
  3,
  3,
  'Columbia Sale Pick',
  'S&S salePrice',
  now(),
  now(),
  null
from public.products p
where upper(btrim(p.style_number)) = '19624'
  and lower(btrim(p.brand)) = 'columbia'
  and p.visibility = 'public'
  and p.is_active is true
  and p.is_sample is false
on conflict (product_id, sku) do update set
  approved = excluded.approved,
  active = excluded.active,
  headline = excluded.headline,
  subtitle = excluded.subtitle,
  display_order = excluded.display_order,
  promotion_slot = excluded.promotion_slot,
  badge_label = excluded.badge_label,
  sale_field_source = excluded.sale_field_source,
  starts_at = excluded.starts_at,
  approved_at = excluded.approved_at,
  rejected_at = null,
  updated_at = now();

alter table public.homepage_specials enable trigger validate_homepage_special_before_write;

commit;
