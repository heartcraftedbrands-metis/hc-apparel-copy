begin;

-- A mockup's composition controls its catalog badge, preview treatment, and
-- default price. Historical order item snapshots and download entitlements are
-- deliberately not changed by this migration.
alter table public.digital_mockup_assets
  add column if not exists view_type text not null default 'single_view',
  add column if not exists price_override numeric(10,2);

alter table public.digital_mockup_assets
  drop constraint if exists digital_mockup_assets_view_type_check;
alter table public.digital_mockup_assets
  add constraint digital_mockup_assets_view_type_check
  check (view_type in ('single_view', 'front_back'));

alter table public.digital_mockup_assets
  drop constraint if exists digital_mockup_assets_price_override_check;
alter table public.digital_mockup_assets
  add constraint digital_mockup_assets_price_override_check
  check (price_override is null or price_override > 0);

alter table public.digital_mockup_settings
  add column if not exists single_view_price numeric(10,2) not null default 0.99,
  add column if not exists front_back_price numeric(10,2) not null default 1.20;

alter table public.digital_mockup_settings
  drop constraint if exists digital_mockup_settings_single_view_price_check;
alter table public.digital_mockup_settings
  add constraint digital_mockup_settings_single_view_price_check
  check (single_view_price > 0);

alter table public.digital_mockup_settings
  drop constraint if exists digital_mockup_settings_front_back_price_check;
alter table public.digital_mockup_settings
  add constraint digital_mockup_settings_front_back_price_check
  check (front_back_price > 0);

update public.digital_mockup_settings
set default_price = 0.99,
    single_view_price = 0.99,
    front_back_price = 1.20,
    description = 'Bring your designs to life with downloadable apparel mockups. Choose a single view or front-and-back image and get the original, watermark-free PNG after payment.',
    supporting_text = 'Single-view mockups $0.99 • Front + back mockups $1.20'
where id = true;

-- The launch collection's existing records predate view typing and are the
-- eight single-view files. Future imports explicitly select their view type.
update public.digital_mockup_assets
set view_type = 'single_view'
where view_type is null or view_type = '';

-- Change only future catalog pricing. Paid orders retain their immutable item
-- prices, and existing entitlements continue to point at the same versions.
update public.products product
set price = settings.single_view_price,
    sale_price = null,
    updated_date = now()
from public.digital_mockup_assets asset
cross join public.digital_mockup_settings settings
where asset.product_id = product.id
  and asset.view_type = 'single_view'
  and asset.price_override is null
  and product.product_type = 'digital';

create index if not exists digital_mockup_assets_view_type_idx
  on public.digital_mockup_assets(view_type, publication_status, published_at desc);

-- Anonymous storefront data remains preview-only. Private original paths and
-- hashes are intentionally excluded.
create or replace view public.storefront_digital_mockups
with (security_barrier = true) as
select
  asset.id,
  asset.product_id,
  asset.slug,
  asset.sku,
  product.name as title,
  product.description,
  coalesce(product.sale_price, product.price) as price,
  asset.garment_type,
  asset.color_name,
  asset.tags,
  version.preview_url,
  version.pixel_width,
  version.pixel_height,
  version.mime_type,
  version.file_extension,
  version.file_size_bytes,
  asset.is_featured,
  asset.published_at,
  asset.created_at,
  asset.updated_at,
  asset.view_type
from public.digital_mockup_assets asset
join public.digital_mockup_versions version on version.id = asset.current_version_id
join public.products product on product.id = asset.product_id
where asset.publication_status = 'published'
  and product.product_type = 'digital'
  and product.visibility = 'public'
  and product.is_active is true;

revoke all on public.storefront_digital_mockups from public;
grant select on public.storefront_digital_mockups to anon, authenticated;

commit;
