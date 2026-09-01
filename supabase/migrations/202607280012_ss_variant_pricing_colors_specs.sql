begin;

-- Public blank pricing is driven by the actual S&S SKU customer price. The
-- storefront buffer is deliberately fixed and is stored with each variant so
-- color/size selections can never inherit an unrelated style-level price.
alter table public.products
  add column if not exists brand text,
  add column if not exists style_number text,
  add column if not exists fabric_material text,
  add column if not exists garment_weight text,
  add column if not exists fit text,
  add column if not exists features jsonb not null default '[]'::jsonb,
  add column if not exists vendor_specs jsonb not null default '[]'::jsonb,
  add column if not exists vendor_data_refreshed_at timestamptz;

create temporary table hc_latest_ss_variants on commit drop as
select distinct on (
  lower(btrim(staged.brand)),
  upper(btrim(staged.part_number)),
  staged.sku
)
  staged.brand,
  staged.style_id,
  staged.part_number,
  staged.style_name,
  staged.sku,
  staged.color_name,
  staged.color_code,
  staged.color_swatch_image,
  staged.color_1,
  staged.color_2,
  staged.size_name,
  staged.customer_price,
  staged.inventory_qty,
  staged.noe_retailing,
  staged.unit_weight,
  staged.color_on_model_front_image,
  staged.color_front_image,
  staged.raw_product,
  staged.fetched_at
from public.ss_sku_staging staged
where nullif(btrim(staged.part_number), '') is not null
  and nullif(btrim(staged.sku), '') is not null
  and nullif(btrim(staged.color_name), '') is not null
  and lower(btrim(staged.color_name)) not in ('?', 'unknown', 'color unavailable')
  and nullif(btrim(staged.size_name), '') is not null
  and staged.customer_price is not null
  and staged.customer_price > 0
  and staged.noe_retailing is false
order by
  lower(btrim(staged.brand)),
  upper(btrim(staged.part_number)),
  staged.sku,
  staged.fetched_at desc;

create temporary table hc_ss_product_variant_summary on commit drop as
select
  product.id as product_id,
  min(variant.customer_price) filter (where variant.inventory_qty > 0) as minimum_in_stock_cost,
  min(variant.customer_price) as minimum_cost,
  max(variant.brand) as brand,
  max(variant.style_id) as style_id,
  max(variant.style_name) as style_name,
  max(variant.part_number) as part_number,
  sum(greatest(variant.inventory_qty, 0))::integer as total_inventory,
  jsonb_agg(
    jsonb_strip_nulls(jsonb_build_object(
      'size', variant.color_name || ' / ' || variant.size_name,
      'color_name', variant.color_name,
      'color_code', variant.color_code,
      'color_hex', case
        when btrim(coalesce(variant.color_1, '')) ~* '^#?[0-9a-f]{6}$'
          then '#' || upper(ltrim(btrim(variant.color_1), '#'))
        else null
      end,
      'color_secondary_hex', case
        when btrim(coalesce(variant.color_2, '')) ~* '^#?[0-9a-f]{6}$'
          then '#' || upper(ltrim(btrim(variant.color_2), '#'))
        else null
      end,
      'color_swatch_image', variant.color_swatch_image,
      'pms_color', coalesce(
        nullif(variant.raw_product ->> 'pmsColor', ''),
        nullif(variant.raw_product ->> 'PmsColor', '')
      ),
      'sku', variant.sku,
      'inventory', greatest(variant.inventory_qty, 0),
      'vendor_cost', round(variant.customer_price, 2),
      'price', round(variant.customer_price + 3.00, 2),
      'image_url', coalesce(
        nullif(variant.color_on_model_front_image, ''),
        nullif(variant.color_front_image, '')
      )
    ))
    order by
      variant.color_name,
      nullif(variant.raw_product ->> 'sizeOrder', ''),
      variant.size_name,
      variant.sku
  ) as variants,
  (
    select coalesce(jsonb_agg(color_row.color_data order by color_row.color_name), '[]'::jsonb)
    from (
      select distinct on (lower(btrim(color_variant.color_name)))
        color_variant.color_name,
        jsonb_strip_nulls(jsonb_build_object(
          'name', color_variant.color_name,
          'hex', case
            when btrim(coalesce(color_variant.color_1, '')) ~* '^#?[0-9a-f]{6}$'
              then '#' || upper(ltrim(btrim(color_variant.color_1), '#'))
            else null
          end,
          'secondary_hex', case
            when btrim(coalesce(color_variant.color_2, '')) ~* '^#?[0-9a-f]{6}$'
              then '#' || upper(ltrim(btrim(color_variant.color_2), '#'))
            else null
          end,
          'color_code', color_variant.color_code,
          'pms_color', coalesce(
            nullif(color_variant.raw_product ->> 'pmsColor', ''),
            nullif(color_variant.raw_product ->> 'PmsColor', '')
          ),
          'swatch_image', color_variant.color_swatch_image
        )) as color_data
      from hc_latest_ss_variants color_variant
      where upper(btrim(color_variant.part_number)) = upper(btrim(product.supplier_sku))
      order by
        lower(btrim(color_variant.color_name)),
        color_variant.fetched_at desc
    ) color_row
  ) as colors,
  (
    select coalesce(jsonb_agg(size_row.size_name order by size_row.size_order, size_row.size_name), '[]'::jsonb)
    from (
      select distinct
        size_variant.size_name,
        case
          when coalesce(size_variant.raw_product ->> 'sizeOrder', '') ~ '^\d+$'
            then (size_variant.raw_product ->> 'sizeOrder')::integer
          else 9999
        end as size_order
      from hc_latest_ss_variants size_variant
      where upper(btrim(size_variant.part_number)) = upper(btrim(product.supplier_sku))
    ) size_row
  ) as sizes
