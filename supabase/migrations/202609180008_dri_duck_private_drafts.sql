-- S&S public catalog references only. These DRI DUCK styles must remain
-- private until wholesale cost, MAP, inventory, and SKU variants are verified.
with source(style_number, name, category, image_url, description, sizes, colors, source_url) as (
  values
  ('5020', 'DRI DUCK 5020 Men''s Cheyenne Boulder Cloth Hooded Jacket', 'outerwear', 'https://cdn.ssactivewear.com/Images/ModelColor/24414_omf_fm.jpg', 'Boulder Cloth canvas hooded jacket with tricot quilt lining, three-piece hood, and inside pockets.', '["XS","S","M","L","XL","2XL","3XL","4XL","5XL","6XL"]'::jsonb, '["Black","Charcoal","Field Khaki","Gravel","Navy","Saddle","Tobacco"]'::jsonb, 'https://www.ssactivewear.com/p/dri_duck/5020'),
  ('9416', 'DRI DUCK 9416 Women''s Motion Soft Shell Jacket', 'womens_jackets', 'https://cdn.ssactivewear.com/Images/ModelColor/112031_omf_fm.jpg', 'Women''s soft shell jacket with contoured panels, wind- and water-resistant construction, and zippered hand pockets.', '["S","M","L","XL","2XL","3XL"]'::jsonb, '["Black"]'::jsonb, 'https://www.ssactivewear.com/p/dri_duck/9416'),
  ('9340', 'DRI DUCK 9340 Women''s Denali Mountain Fleece Pullover', 'fleece', 'https://cdn.ssactivewear.com/Images/ModelColor/69996_omf_fm.jpg', 'Women''s Mountain Fleece pullover with an anti-pill finish, chest pocket, and quarter-length snap placket.', '["S","M","L","XL","2XL","3XL"]'::jsonb, '["Charcoal","Fatigue","Platinum"]'::jsonb, 'https://www.ssactivewear.com/p/dri_duck/9340'),
  ('7035', 'DRI DUCK 7035 Men''s Woodland Fleece Hooded Pullover', 'hoodies', 'https://cdn.ssactivewear.com/Images/ModelColor/99950_omf_fm.jpg', 'Power Fleece hooded pullover with a textured thermal-lined hood and articulated elbows.', '["S","M","L","XL","2XL","3XL","4XL"]'::jsonb, '["Black","Dark Oxford","Navy","Saddle"]'::jsonb, 'https://www.ssactivewear.com/p/dri_duck/7035'),
  ('3458', 'DRI DUCK 3458 Territory Trucker Cap', 'hats', 'https://cdn.ssactivewear.com/Images/Color/82104_f_fm.jpg', 'Structured six-panel trucker cap with mesh back, curved bill, moisture-management sweatband, and snapback closure.', '["Adjustable"]'::jsonb, '["Charcoal","Forest","Khaki"]'::jsonb, 'https://www.ssactivewear.com/p/dri_duck/3458')
)
insert into public.products (
  id, name, description, price, product_type, visibility, is_active,
  image_url, stock, category, categories, tags, available_sizes,
  available_colors, size_prices, vendor_source, vendor_cost,
  supplier_sku, brand, style_number, vendor_specs, internal_notes
)
select gen_random_uuid()::text, source.name, source.description, 0,
  'physical', 'draft', false, source.image_url, 0, source.category,
  jsonb_build_array(source.category), '[]'::jsonb, source.sizes,
  source.colors, '[]'::jsonb, 'S&S Activewear', null,
  source.style_number, 'DRI DUCK', source.style_number,
  jsonb_build_object('source_url', source.source_url, 'map_review_required', true),
  'S&S public catalog reference only. Private draft: verify wholesale cost, DRI DUCK MAP policy, exact SKU variants, image rights, and current inventory through the authenticated S&S API before QA/publication.'
from source
where not exists (
  select 1 from public.products existing
  where existing.style_number = source.style_number
    and (lower(coalesce(existing.brand, '')) = 'dri duck' or existing.name ilike 'DRI DUCK%')
);
