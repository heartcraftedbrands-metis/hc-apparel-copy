begin;

-- Metadata for the five owner-supplied youth front/back compositions imported
-- on 2026-10-09. SKU values are derived from each unchanged original's SHA-256,
-- so this migration is safe to rerun and cannot attach metadata by filename.
do $$
declare
  found_count integer;
begin
  select count(*) into found_count
  from public.digital_mockup_assets
  where sku in (
    'HCM-927308CBC3', 'HCM-3B24950260', 'HCM-2777992497',
    'HCM-155B786F36', 'HCM-5A1BEB5380'
  );
  if found_count <> 5 then
    raise exception 'Expected all 5 imported youth mockups; found %', found_count;
  end if;
end;
$$;

with metadata(sku, title, slug, color_name, description, tags) as (
  values
    (
      'HCM-927308CBC3',
      'Youth Boy Black Tee Front and Back Mockup — Short Hair',
      'youth-boy-black-tee-front-back-short-hair-927308c',
      'Black',
      'A downloadable youth apparel mockup showing a boy with short hair in a blank black T-shirt from the front and back. Front and back views included in one PNG. Digital image download. No physical garment included.',
      array['youth','boy','black t-shirt','short hair','front and back','apparel mockup']::text[]
    ),
    (
      'HCM-3B24950260',
      'Youth Boy White Tee Front and Back Mockup',
      'youth-boy-white-tee-front-back-3b24950',
      'White',
      'A downloadable youth apparel mockup showing a boy in a blank white T-shirt from the front and back. Front and back views included in one PNG. Digital image download. No physical garment included.',
      array['youth','boy','white t-shirt','front and back','apparel mockup']::text[]
    ),
    (
      'HCM-2777992497',
      'Youth Boy Black Tee Front and Back Mockup — Textured Hair',
      'youth-boy-black-tee-front-back-textured-hair-2777992',
      'Black',
      'A downloadable youth apparel mockup showing a boy with textured hair in a blank black T-shirt from the front and back. Front and back views included in one PNG. Digital image download. No physical garment included.',
      array['youth','boy','black t-shirt','textured hair','front and back','apparel mockup']::text[]
    ),
    (
      'HCM-155B786F36',
      'Youth Girl White Tee Front and Back Mockup — Afro Puffs',
      'youth-girl-white-tee-front-back-afro-puffs-155b786',
      'White',
      'A downloadable youth apparel mockup showing a girl with two natural afro puffs in a blank white T-shirt from the front and back. Front and back views included in one PNG. Digital image download. No physical garment included.',
      array['youth','girl','white t-shirt','afro puffs','front and back','apparel mockup']::text[]
    ),
    (
      'HCM-5A1BEB5380',
      'Youth Girl Black Tee Front and Back Mockup — Afro Puffs',
      'youth-girl-black-tee-front-back-afro-puffs-5a1beb5',
      'Black',
      'A downloadable youth apparel mockup showing a girl with two natural afro puffs in a blank black T-shirt from the front and back. Front and back views included in one PNG. Digital image download. No physical garment included.',
      array['youth','girl','black t-shirt','afro puffs','front and back','apparel mockup']::text[]
    )
), updated_assets as (
  update public.digital_mockup_assets asset
  set slug = metadata.slug,
      garment_type = 'youth',
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
