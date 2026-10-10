begin;

-- Publish the eleven owner-supplied single-view PNGs imported on 2026-10-09.
-- SKU values come from each unchanged original's SHA-256 digest. This keeps the
-- operation repeatable and prevents product metadata from being matched by an
-- editable upload filename.
do $$
declare
  found_count integer;
begin
  select count(*) into found_count
  from public.digital_mockup_assets
  where sku in (
    'HCM-C1FE123E1C', 'HCM-20BA78609D', 'HCM-1D97A9835A',
    'HCM-68BC186784', 'HCM-FA732D1996', 'HCM-21A8745F48',
    'HCM-C80EF94C4A', 'HCM-EF833D63D0', 'HCM-732197756B',
    'HCM-2C4BF9FF2E', 'HCM-419B1A959B'
  );

  if found_count <> 11 then
    raise exception 'Expected all 11 imported single-view mockups; found %', found_count;
  end if;
end;
$$;

with metadata(sku, title, slug, color_name, presentation_type, description, tags) as (
  values
    (
      'HCM-C1FE123E1C',
      'Purple Crew-Neck T-Shirt Flat Lay Mockup',
      'purple-crew-neck-t-shirt-flat-lay-mockup-c1fe123',
      'Purple',
      'flat_lay',
      'A downloadable adult apparel flat-lay mockup featuring a blank purple crew-neck T-shirt. Single-view digital image download. No physical garment included.',
      array['adult','t-shirt','purple','single view','flat lay','apparel mockup']::text[]
    ),
    (
      'HCM-20BA78609D',
      'Royal Blue Crew-Neck T-Shirt Flat Lay Mockup',
      'royal-blue-crew-neck-t-shirt-flat-lay-mockup-20ba786',
      'Royal Blue',
      'flat_lay',
      'A downloadable adult apparel flat-lay mockup featuring a blank royal blue crew-neck T-shirt. Single-view digital image download. No physical garment included.',
      array['adult','t-shirt','royal blue','single view','flat lay','apparel mockup']::text[]
    ),
    (
      'HCM-1D97A9835A',
      'Black Crew-Neck T-Shirt Flat Lay Mockup',
      'black-crew-neck-t-shirt-flat-lay-mockup-1d97a98',
      'Black',
      'flat_lay',
      'A downloadable adult apparel flat-lay mockup featuring a blank black crew-neck T-shirt. Single-view digital image download. No physical garment included.',
      array['adult','t-shirt','black','single view','flat lay','apparel mockup']::text[]
    ),
    (
      'HCM-68BC186784',
      'Natural Crew-Neck T-Shirt Flat Lay Mockup',
      'natural-crew-neck-t-shirt-flat-lay-mockup-68bc186',
      'Natural',
      'flat_lay',
      'A downloadable adult apparel flat-lay mockup featuring a blank natural crew-neck T-shirt. Single-view digital image download. No physical garment included.',
      array['adult','t-shirt','natural','single view','flat lay','apparel mockup']::text[]
    ),
    (
      'HCM-FA732D1996',
      'Navy Crew-Neck T-Shirt Flat Lay Mockup',
      'navy-crew-neck-t-shirt-flat-lay-mockup-fa732d1',
      'Navy',
      'flat_lay',
      'A downloadable adult apparel flat-lay mockup featuring a blank navy crew-neck T-shirt. Single-view digital image download. No physical garment included.',
      array['adult','t-shirt','navy','single view','flat lay','apparel mockup']::text[]
    ),
    (
      'HCM-21A8745F48',
      'Black Crew-Neck T-Shirt Lifestyle Mockup — Golden Hair',
      'black-crew-neck-t-shirt-lifestyle-golden-hair-21a8745',
      'Black',
      'lifestyle',
      'A downloadable adult lifestyle mockup featuring a female model with golden-brown shoulder-length hair wearing a blank black crew-neck T-shirt by a stone wall. Single-view digital image download. No physical garment included.',
      array['adult','female model','t-shirt','black','single view','lifestyle','stone wall','apparel mockup']::text[]
    ),
    (
      'HCM-C80EF94C4A',
      'Natural Crew-Neck T-Shirt Lifestyle Mockup — Golden Hair',
      'natural-crew-neck-t-shirt-lifestyle-golden-hair-c80ef94',
      'Natural',
      'lifestyle',
      'A downloadable adult lifestyle mockup featuring a female model with golden-brown shoulder-length hair wearing a blank natural crew-neck T-shirt by a stone wall. Single-view digital image download. No physical garment included.',
      array['adult','female model','t-shirt','natural','single view','lifestyle','stone wall','apparel mockup']::text[]
    ),
    (
      'HCM-EF833D63D0',
      'White Crew-Neck T-Shirt Lifestyle Mockup — Golden Hair',
      'white-crew-neck-t-shirt-lifestyle-golden-hair-ef833d6',
      'White',
      'lifestyle',
      'A downloadable adult lifestyle mockup featuring a female model with golden-brown shoulder-length hair wearing a blank white crew-neck T-shirt by a stone wall. Single-view digital image download. No physical garment included.',
      array['adult','female model','t-shirt','white','single view','lifestyle','stone wall','apparel mockup']::text[]
    ),
    (
      'HCM-732197756B',
      'Black Crew-Neck T-Shirt Lifestyle Mockup — Copper Hair',
      'black-crew-neck-t-shirt-lifestyle-copper-hair-7321977',
      'Black',
      'lifestyle',
      'A downloadable adult lifestyle mockup featuring a freckled female model with shoulder-length copper hair wearing a blank black crew-neck T-shirt by a stone wall. Single-view digital image download. No physical garment included.',
      array['adult','female model','t-shirt','black','single view','lifestyle','copper hair','stone wall','apparel mockup']::text[]
    ),
    (
      'HCM-2C4BF9FF2E',
      'Natural Crew-Neck T-Shirt Lifestyle Mockup — Copper Hair, Orange Plaid',
      'natural-crew-neck-t-shirt-lifestyle-copper-hair-orange-plaid-2c4bf9f',
      'Natural',
      'lifestyle',
      'A downloadable adult lifestyle mockup featuring a freckled female model with shoulder-length copper hair wearing a blank natural crew-neck T-shirt with orange plaid styling by a stone wall. Single-view digital image download. No physical garment included.',
      array['adult','female model','t-shirt','natural','single view','lifestyle','copper hair','orange plaid','stone wall','apparel mockup']::text[]
    ),
    (
      'HCM-419B1A959B',
      'Natural Crew-Neck T-Shirt Lifestyle Mockup — Copper Hair, Green Plaid',
      'natural-crew-neck-t-shirt-lifestyle-copper-hair-green-plaid-419b1a9',
      'Natural',
      'lifestyle',
      'A downloadable adult lifestyle mockup featuring a freckled female model with copper hair wearing a blank natural crew-neck T-shirt with green plaid styling by a stone wall. Single-view digital image download. No physical garment included.',
      array['adult','female model','t-shirt','natural','single view','lifestyle','copper hair','green plaid','stone wall','apparel mockup']::text[]
    )
), updated_assets as (
  update public.digital_mockup_assets asset
  set slug = metadata.slug,
      garment_type = 't_shirt',
      color_name = metadata.color_name,
      tags = metadata.tags,
      view_type = 'single_view',
      presentation_type = metadata.presentation_type,
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
    price = settings.single_view_price,
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
