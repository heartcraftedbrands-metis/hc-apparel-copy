begin;

-- Publish only the explicitly approved Berne CH416. The bulk Berne importer is
-- intentionally capped at 20 live products, so this one-product migration
-- repeats its authenticated-catalog QA checks without widening that cap.
do $$
declare
  v_session text;
  v_product_id text;
  v_part_number text;
  v_title text;
  v_base_category text;
  v_style_image text;
  v_name text;
  v_variant_count integer;
  v_color_count integer;
  v_size_count integer;
  v_common_size_count integer;
  v_inventory numeric;
  v_latest_refresh timestamptz;
  v_primary_image text;
  v_vendor_cost numeric;
  v_public_price numeric;
  v_unit_weight numeric;
  v_sizes jsonb;
  v_colors jsonb;
  v_variants jsonb;
  v_exclude_free_freight boolean;
  v_live_before integer;
  v_live_after integer;
begin
  select count(*) into v_live_before
  from public.products
  where lower(brand) = 'berne' and visibility = 'public' and is_active;

  if exists (
    select 1 from public.products
    where lower(brand) = 'berne'
      and (upper(coalesce(style_number, '')) = 'CH416'
        or upper(coalesce(supplier_sku, '')) = 'CH416')
  ) then
    raise exception 'Berne CH416 already exists; publication stopped to prevent a duplicate.';
  end if;

  select import_session_id into v_session
  from public.ss_import_staging
  where lower(brand) = 'berne'
    and row_status = 'pending'
    and import_session_id like 'ss-brand-berne-%'
  order by created_date desc
  limit 1;

  if v_session is null then
    raise exception 'No current authenticated Berne S&S staging session was found.';
  end if;

  select
    coalesce(nullif(raw_row_data::jsonb ->> 'partNumber', ''), nullif(style_number, ''), 'CH416'),
    coalesce(nullif(raw_row_data::jsonb ->> 'title', ''), nullif(product_name, ''), 'Men''s Heritage Chore Coat'),
    coalesce(nullif(raw_row_data::jsonb ->> 'baseCategory', ''), nullif(product_category, ''), 'Outerwear'),
    coalesce(nullif(image_url, ''), nullif(raw_row_data::jsonb ->> 'styleImage', ''))
  into v_part_number, v_title, v_base_category, v_style_image
  from public.ss_import_staging
  where import_session_id = v_session
    and lower(brand) = 'berne'
    and (
      upper(coalesce(raw_row_data::jsonb ->> 'styleName', '')) = 'CH416'
      or upper(coalesce(style_number, '')) = 'CH416'
    )
  order by created_date desc
  limit 1;

  if v_part_number is null then
    raise exception 'Berne CH416 was not found in the latest authenticated S&S staging session.';
  end if;

  select
    count(*) filter (
      where inventory_qty > 0
        and coalesce(nullif(customer_price, 0), nullif(piece_price, 0)) > 0
    ),
    count(distinct nullif(color_name, '')) filter (where inventory_qty > 0),
    count(distinct nullif(size_name, '')) filter (where inventory_qty > 0),
    count(distinct case
      when upper(regexp_replace(coalesce(size_name, ''), '[^A-Za-z0-9]', '', 'g')) in ('S','M','L','XL','2XL','XXL','2X')
        then case
          when upper(regexp_replace(coalesce(size_name, ''), '[^A-Za-z0-9]', '', 'g')) in ('XXL','2X') then '2XL'
          else upper(regexp_replace(coalesce(size_name, ''), '[^A-Za-z0-9]', '', 'g'))
        end
      else null
    end) filter (where inventory_qty > 0),
    coalesce(sum(greatest(inventory_qty, 0)) filter (where inventory_qty > 0), 0),
    max(fetched_at),
    coalesce(
      (array_agg(nullif(color_on_model_front_image, '') order by size_order, sku)
        filter (where inventory_qty > 0 and nullif(color_on_model_front_image, '') is not null))[1],
      (array_agg(nullif(color_front_image, '') order by size_order, sku)
        filter (where inventory_qty > 0 and nullif(color_front_image, '') is not null))[1],
      v_style_image
    ),
    min(coalesce(nullif(customer_price, 0), nullif(piece_price, 0))) filter (where inventory_qty > 0),
    max(coalesce(unit_weight, 0)) filter (where inventory_qty > 0),
    case
      when bool_or(lower(coalesce(raw_product ->> 'excludeFreeFreight', raw_product ->> 'ExcludeFreeFreight', '')) = 'true')
        then true
      when bool_and(lower(coalesce(raw_product ->> 'excludeFreeFreight', raw_product ->> 'ExcludeFreeFreight', '')) = 'false')
        then false
      else null
    end
  into v_variant_count, v_color_count, v_size_count, v_common_size_count,
    v_inventory, v_latest_refresh, v_primary_image, v_vendor_cost,
    v_unit_weight, v_exclude_free_freight
  from public.ss_sku_staging
  where style_session_id = v_session
    and lower(brand) = 'berne'
    and lower(coalesce(part_number, '')) = lower(v_part_number);

  if v_variant_count = 0 then
    raise exception 'Berne CH416 has no current stocked and priced S&S SKU variants.';
  end if;
  if v_inventory < 25 then
    raise exception 'Berne CH416 has insufficient current inventory: % units.', v_inventory;
  end if;
  if v_color_count < 1 or v_size_count < 1 or v_common_size_count < 3 then
    raise exception 'Berne CH416 failed color/size QA: % colors, % sizes, % common sizes.',
      v_color_count, v_size_count, v_common_size_count;
  end if;
  if v_latest_refresh < now() - interval '24 hours' then
    raise exception 'Berne CH416 S&S price or inventory data is stale (%).', v_latest_refresh;
  end if;
  if nullif(v_primary_image, '') is null then
    raise exception 'Berne CH416 has no usable authenticated S&S product image.';
  end if;
  if not exists (
    select 1 from public.storefront_pricing_rules
    where rule_key = 'premium_specialty' and is_active
  ) then
    raise exception 'The active premium_specialty pricing rule required for Berne CH416 is missing.';
  end if;

  v_name := case
    when v_title ~* '^berne\y' then v_title
    else 'Berne ' || v_title
  end;
  v_product_id := gen_random_uuid()::text;

  insert into public.products (
    id, name, description, price, product_type, visibility, is_active,
    image_url, stock, category, categories, tags, primary_garment_type,
    secondary_tags, vendor_source, vendor_cost, supplier_sku, brand,
    style_number, vendor_data_refreshed_at, storefront_pricing_rule_key,
    storefront_price_applied_at, garment_weight, ss_exclude_free_freight,
    features, draft_qa_status, draft_qa_reviewed_at, internal_notes
  ) values (
    v_product_id,
    v_name,
    v_name || ' workwear outerwear for cooler-weather layering, teams, businesses, and everyday use.',
    0,
    'physical',
    'draft',
    false,
    v_primary_image,
    v_inventory,
    'mens_jackets',
    jsonb_build_array(v_base_category, 'outerwear'),
    '["storefront:mens","storefront:business_apparel","storefront:winter_cold_weather","storefront:workwear"]'::jsonb,
    'outerwear',
    '["mens","business_apparel","winter_cold_weather","workwear"]'::jsonb,
    'S&S Activewear',
    v_vendor_cost,
    v_part_number,
    'Berne',
    'CH416',
    v_latest_refresh,
    'premium_specialty',
    now(),
    case when v_unit_weight > 0 then v_unit_weight::text || ' lb' else null end,
    v_exclude_free_freight,
    jsonb_build_array(v_base_category, 'Authenticated S&S catalog data', 'Fall / Winter'),
    'approved',
    now(),
    format(
      'Published with explicit Super Admin approval after authenticated S&S image, inventory, SKU, size/color, HC Apparel margin, and payment-method fee checks. S&S MAP and MSRP are reference-only and were not used for pricing. %s current units across %s colors, %s sizes, and %s stocked SKU variants. No S&S order was submitted.',
      v_inventory, v_color_count, v_size_count, v_variant_count
    )
  );

  select
    coalesce(jsonb_agg(to_jsonb(s.size_name) order by s.minimum_order, s.size_name), '[]'::jsonb)
  into v_sizes
  from (
    select size_name, min(coalesce(nullif(size_order, ''), 'ZZZZ')) minimum_order
    from public.ss_sku_staging
    where style_session_id = v_session and lower(brand) = 'berne'
      and lower(coalesce(part_number, '')) = lower(v_part_number)
      and inventory_qty > 0 and nullif(size_name, '') is not null
    group by size_name
  ) s;

  select coalesce(jsonb_agg(jsonb_build_object(
    'name', c.color_name,
    'color_code', c.color_code,
    'swatch_image', c.color_swatch_image
  ) order by c.color_name), '[]'::jsonb)
  into v_colors
  from (
    select distinct on (color_name) color_name, color_code, color_swatch_image
    from public.ss_sku_staging
    where style_session_id = v_session and lower(brand) = 'berne'
      and lower(coalesce(part_number, '')) = lower(v_part_number)
      and inventory_qty > 0 and nullif(color_name, '') is not null
    order by color_name, sku
  ) c;

  select coalesce(jsonb_agg(jsonb_build_object(
    'sku', s.sku,
    'size', s.size_name,
    'color', s.color_name,
    'price', public.product_variant_safe_price(p, s.vendor_cost),
    'vendor_cost', s.vendor_cost,
    'inventory', s.inventory_qty,
    'color_name', s.color_name,
    'color_code', s.color_code,
    'image_url', coalesce(nullif(s.color_on_model_front_image, ''), nullif(s.color_front_image, ''), v_primary_image),
    'color_swatch_image', s.color_swatch_image,
    'unit_weight', s.unit_weight
  ) order by s.color_name, s.minimum_order, s.size_name, s.sku), '[]'::jsonb),
  min(public.product_variant_safe_price(p, s.vendor_cost))
  into v_variants, v_public_price
  from public.products p
  cross join (
    select sku, size_name, color_name, color_code, color_swatch_image,
      color_front_image, color_on_model_front_image, unit_weight, inventory_qty,
      coalesce(nullif(customer_price, 0), nullif(piece_price, 0)) vendor_cost,
      coalesce(nullif(size_order, ''), 'ZZZZ') minimum_order
    from public.ss_sku_staging
    where style_session_id = v_session and lower(brand) = 'berne'
      and lower(coalesce(part_number, '')) = lower(v_part_number)
      and inventory_qty > 0
      and coalesce(nullif(customer_price, 0), nullif(piece_price, 0)) > 0
  ) s
  where p.id = v_product_id;

  if v_public_price is null or v_public_price <= v_vendor_cost then
    raise exception 'Berne CH416 failed the HC Apparel price and margin guardrail.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_variants) variant
    where coalesce((variant ->> 'price')::numeric, 0)
      <= coalesce((variant ->> 'vendor_cost')::numeric, 0)
  ) then
    raise exception 'At least one Berne CH416 SKU failed the HC Apparel variant price guardrail.';
  end if;

  update public.products
  set price = v_public_price,
      available_sizes = v_sizes,
      available_colors = v_colors,
      size_prices = v_variants,
      visibility = 'public',
      is_active = true,
      draft_qa_status = 'approved',
      draft_qa_reviewed_at = now(),
      storefront_price_applied_at = now()
  where id = v_product_id;

  select count(*) into v_live_after
  from public.products
  where lower(brand) = 'berne' and visibility = 'public' and is_active;

  if v_live_after <> v_live_before + 1 then
    raise exception 'Berne public count verification failed: expected %, found %.', v_live_before + 1, v_live_after;
  end if;
  if (select count(*) from public.products
      where lower(brand) = 'berne' and style_number = 'CH416'
        and visibility = 'public' and is_active) <> 1 then
    raise exception 'Berne CH416 publication verification failed.';
  end if;
  if exists (
    select 1 from public.products
    where id = v_product_id and (
      price <= vendor_cost or stock <= 0 or nullif(image_url, '') is null
      or jsonb_array_length(coalesce(available_sizes, '[]'::jsonb)) = 0
      or jsonb_array_length(coalesce(available_colors, '[]'::jsonb)) = 0
      or jsonb_array_length(coalesce(size_prices, '[]'::jsonb)) = 0
    )
  ) then
    raise exception 'Berne CH416 post-publication catalog QA failed.';
  end if;
end;
$$;

commit;
