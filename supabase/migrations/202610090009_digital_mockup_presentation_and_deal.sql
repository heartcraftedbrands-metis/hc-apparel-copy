begin;

alter table public.digital_mockup_assets
  add column if not exists presentation_type text not null default 'studio';

alter table public.digital_mockup_assets
  drop constraint if exists digital_mockup_assets_presentation_type_check;
alter table public.digital_mockup_assets
  add constraint digital_mockup_assets_presentation_type_check
  check (presentation_type in ('studio', 'flat_lay', 'lifestyle'));

create index if not exists digital_mockup_assets_presentation_idx
  on public.digital_mockup_assets(presentation_type, publication_status, published_at desc);

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
  asset.view_type,
  asset.presentation_type
from public.digital_mockup_assets asset
join public.digital_mockup_versions version on version.id = asset.current_version_id
join public.products product on product.id = asset.product_id
where asset.publication_status = 'published'
  and product.product_type = 'digital'
  and product.visibility = 'public'
  and product.is_active is true;

revoke all on public.storefront_digital_mockups from public;
grant select on public.storefront_digital_mockups to anon, authenticated;

comment on column public.digital_mockup_assets.presentation_type is
  'Controls responsive storefront framing and Flat Lay/Lifestyle filtering; originals are never cropped or changed.';

commit;
