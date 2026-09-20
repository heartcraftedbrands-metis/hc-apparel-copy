-- Import exactly 20 authenticated S&S Champion styles as inactive drafts.
-- This migration never publishes products and never changes existing products.
begin;

with latest_session as (
  select import_session_id
  from public.ss_import_staging
  where brand = 'Champion' and import_session_id like 'ss-brand-champion-%'
  order by created_date desc
  limit 1
), meta as (
  select distinct on (s.style_number)
    s.import_session_id, s.row_number, s.style_number as part_number,
    nullif(s.raw_row_data::jsonb->>'styleName', '') as style_name,
    nullif(s.raw_row_data::jsonb->>'title', '') as title,
    nullif(s.raw_row_data::jsonb->>'description', '') as raw_description,
    nullif(s.product_category, '') as vendor_category,
    s.image_url as style_image
  from public.ss_import_staging s
  join latest_session l using (import_session_id)
  where s.brand = 'Champion' and s.row_status = 'pending'
  order by s.style_number, s.created_date desc
), classified as (
  select m.*,
    lower(concat_ws(' ', m.style_name, m.title, m.vendor_category)) as product_text,
    case
      when lower(concat_ws(' ', m.style_name, m.title, m.vendor_category)) ~ '(hood|hoodie)' then 'hoodie'
      when lower(concat_ws(' ', m.style_name, m.title, m.vendor_category)) ~ '(crew|sweatshirt)' then 'crewneck'
      when lower(concat_ws(' ', m.style_name, m.title, m.vendor_category)) ~ '(tee|t-shirt|t shirt)' then 'premium_tshirt'
      else 'premium_specialty'
    end as rule_key,
    case
      when lower(concat_ws(' ', m.style_name, m.title, m.vendor_category)) ~ '(polo)' then 'polo_shirts'
      when lower(concat_ws(' ', m.style_name, m.title, m.vendor_category)) ~ '(jacket|vest|outerwear)' then 'jackets'
      when lower(concat_ws(' ', m.style_name, m.title, m.vendor_category)) ~ '(hood|hoodie)' then 'hoodies'
      when lower(concat_ws(' ', m.style_name, m.title, m.vendor_category)) ~ '(crew|sweatshirt)' then 'crewnecks'
      when lower(concat_ws(' ', m.style_name, m.title, m.vendor_category)) ~ '(women|ladies)' then 'womens_sportswear'
      else 'sportswear'
    end as public_category
  from meta m
), priced_variants as (
  select c.*, s.sku, s.size_name, s.size_order, s.color_name, s.color_code,
    s.color_swatch_image, s.color_front_image, s.color_on_model_front_image,
    s.unit_weight, s.inventory_qty, s.fetched_at,
    coalesce(nullif(s.customer_price, 0), nullif(s.piece_price, 0)) as vendor_price,
    case when s.map_price > 0.01 then s.map_price else null end as real_map,
    round(greatest(
      coalesce(nullif(s.customer_price, 0), nullif(s.piece_price, 0)) + coalesce(r.storefront_margin_buffer, 3),
      coalesce(nullif(s.customer_price, 0), nullif(s.piece_price, 0)) * r.cost_multiplier
        + r.fixed_allowance + coalesce(r.storefront_margin_buffer, 3),
      coalesce(nullif(s.customer_price, 0), nullif(s.piece_price, 0)) / (1 - r.minimum_margin_percent),
      case when s.map_price > 0.01 then s.map_price else 0 end
    )::numeric, 2) as public_price
  from classified c
  join public.ss_sku_staging s on s.style_session_id = c.import_session_id
    and s.brand = 'Champion' and s.part_number = c.part_number
  join public.storefront_pricing_rules r on r.rule_key = c.rule_key and r.is_active
  where s.sku is not null and s.size_name is not null and s.color_name is not null
    and s.inventory_qty > 0
    and coalesce(nullif(s.customer_price, 0), nullif(s.piece_price, 0)) > 0
), aggregated as (
  select import_session_id, row_number, part_number, style_name, title,
    raw_description, vendor_category, style_image, product_text, rule_key, public_category,
    min(vendor_price) as minimum_vendor_cost,
    min(public_price) as minimum_public_price,
    sum(inventory_qty) as total_inventory,
    max(fetched_at) as refreshed_at,
    max(unit_weight) filter (where unit_weight > 0) as unit_weight,
    coalesce(
      max(color_on_model_front_image) filter (where color_on_model_front_image is not null),
      max(color_front_image) filter (where color_front_image is not null),
      style_image
    ) as primary_image,
    jsonb_agg(jsonb_build_object(
      'sku', sku, 'size', size_name, 'color', color_name,
      'price', public_price, 'vendor_cost', vendor_price,
      'inventory', inventory_qty, 'color_name', color_name,
      'color_code', color_code,
      'image_url', coalesce(color_on_model_front_image, color_front_image),
      'color_swatch_image', color_swatch_image,
      'unit_weight', unit_weight
    ) order by color_name, size_order, sku) as variants,
    jsonb_agg(distinct size_name) as sizes,
    jsonb_agg(distinct jsonb_build_object(
      'name', color_name, 'color_code', color_code, 'swatch_image', color_swatch_image
    )) as colors
  from priced_variants
  group by import_session_id, row_number, part_number, style_name, title,
    raw_description, vendor_category, style_image, product_text, rule_key, public_category
), eligible as (
  select a.*
  from aggregated a
  where a.primary_image is not null and a.minimum_vendor_cost > 0
    and a.minimum_public_price >= a.minimum_vendor_cost
    and a.total_inventory > 0 and jsonb_array_length(a.variants) > 0
    and a.refreshed_at >= now() - interval '1 day'
    and not exists (
      select 1 from public.products p
      where p.brand = 'Champion'
        and (lower(coalesce(p.style_number, '')) = lower(coalesce(a.style_name, ''))
          or lower(coalesce(p.supplier_sku, '')) = lower(a.part_number))
    )
  order by a.row_number
  limit 20
), inserted as (
  insert into public.products (
    id, name, description, price, product_type, visibility, is_active,
    image_url, stock, category, categories, tags, available_sizes,
    available_colors, size_prices, vendor_source, vendor_cost,
    supplier_sku, brand, style_number, vendor_data_refreshed_at,
    storefront_pricing_rule_key, storefront_price_applied_at,
    fabric_material, garment_weight, features, internal_notes
  )
  select gen_random_uuid()::text,
    trim(concat('Champion ', coalesce(nullif(title, ''), nullif(style_name, ''), 'Apparel'))),
    coalesce(
      nullif(trim(regexp_replace(regexp_replace(raw_description, '<[^>]+>', ' ', 'g'), '\s+', ' ', 'g')), ''),
      trim(concat('Champion ', coalesce(title, style_name),
        ' blank apparel for teams, staff, organizations, businesses, and everyday wear. Custom printing is optional.'))
    ),
    minimum_public_price, 'physical', 'draft', false,
    primary_image, total_inventory, public_category,
    jsonb_build_array(vendor_category, public_category),
    jsonb_strip_nulls(jsonb_build_array(
      'storefront:sportswear',
      case when product_text ~ '(polo|quarter.?zip|1/4.?zip|jacket|vest|full.?zip)' then 'storefront:business_apparel' end,
      case when product_text ~ '(quarter.?zip|1/4.?zip)' then 'storefront:quarter_zips' end,
      case when product_text ~ '(women|ladies)' then 'storefront:womens' else 'storefront:mens' end
    )),
    sizes, colors, variants, 'S&S Activewear', minimum_vendor_cost,
    part_number, 'Champion', style_name, refreshed_at,
    rule_key, now(),
    case when raw_description ~* '(cotton|polyester|nylon|spandex|fleece|fabric)'
      then trim(regexp_replace(regexp_replace(raw_description, '<[^>]+>', ' ', 'g'), '\s+', ' ', 'g')) end,
    case when raw_description ~* '(\d+(\.\d+)?\s*oz|\d+\s*gsm)'
      then substring(raw_description from '(\d+(\.\d+)?\s*oz[^<,;]*|\d+\s*gsm)') end,
    jsonb_build_array(vendor_category, 'Authenticated S&S catalog data'),
    'Private Champion S&S draft. Data, image, current stocked SKU variants, MAP handling, and guardrail pricing passed import checks. Pending private product-detail, isolated cart, and mobile QA before admin approval. Not published.'
  from eligible
  returning id
)
select count(*) from inserted;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.products
  where brand = 'Champion' and visibility = 'draft' and is_active is false
    and internal_notes like 'Private Champion S&S draft.%';
  if v_count <> 20 then
    raise exception 'Champion private import created % complete drafts; expected exactly 20', v_count;
  end if;
  if exists (
    select 1 from public.products
    where brand = 'Champion' and visibility = 'draft' and is_active is false
      and internal_notes like 'Private Champion S&S draft.%'
      and (image_url is null or price is null or price <= vendor_cost or stock <= 0
        or jsonb_array_length(coalesce(size_prices, '[]'::jsonb)) = 0
        or jsonb_array_length(coalesce(available_sizes, '[]'::jsonb)) = 0
        or jsonb_array_length(coalesce(available_colors, '[]'::jsonb)) = 0)
  ) then
    raise exception 'Champion draft completeness or margin guard failed';
  end if;
end $$;

commit;
