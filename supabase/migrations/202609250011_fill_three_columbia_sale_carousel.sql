begin;

-- These three SKUs were returned by the authenticated S&S refresh as current
-- salePrice items. Abort instead of publishing if any SKU is no longer a
-- fresh, stocked, unrestricted sale variant when this migration runs.
do $$
declare
  verified_count integer;
begin
  with requested(style_number, sku) as (
    values
      ('06124', 'B06124655'),
      ('19624', 'B19624243'),
      ('16724', 'B16724506')
  ), verified as (
    select r.sku
    from requested r
    join public.products p
      on upper(btrim(p.style_number)) = r.style_number
      and lower(btrim(p.brand)) = 'columbia'
      and p.visibility = 'public'
      and p.is_active is true
      and p.is_sample is false
      and p.product_type = 'physical'
      and p.vendor_source = 'S&S Activewear'
      and p.stock > 0
    join lateral (
      select staged.*
      from public.ss_sku_staging staged
      where staged.sku = r.sku
        and upper(btrim(staged.part_number)) = r.style_number
        and lower(btrim(staged.brand)) = 'columbia'
      order by staged.fetched_at desc
      limit 1
    ) s on true
    where public.ss_sale_is_current(s.sale_price, s.sale_expiration)
      and s.inventory_qty > 0
      and s.noe_retailing is false
      and s.customer_price > 0
      and s.fetched_at >= now() - interval '30 days'
      and nullif(btrim(coalesce(s.color_front_image, s.color_on_model_front_image, p.image_url)), '') is not null
  )
  select count(*) into verified_count from verified;

  if verified_count <> 3 then
    raise exception 'Expected 3 verified Columbia S&S sale SKUs, found %; carousel activation aborted', verified_count;
  end if;
end;
$$;

alter table public.homepage_specials disable trigger validate_homepage_special_before_write;

update public.homepage_specials
set active = false,
    updated_at = now()
where active is true and promotion_slot is not null;

with selections(style_number, sku, headline, slot_number) as (
  values
    ('06124', 'B06124655', 'Trail Shaker Beanie', 1),
    ('19624', 'B19624243', 'Women''s Sucker for Summer Half-Zip Pullover', 2),
    ('16724', 'B16724506', 'Men''s Ascender II Soft Shell Vest', 3)
)
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
  ends_at,
  approved_at,
  rejected_at
)
select
  p.id,
  selection.sku,
  true,
  true,
  selection.headline,
  'Current S&S sale style available through HC Apparel while supplies last.',
  selection.slot_number,
  selection.slot_number,
  'Columbia Sale Pick',
  'S&S salePrice',
  now(),
  null,
  now(),
  null
from selections selection
join public.products p
  on upper(btrim(p.style_number)) = selection.style_number
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
  ends_at = excluded.ends_at,
  approved_at = excluded.approved_at,
  rejected_at = null,
  updated_at = now();

alter table public.homepage_specials enable trigger validate_homepage_special_before_write;

commit;
