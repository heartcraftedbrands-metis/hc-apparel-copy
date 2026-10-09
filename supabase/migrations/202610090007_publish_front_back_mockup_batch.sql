begin;

-- Metadata for the seven owner-supplied front/back compositions imported on
-- 2026-10-09. The SKU hashes are produced from the unchanged original PNGs,
-- making this update repeatable without relying on filename spacing.
do $$
declare
  found_count integer;
begin
  select count(*) into found_count
  from public.digital_mockup_assets
  where sku in (
    'HCM-DEED019B40', 'HCM-A8F2DC5B84', 'HCM-4E0795080E',
    'HCM-0736136BE4', 'HCM-FA561608F1', 'HCM-8B20C69D1D',
    'HCM-C9A46F637C'
  );
  if found_count <> 7 then
    raise exception 'Expected all 7 imported front/back mockups; found %', found_count;
  end if;
end;
$$;

with metadata(sku, title, slug, color_name, description, tags) as (
  values
    (
      'HCM-DEED019B40',
      'Natural Oversized T-Shirt Mockup — Male Model Front + Back',
      'natural-oversized-t-shirt-mockup-male-front-back-deed019',
      'Natural',
      'A downloadable apparel mockup showing a male model in a blank natural oversized T-shirt from the front and back. Front and back views included in one PNG. Digital image download. No physical garment included.',
      array['oversized t-shirt','natural','male model','front and back','apparel mockup']::text[]
    ),
    (
      'HCM-A8F2DC5B84',
      'Black Oversized T-Shirt Mockup — Male Model Front + Back',
      'black-oversized-t-shirt-mockup-male-front-back-a8f2dc5',
      'Black',
      'A downloadable apparel mockup showing a male model in a blank black oversized T-shirt from the front and back. Front and back views included in one PNG. Digital image download. No physical garment included.',
      array['oversized t-shirt','black','male model','front and back','apparel mockup']::text[]
    ),
    (
      'HCM-4E0795080E',
      'White Oversized T-Shirt Mockup — Female Model Front + Back',
      'white-oversized-t-shirt-mockup-female-front-back-4e07950',
      'White',
      'A downloadable apparel mockup showing a female model in a blank white oversized T-shirt from the front and back. Front and back views included in one PNG. Digital image download. No physical garment included.',
      array['oversized t-shirt','white','female model','front and back','apparel mockup']::text[]
    ),
    (
      'HCM-0736136BE4',
      'Tan Oversized T-Shirt Mockup — Female Model Front + Back',
      'tan-oversized-t-shirt-mockup-female-front-back-0736136',
      'Tan',
      'A downloadable apparel mockup showing a female model in a blank tan oversized T-shirt from the front and back. Front and back views included in one PNG. Digital image download. No physical garment included.',
      array['oversized t-shirt','tan','female model','front and back','apparel mockup']::text[]
    ),
    (
      'HCM-FA561608F1',
      'Tan Oversized T-Shirt Mockup — Male Model Front + Back',
      'tan-oversized-t-shirt-mockup-male-front-back-fa56160',
      'Tan',
      'A downloadable apparel mockup showing a male model in a blank tan oversized T-shirt from the front and back. Front and back views included in one PNG. Digital image download. No physical garment included.',
      array['oversized t-shirt','tan','male model','front and back','apparel mockup']::text[]
    ),
    (
      'HCM-8B20C69D1D',
      'White T-Shirt Mockup — Male Model with Locs Front + Back',
      'white-t-shirt-mockup-male-locs-front-back-8b20c69',
      'White',
      'A downloadable apparel mockup showing a male model with locs in a blank white T-shirt from the front and back. Front and back views included in one PNG. Digital image download. No physical garment included.',
      array['t-shirt','white','male model','locs','front and back','apparel mockup']::text[]
    ),
    (
      'HCM-C9A46F637C',
      'Black T-Shirt Mockup — Male Model with Locs Front + Back',
      'black-t-shirt-mockup-male-locs-front-back-c9a46f6',
      'Black',
      'A downloadable apparel mockup showing a male model with locs in a blank black T-shirt from the front and back. Front and back views included in one PNG. Digital image download. No physical garment included.',
      array['t-shirt','black','male model','locs','front and back','apparel mockup']::text[]
    )
), updated_assets as (
  update public.digital_mockup_assets asset
  set slug = metadata.slug,
      garment_type = 't_shirt',
      color_name = metadata.color_name,
      tags = metadata.tags,
      view_type = 'front_back',
      price_override = null,
      publication_status = 'published',
      published_at = coalesce(asset.published_at, now())
  from metadata
  where asset.sku = metadata.sku
  returning asset.id, asset.product_id, asset.sku
)
update public.products product
set name = metadata.title,
    description = metadata.description,
    price = settings.front_back_price,
    sale_price = null,
    image_url = version.preview_url,
    tags = to_jsonb(metadata.tags),
    product_type = 'digital',
    is_active = true,
    visibility = 'public',
    updated_date = now()
from updated_assets asset
join metadata on metadata.sku = asset.sku
join public.digital_mockup_assets current_asset on current_asset.id = asset.id
join public.digital_mockup_versions version on version.id = current_asset.current_version_id
cross join public.digital_mockup_settings settings
where product.id = asset.product_id;

commit;
