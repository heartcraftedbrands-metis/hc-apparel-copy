begin;

-- Reconcile only the eleven private imports from completed, authenticated S&S
-- SKU sessions. No existing public product is selected by this update.
with draft_styles(brand, style_number, rule_key, session_id) as (
  values
    ('Comfort Colors', '00108', 'hoodie', 'ss-brand-comfortcolors-2026-09-18T13-05-36-455Z-c25f34c5'),
    ('Comfort Colors', '00208', 'youth_kids', 'ss-brand-comfortcolors-2026-09-18T13-05-36-455Z-c25f34c5'),
    ('Comfort Colors', '00808', 'crewneck', 'ss-brand-comfortcolors-2026-09-18T13-05-36-455Z-c25f34c5'),
    ('Comfort Colors', '00908', 'hoodie', 'ss-brand-comfortcolors-2026-09-18T13-05-36-455Z-c25f34c5'),
    ('Comfort Colors', '10008', 'long_sleeve', 'ss-brand-comfortcolors-2026-09-18T13-05-36-455Z-c25f34c5'),
    ('Comfort Colors', '70108', 'hoodie', 'ss-brand-comfortcolors-2026-09-18T13-05-36-455Z-c25f34c5'),
    ('DRI DUCK', '3458', 'hat', 'ss-brand-driduck-2026-09-18T13-47-37-082Z-87d2096d'),
    ('DRI DUCK', '5020', 'outerwear', 'ss-brand-driduck-2026-09-18T13-47-37-082Z-87d2096d'),
    ('DRI DUCK', '7035', 'fleece', 'ss-brand-driduck-2026-09-18T13-47-37-082Z-87d2096d'),
    ('DRI DUCK', '9340', 'fleece', 'ss-brand-driduck-2026-09-18T13-47-37-082Z-87d2096d'),
    ('DRI DUCK', '9416', 'outerwear', 'ss-brand-driduck-2026-09-18T13-47-37-082Z-87d2096d')
), priced as (
  select p.id, p.brand, p.style_number, d.rule_key, s.part_number, s.sku,
    s.size_name, s.color_name, s.color_code, s.color_swatch_image,
    s.color_front_image, s.color_on_model_front_image, s.fetched_at,
    greatest(s.inventory_qty, 0) inventory_qty,
    coalesce(nullif(s.customer_price, 0), nullif(s.piece_price, 0)) vendor_cost,
    round(greatest(
      coalesce(nullif(s.customer_price, 0), nullif(s.piece_price, 0)) + coalesce(r.storefront_margin_buffer, 3),
      coalesce(nullif(s.customer_price, 0), nullif(s.piece_price, 0)) * r.cost_multiplier
        + r.fixed_allowance + coalesce(r.storefront_margin_buffer, 3),
      coalesce(nullif(s.customer_price, 0), nullif(s.piece_price, 0)) / (1 - r.minimum_margin_percent),
      case when p.brand = 'DRI DUCK' and s.map_price > 0.01 then s.map_price else 0 end
    )::numeric, 2) candidate_price
  from public.products p
  join draft_styles d on d.brand = p.brand and d.style_number = p.style_number
  join public.ss_sku_staging s on s.style_session_id = d.session_id
    and s.brand = d.brand
    and (case when d.brand = 'DRI DUCK' then s.style_name else s.part_number end) = d.style_number
  join public.storefront_pricing_rules r on r.rule_key = d.rule_key and r.is_active
  where p.visibility = 'draft' and p.is_active is false
    and p.created_date::date = date '2026-09-18'
    and s.sku is not null and s.color_name is not null and s.size_name is not null
    and coalesce(nullif(s.customer_price, 0), nullif(s.piece_price, 0)) > 0
), reconciled as (
  select id, brand, style_number, rule_key, part_number,
    min(candidate_price) filter (where inventory_qty > 0) public_candidate,
    min(vendor_cost) filter (where inventory_qty > 0) minimum_cost,
    sum(inventory_qty) total_inventory, max(fetched_at) refreshed_at,
    coalesce(max(color_on_model_front_image) filter (where inventory_qty > 0),
      max(color_front_image) filter (where inventory_qty > 0)) primary_image,
    jsonb_agg(jsonb_build_object(
      'sku', sku, 'size', concat(color_name, ' / ', size_name),
      'price', candidate_price, 'vendor_cost', vendor_cost,
      'inventory', inventory_qty, 'color_name', color_name,
      'color_code', color_code,
      'image_url', coalesce(color_on_model_front_image, color_front_image),
      'color_swatch_image', color_swatch_image
    ) order by color_name, size_name, sku) filter (where inventory_qty > 0) variants,
    jsonb_agg(distinct size_name) filter (where inventory_qty > 0) sizes,
    jsonb_agg(distinct jsonb_build_object('name', color_name,
      'color_code', color_code, 'swatch_image', color_swatch_image))
      filter (where inventory_qty > 0) colors
  from priced
  group by id, brand, style_number, rule_key, part_number
)
update public.products p set
  price = r.public_candidate,
  vendor_cost = r.minimum_cost,
  stock = r.total_inventory,
  image_url = coalesce(r.primary_image, p.image_url),
  size_prices = r.variants,
  available_sizes = r.sizes,
  available_colors = r.colors,
  vendor_data_refreshed_at = r.refreshed_at,
  storefront_pricing_rule_key = r.rule_key,
  supplier_sku = r.part_number,
  internal_notes = case when p.brand = 'DRI DUCK' then
    'Private S&S draft refreshed 2026-09-18. Candidate prices are not approved. Verify DRI DUCK MAP policy, category price cap, image rights, and product/cart QA before any publication.'
    else 'Private S&S draft refreshed 2026-09-18. Review category price cap, images, variant availability, product detail, and cart before admin approval. Not published.' end
from reconciled r
where p.id = r.id and r.total_inventory > 0
  and r.public_candidate > 0 and jsonb_array_length(r.variants) > 0;

commit;