from public.products product
join hc_latest_ss_variants variant
  on upper(btrim(variant.part_number)) = upper(btrim(product.supplier_sku))
where product.product_type = 'physical'
  and lower(coalesce(product.vendor_source, '')) like 's&s activewear%'
group by product.id;

create temporary table hc_ss_style_details on commit drop as
select
  lower(btrim(item.brand)) as normalized_brand,
  upper(btrim(item.style_number)) as normalized_style,
  max(nullif(btrim(item.description), '')) as description,
  max(nullif(btrim(item.fabric_details), '')) as fabric_details,
  max(nullif(btrim(item.material), '')) as material,
  max(nullif(btrim(item.weight), '')) as weight,
  max(nullif(btrim(item.fit), '')) as fit,
  max(nullif(btrim(item.measurements), '')) as measurements,
  max(nullif(btrim(item.care_notes), '')) as care_notes
from public.ss_catalog_items item
where nullif(btrim(item.style_number), '') is not null
group by lower(btrim(item.brand)), upper(btrim(item.style_number));

update public.products product
set
  brand = summary.brand,
  style_number = summary.part_number,
  price = round(coalesce(summary.minimum_in_stock_cost, summary.minimum_cost) + 3.00, 2),
  sale_price = null,
  vendor_cost = round(coalesce(summary.minimum_in_stock_cost, summary.minimum_cost), 2),
  blank_garment_cost = round(coalesce(summary.minimum_in_stock_cost, summary.minimum_cost), 2),
  profit_estimate = 3.00,
  available_colors = summary.colors,
  available_sizes = summary.sizes,
  size_prices = summary.variants,
  storefront_pricing_tier = case
    when product.storefront_premium then 'Premium S&S variant + $3'
    else 'S&S variant + $3'
  end,
  storefront_pricing_rule_key = case
    when product.storefront_premium then 'ss_premium_variant_plus_3'
    else 'ss_variant_plus_3'
  end,
  storefront_price_buffer = 3.00,
  storefront_price_before_buffer = round(
    coalesce(summary.minimum_in_stock_cost, summary.minimum_cost),
    2
  ),
  storefront_price_applied_at = now(),
  vendor_data_refreshed_at = now(),
  updated_date = now()
from hc_ss_product_variant_summary summary
where product.id = summary.product_id;

update public.products product
set
  description = coalesce(detail.description, product.description),
  fabric_material = nullif(
    concat_ws(
      ' · ',
      nullif(detail.fabric_details, ''),
      nullif(detail.material, '')
    ),
    ''
  ),
  garment_weight = detail.weight,
  fit = detail.fit,
  vendor_specs = jsonb_strip_nulls(jsonb_build_object(
    'measurements', detail.measurements,
    'fabric_details', detail.fabric_details,
    'material', detail.material,
    'weight', detail.weight,
    'fit', detail.fit,
    'care_notes', detail.care_notes
  )),
  features = case
    when nullif(btrim(detail.description), '') is null then product.features
    else (
      select coalesce(jsonb_agg(line), '[]'::jsonb)
      from (
        select distinct btrim(value) as line
        from regexp_split_to_table(
          regexp_replace(detail.description, '<[^>]+>', E'\n', 'g'),
          E'[\\r\\n;•]+'
        ) value
        where length(btrim(value)) >= 3
      ) imported_features
    )
  end,
  care_instructions = coalesce(detail.care_notes, product.care_instructions),
  vendor_data_refreshed_at = now(),
  updated_date = now()
from hc_ss_style_details detail
where upper(btrim(product.supplier_sku)) = detail.normalized_style
  and (
    lower(btrim(coalesce(product.brand, ''))) = detail.normalized_brand
    or lower(btrim(product.name)) like detail.normalized_brand || '%'
  );

