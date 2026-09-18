-- Expand Comfort Colors from existing S&S SKU staging. No public products or
-- existing product/pricing records are changed by this migration.
with selected_styles as (
  select distinct on (style_number) style_number, product_name, product_category, image_url
  from public.ss_import_staging
  where brand = 'Comfort Colors'
    and style_number in ('00108', '00208', '00808', '00908', '10008', '70108')
  order by style_number, created_date desc
), staged as (
  select s.part_number, s.style_name, m.product_name, m.product_category,
    coalesce(max(s.color_on_model_front_image) filter (where s.inventory_qty > 0), max(s.color_front_image) filter (where s.inventory_qty > 0), m.image_url) as image_url,
    min(coalesce(nullif(s.customer_price, 0), nullif(s.piece_price, 0))) filter (where s.inventory_qty > 0) as vendor_price,
    sum(greatest(s.inventory_qty, 0)) as inventory_qty,
    max(s.fetched_at) as fetched_at,
    jsonb_agg(jsonb_build_object(
      'sku', s.sku, 'size', concat(s.color_name, ' / ', s.size_name),
      'price', round((coalesce(nullif(s.customer_price, 0), nullif(s.piece_price, 0)) + 3)::numeric, 2),
      'vendor_cost', coalesce(nullif(s.customer_price, 0), nullif(s.piece_price, 0)),
      'inventory', greatest(s.inventory_qty, 0),
      'color_name', s.color_name, 'color_code', s.color_code,
      'image_url', coalesce(s.color_on_model_front_image, s.color_front_image),
      'color_swatch_image', s.color_swatch_image
    ) order by s.color_name, s.size_order) filter (
      where s.sku is not null and s.color_name is not null and s.size_name is not null
      and coalesce(nullif(s.customer_price, 0), nullif(s.piece_price, 0)) > 0
    ) as variants,
    jsonb_agg(distinct s.size_name) filter (where s.size_name is not null) as sizes,
    jsonb_agg(distinct jsonb_build_object('name', s.color_name, 'color_code', s.color_code, 'swatch_image', s.color_swatch_image)) filter (where s.color_name is not null) as colors
  from public.ss_sku_staging s
  join selected_styles m on m.style_number = s.part_number
  where s.brand = 'Comfort Colors'
  group by s.part_number, s.style_name, m.product_name, m.product_category, m.image_url
)
insert into public.products (
  id, name, description, price, product_type, visibility, is_active,
  image_url, stock, category, categories, tags, available_sizes,
  available_colors, size_prices, vendor_source, vendor_cost,
  supplier_sku, brand, style_number, vendor_data_refreshed_at,
  storefront_pricing_rule_key, internal_notes
)
select gen_random_uuid()::text, staged.product_name,
  staged.product_name || ' is available as blank apparel in the listed colors and sizes. Custom printing is optional.',
  round((staged.vendor_price + 3)::numeric, 2), 'physical', 'draft', false,
  staged.image_url, staged.inventory_qty,
  case
    when staged.product_category ilike '%hood%' then 'hoodies'
    when staged.product_category ilike '%crew%' then 'crewnecks'
    when staged.product_category ilike '%long sleeve%' then 'long_sleeve_shirts'
    else 'short_sleeve_shirts'
  end,
  jsonb_build_array(staged.product_category), '[]'::jsonb,
  coalesce(staged.sizes, '[]'::jsonb), coalesce(staged.colors, '[]'::jsonb),
  coalesce(staged.variants, '[]'::jsonb), 'S&S Activewear', staged.vendor_price,
  staged.part_number, 'Comfort Colors', staged.part_number, staged.fetched_at,
  'vendor_plus_3', 'Imported from S&S staging as private draft. Review image, variants, inventory, copy, and price before publishing.'
from staged
where staged.vendor_price > 0 and staged.image_url is not null and staged.inventory_qty > 0
  and not exists (
    select 1 from public.products existing
    where existing.supplier_sku = staged.part_number
      and (existing.brand = 'Comfort Colors' or existing.name ilike 'Comfort Colors%')
  );
