create or replace function public.get_ss_private_launch_qa(
  p_batch_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.ss_launch_batches%rowtype;
  v_item_count bigint;
  v_variant_count bigint;
  v_public_or_active_count bigint;
  v_storefront_exposed_count bigint;
  v_missing_image_count bigint;
  v_missing_brand_count bigint;
  v_missing_style_count bigint;
  v_invalid_price_count bigint;
  v_missing_colors_count bigint;
  v_missing_sizes_count bigint;
  v_missing_variants_count bigint;
  v_invalid_variant_count bigint;
  v_restricted_variant_count bigint;
  v_not_eligible_variant_count bigint;
  v_preview_ready_count bigint;
  v_cart_ready_count bigint;
  v_products jsonb;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  if p_batch_id is null then
    select b.*
    into v_batch
    from public.ss_launch_batches b
    order by b.created_date desc
    limit 1;
  else
    select b.*
    into v_batch
    from public.ss_launch_batches b
    where b.id = p_batch_id;
  end if;

  if not found then
    raise exception 'Private S&S launch batch not found'
      using errcode = 'P0002';
  end if;

  with batch_rows as (
    select
      i.id as item_id,
      i.product_id,
      i.brand,
      i.style_id,
      i.part_number,
      i.variant_count as expected_variant_count,
      i.reused_test_product,
      p.*
    from public.ss_launch_batch_items i
    left join public.products p on p.id = i.product_id
    where i.batch_id = v_batch.id
  ),
  variant_rows as (
    select
      r.product_id,
      variant.value as variant
    from batch_rows r
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(r.size_prices) = 'array' then r.size_prices
        else '[]'::jsonb
      end
    ) variant(value)
  )
  select
    (select count(*) from batch_rows),
    (select count(*) from variant_rows),
    (select count(*) from batch_rows
      where visibility is distinct from 'draft'
         or is_active is distinct from false),
    (select count(*)
      from public.storefront_products storefront
      join public.ss_launch_batch_items item
        on item.product_id = storefront.id
      where item.batch_id = v_batch.id),
    (select count(*) from batch_rows where nullif(image_url, '') is null),
    (select count(*) from batch_rows where nullif(brand, '') is null),
    (select count(*) from batch_rows where nullif(part_number, '') is null),
    (select count(*) from batch_rows where coalesce(price, 0) <= 0),
    (select count(*) from batch_rows
      where jsonb_array_length(
        case when jsonb_typeof(available_colors) = 'array' then available_colors else '[]'::jsonb end
      ) = 0),
    (select count(*) from batch_rows
      where jsonb_array_length(
        case when jsonb_typeof(available_sizes) = 'array' then available_sizes else '[]'::jsonb end
      ) = 0),
    (select count(*) from batch_rows
      where jsonb_array_length(
        case when jsonb_typeof(size_prices) = 'array' then size_prices else '[]'::jsonb end
      ) = 0),
    (select count(*) from variant_rows
      where nullif(variant ->> 'sku', '') is null
         or nullif(variant ->> 'size', '') is null
         or coalesce(nullif(variant ->> 'price', '')::numeric, 0) <= 0
         or coalesce(nullif(variant ->> 'inventory', '')::numeric, 0) <= 0),
    (select count(*)
      from variant_rows variants
      join public.ss_sku_approved_prices approved
        on approved.rule_version_id = v_batch.rule_version_id
       and approved.sku = variants.variant ->> 'sku'
       and approved.publish_eligible is false),
    (select count(*)
      from variant_rows variants
      where not exists (
        select 1
        from public.ss_sku_approved_prices approved
        where approved.rule_version_id = v_batch.rule_version_id
          and approved.sku = variants.variant ->> 'sku'
          and approved.publish_eligible is true
      )),
    (select count(*) from batch_rows
      where id is not null
        and visibility = 'draft'
        and is_active is false
        and is_sample is true
        and vendor_source = 'S&S Activewear'
        and nullif(image_url, '') is not null
        and coalesce(price, 0) > 0
        and nullif(brand, '') is not null
        and nullif(part_number, '') is not null
        and jsonb_array_length(
          case when jsonb_typeof(available_colors) = 'array' then available_colors else '[]'::jsonb end
        ) > 0
        and jsonb_array_length(
          case when jsonb_typeof(available_sizes) = 'array' then available_sizes else '[]'::jsonb end
        ) > 0
        and jsonb_array_length(
          case when jsonb_typeof(size_prices) = 'array' then size_prices else '[]'::jsonb end
        ) > 0),
    (select count(*) from batch_rows r
      where r.id is not null
        and r.visibility = 'draft'
        and r.is_active is false
        and exists (
          select 1
          from variant_rows variants
          where variants.product_id = r.product_id
            and nullif(variants.variant ->> 'sku', '') is not null
            and coalesce(nullif(variants.variant ->> 'price', '')::numeric, 0) > 0
            and coalesce(nullif(variants.variant ->> 'inventory', '')::numeric, 0) > 0
        ))
  into
    v_item_count,
    v_variant_count,
    v_public_or_active_count,
    v_storefront_exposed_count,
    v_missing_image_count,
    v_missing_brand_count,
    v_missing_style_count,
    v_invalid_price_count,
    v_missing_colors_count,
    v_missing_sizes_count,
    v_missing_variants_count,
    v_invalid_variant_count,
    v_restricted_variant_count,
    v_not_eligible_variant_count,
    v_preview_ready_count,
    v_cart_ready_count;

  with batch_rows as (
    select
      i.id as item_id,
      i.product_id,
      i.brand,
      i.style_id,
      i.part_number,
      i.variant_count as expected_variant_count,
      i.reused_test_product,
      p.*
    from public.ss_launch_batch_items i
    left join public.products p on p.id = i.product_id
    where i.batch_id = v_batch.id
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'item_id', r.item_id,
      'product_id', r.product_id,
      'name', r.name,
      'brand', r.brand,
      'style_number', r.part_number,
      'price', r.price,
      'image_url', r.image_url,
      'color_count', case
        when jsonb_typeof(r.available_colors) = 'array' then jsonb_array_length(r.available_colors)
        else 0
      end,
      'size_count', case
        when jsonb_typeof(r.available_sizes) = 'array' then jsonb_array_length(r.available_sizes)
        else 0
      end,
      'variant_count', case
        when jsonb_typeof(r.size_prices) = 'array' then jsonb_array_length(r.size_prices)
        else 0
      end,
      'private_pass', r.visibility = 'draft' and r.is_active is false,
      'image_pass', nullif(r.image_url, '') is not null,
      'data_pass',
        nullif(r.brand, '') is not null
        and nullif(r.part_number, '') is not null
        and coalesce(r.price, 0) > 0
        and jsonb_array_length(
          case when jsonb_typeof(r.available_colors) = 'array' then r.available_colors else '[]'::jsonb end
        ) > 0
        and jsonb_array_length(
          case when jsonb_typeof(r.available_sizes) = 'array' then r.available_sizes else '[]'::jsonb end
        ) > 0
        and jsonb_array_length(
          case when jsonb_typeof(r.size_prices) = 'array' then r.size_prices else '[]'::jsonb end
        ) > 0,
      'preview_pass',
        r.id is not null
        and r.visibility = 'draft'
        and r.is_active is false
        and r.is_sample is true,
      'cart_test_pass',
        r.visibility = 'draft'
        and r.is_active is false
        and exists (
          select 1
          from jsonb_array_elements(
            case
              when jsonb_typeof(r.size_prices) = 'array' then r.size_prices
              else '[]'::jsonb
            end
          ) variant(value)
          where nullif(variant.value ->> 'sku', '') is not null
            and coalesce(nullif(variant.value ->> 'price', '')::numeric, 0) > 0
            and coalesce(nullif(variant.value ->> 'inventory', '')::numeric, 0) > 0
        ),
      'restricted_sku_count', (
        select count(*)
        from jsonb_array_elements(
          case
            when jsonb_typeof(r.size_prices) = 'array' then r.size_prices
            else '[]'::jsonb
          end
        ) variant(value)
        join public.ss_sku_approved_prices approved
          on approved.rule_version_id = v_batch.rule_version_id
         and approved.sku = variant.value ->> 'sku'
         and approved.publish_eligible is false
      ),
      'public_shop_exposed', exists (
        select 1
        from public.storefront_products storefront
        where storefront.id = r.product_id
      ),
      'preview_url', '/ProductDetail?id=' || r.product_id || '&preview=draft'
    )
    order by r.brand, r.part_number, r.product_id
  ), '[]'::jsonb)
  into v_products
  from batch_rows r;

  return jsonb_build_object(
    'generated_at', now(),
    'batch', jsonb_build_object(
      'id', v_batch.id,
      'label', v_batch.batch_label,
      'status', v_batch.status,
      'expected_product_count', v_batch.product_count,
      'expected_variant_count', v_batch.variant_count,
      'rule_version_id', v_batch.rule_version_id
    ),
    'summary', jsonb_build_object(
      'product_count', v_item_count,
      'variant_count', v_variant_count,
      'public_or_active_count', v_public_or_active_count,
      'storefront_exposed_count', v_storefront_exposed_count,
      'missing_image_count', v_missing_image_count,
      'missing_brand_count', v_missing_brand_count,
      'missing_style_count', v_missing_style_count,
      'invalid_price_count', v_invalid_price_count,
      'missing_colors_count', v_missing_colors_count,
      'missing_sizes_count', v_missing_sizes_count,
      'missing_variants_count', v_missing_variants_count,
      'invalid_variant_count', v_invalid_variant_count,
      'restricted_variant_count', v_restricted_variant_count,
      'not_publish_eligible_variant_count', v_not_eligible_variant_count,
      'preview_ready_count', v_preview_ready_count,
      'cart_test_ready_count', v_cart_ready_count
    ),
    'checklist', jsonb_build_array(
      jsonb_build_object(
        'id', 'private_state',
        'label', 'No batch products are public or active',
        'passed', v_public_or_active_count = 0,
        'detail', v_item_count || ' products checked; ' || v_public_or_active_count || ' public or active.'
      ),
      jsonb_build_object(
        'id', 'images',
        'label', 'Every product has at least one image',
        'passed', v_missing_image_count = 0,
        'detail', (v_item_count - v_missing_image_count) || ' of ' || v_item_count || ' products have an image.'
      ),
      jsonb_build_object(
        'id', 'catalog_data',
        'label', 'Brand, style, price, colors, sizes, and SKU variants are complete',
        'passed',
          v_missing_brand_count = 0
          and v_missing_style_count = 0
          and v_invalid_price_count = 0
          and v_missing_colors_count = 0
          and v_missing_sizes_count = 0
          and v_missing_variants_count = 0
          and v_invalid_variant_count = 0,
        'detail', v_variant_count || ' SKU variants checked; ' || v_invalid_variant_count || ' invalid variant records.'
      ),
      jsonb_build_object(
        'id', 'restricted_skus',
        'label', 'Restricted SKUs remain excluded',
        'passed', v_restricted_variant_count = 0 and v_not_eligible_variant_count = 0,
        'detail', v_restricted_variant_count || ' restricted and ' || v_not_eligible_variant_count || ' non-eligible variants found.'
      ),
      jsonb_build_object(
        'id', 'private_preview',
        'label', 'Private product preview is ready for every item',
        'passed', v_preview_ready_count = v_item_count and v_item_count > 0,
        'detail', v_preview_ready_count || ' of ' || v_item_count || ' products are available through the admin-only preview path.'
      ),
      jsonb_build_object(
        'id', 'quote_cart_test',
        'label', 'Private quote/cart QA mode is ready without public exposure',
        'passed',
          v_cart_ready_count = v_item_count
          and v_item_count > 0
          and v_storefront_exposed_count = 0,
        'detail', v_cart_ready_count || ' of ' || v_item_count || ' products have an in-stock, priced SKU for private cart testing.'
      ),
      jsonb_build_object(
        'id', 'public_shop',
        'label', 'Public Shop Garments catalog is unchanged by this batch',
        'passed', v_storefront_exposed_count = 0,
        'detail', v_storefront_exposed_count || ' batch products appear in the public storefront view.'
      )
    ),
    'all_passed',
      v_item_count = v_batch.product_count
      and v_item_count > 0
      and v_public_or_active_count = 0
      and v_storefront_exposed_count = 0
      and v_missing_image_count = 0
      and v_missing_brand_count = 0
      and v_missing_style_count = 0
      and v_invalid_price_count = 0
      and v_missing_colors_count = 0
      and v_missing_sizes_count = 0
      and v_missing_variants_count = 0
      and v_invalid_variant_count = 0
      and v_restricted_variant_count = 0
      and v_not_eligible_variant_count = 0
      and v_preview_ready_count = v_item_count
      and v_cart_ready_count = v_item_count,
    'products', v_products
  );
end;
$$;

revoke all on function public.get_ss_private_launch_qa(text)
from public, anon;
grant execute
on function public.get_ss_private_launch_qa(text)
to authenticated;