-- A public S&S product without any usable, nonrestricted SKU data cannot be
-- sold accurately. Keep the record for admin review; never delete it.
update public.products product
set
  visibility = 'hidden',
  is_active = false,
  internal_notes = concat_ws(
    E'\n',
    nullif(btrim(product.internal_notes), ''),
    'Hidden from public shop: no complete nonrestricted S&S color/size/SKU price data is available.'
  ),
  updated_date = now()
where product.product_type = 'physical'
  and lower(coalesce(product.vendor_source, '')) like 's&s activewear%'
  and product.visibility = 'public'
  and product.is_active is true
  and not exists (
    select 1
    from hc_ss_product_variant_summary summary
    where summary.product_id = product.id
  );

-- Public callers receive the calculated public variant price and customer-safe
-- catalog data only. S&S customer/vendor cost keys remain admin-only.
create or replace view public.storefront_products
with (security_barrier = true) as
select
  product.id,
  product.name,
  product.description,
  product.price,
  product.sale_price,
  product.product_type,
  product.product_subtype,
  product.design_type,
  product.visibility,
  product.image_url,
  product.mockup_images,
  product.stock,
  product.category,
  product.categories,
  product.tags,
  product.is_featured,
  product.is_best_seller,
  product.available_sizes,
  product.available_colors,
  case
    when jsonb_typeof(product.size_prices) = 'array' then (
      select coalesce(
        jsonb_agg(
          variant.value
            - 'vendor_cost'
            - 'customer_price'
            - 'piece_price'
            - 'dozen_price'
            - 'case_price'
          order by variant.ordinality
        ),
        '[]'::jsonb
      )
      from jsonb_array_elements(product.size_prices)
        with ordinality as variant(value, ordinality)
    )
    else '[]'::jsonb
  end as size_prices,
  product.care_instructions,
  product.shipping_note,
  product.is_active,
  product.created_date,
  product.updated_date,
  product.storefront_premium as is_premium,
  product.brand,
  product.style_number,
  product.fabric_material,
  product.garment_weight,
  product.fit,
  product.features,
  product.vendor_specs,
  product.vendor_data_refreshed_at
from public.products product
where product.visibility = 'public'
  and product.is_active is true
  and product.product_type = 'physical'
  and nullif(btrim(product.image_url), '') is not null
  and (
    product.storefront_image_approved is true
    or lower(product.image_url) !~
      '(placeholder|no[-_ ]?image|image[-_ ]?unavailable|coming[-_ ]?soon)'
  );

revoke all on public.storefront_products from public;
grant select on public.storefront_products to anon, authenticated;

-- Restore trusted SKU-level pricing in checkout. The RPC still ignores any
-- client-submitted price and reselects the stored color/size variant.
do $$
declare
  v_definition text;
  v_original text;
begin
  v_definition := pg_get_functiondef(
    'public.create_small_order_checkout(jsonb)'::regprocedure
  );
  v_original := v_definition;

  v_definition := replace(
    v_definition,
    'v_price := coalesce(v_product.sale_price, v_product.price);',
    $replacement$v_price := case
      when coalesce(v_variant ->> 'price', '') ~ '^\d+(\.\d+)?$'
        then (v_variant ->> 'price')::numeric
      else coalesce(v_product.sale_price, v_product.price)
    end;$replacement$
  );

  if v_definition = v_original then
    raise exception 'Selected-variant checkout price patch did not match the installed function';
  end if;
  if v_definition not like '%then (v_variant ->> ''price'')::numeric%' then
    raise exception 'Selected-variant checkout price patch is incomplete';
  end if;

  execute v_definition;
end;
$$;

do $$
begin
  if exists (
    select 1
    from public.products product
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(product.size_prices) = 'array'
        then product.size_prices else '[]'::jsonb end
    ) variant
    where lower(coalesce(product.vendor_source, '')) like 's&s activewear%'
      and coalesce(variant ->> 'vendor_cost', '') ~ '^\d+(\.\d+)?$'
      and coalesce(variant ->> 'price', '') ~ '^\d+(\.\d+)?$'
      and round((variant ->> 'price')::numeric - (variant ->> 'vendor_cost')::numeric, 2) <> 3.00
  ) then
    raise exception 'An S&S variant does not have the required $3.00 storefront buffer';
  end if;

  if exists (
    select 1
    from public.vendor_order_drafts
    where live_submission_enabled is true
  ) then
    raise exception 'Live S&S submission must remain disabled';
  end if;

  if exists (
    select 1
    from public.ss_catalog_workflow_status
    where id is true
      and (product_loading_paused is not true or max_batch_sequence <> 3)
  ) then
    raise exception 'Product loading pause or no-Batch-4 invariant failed';
  end if;
end;
$$;

commit;
