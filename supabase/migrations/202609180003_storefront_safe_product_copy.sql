-- Keep launch/approval notes in products for admins, but never return them
-- through the customer-facing storefront view. No product status or price changes.
create or replace view public.storefront_products
with (security_barrier = true) as
select
  product.id,
  product.name,
  case when product.description ~* '(^|[^[:alnum:]_])(private|internal|qa|test)([^[:alnum:]_]|$)|(launch|catalog)[-[:space:]]?batch|not[[:space:]]+approved'
    then null else product.description end as description,
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
  case when jsonb_typeof(product.tags) = 'array' then (
    select coalesce(jsonb_agg(tag.value order by tag.ordinality), '[]'::jsonb)
    from jsonb_array_elements_text(product.tags) with ordinality as tag(value, ordinality)
    where tag.value !~* '(^|[^[:alnum:]_])(private|internal|qa|test)([^[:alnum:]_]|$)|(launch|catalog)[-[:space:]]?batch|not[[:space:]]+approved'
  ) else product.tags end as tags,
  product.is_featured,
  product.is_best_seller,
  product.available_sizes,
  product.available_colors,
  case when jsonb_typeof(product.size_prices) = 'array' then (
    select coalesce(
      jsonb_agg(
        variant.value - 'vendor_cost' - 'customer_price' - 'piece_price' - 'dozen_price' - 'case_price'
        order by variant.ordinality
      ),
      '[]'::jsonb
    )
    from jsonb_array_elements(product.size_prices) with ordinality as variant(value, ordinality)
  ) else '[]'::jsonb end as size_prices,
  case when product.care_instructions ~* '(^|[^[:alnum:]_])(private|internal|qa|test)([^[:alnum:]_]|$)|(launch|catalog)[-[:space:]]?batch|not[[:space:]]+approved'
    then null else product.care_instructions end as care_instructions,
  case when product.shipping_note ~* '(^|[^[:alnum:]_])(private|internal|qa|test)([^[:alnum:]_]|$)|(launch|catalog)[-[:space:]]?batch|not[[:space:]]+approved'
    then null else product.shipping_note end as shipping_note,
  product.is_active,
  product.created_date,
  product.updated_date,
  product.storefront_premium as is_premium,
  product.brand,
  product.style_number,
  case when product.fabric_material ~* '(^|[^[:alnum:]_])(private|internal|qa|test)([^[:alnum:]_]|$)|(launch|catalog)[-[:space:]]?batch|not[[:space:]]+approved'
    then null else product.fabric_material end as fabric_material,
  case when product.garment_weight ~* '(^|[^[:alnum:]_])(private|internal|qa|test)([^[:alnum:]_]|$)|(launch|catalog)[-[:space:]]?batch|not[[:space:]]+approved'
    then null else product.garment_weight end as garment_weight,
  case when product.fit ~* '(^|[^[:alnum:]_])(private|internal|qa|test)([^[:alnum:]_]|$)|(launch|catalog)[-[:space:]]?batch|not[[:space:]]+approved'
    then null else product.fit end as fit,
  case when product.features::text ~* '(^|[^[:alnum:]_])(private|internal|qa|test)([^[:alnum:]_]|$)|(launch|catalog)[-[:space:]]?batch|not[[:space:]]+approved'
    then '[]'::jsonb else product.features end as features,
  case when product.vendor_specs::text ~* '(^|[^[:alnum:]_])(private|internal|qa|test)([^[:alnum:]_]|$)|(launch|catalog)[-[:space:]]?batch|not[[:space:]]+approved'
    then '{}'::jsonb else product.vendor_specs end as vendor_specs,
  product.vendor_data_refreshed_at
from public.products product
where product.visibility = 'public'
  and product.is_active is true
  and product.product_type = 'physical'
  and nullif(btrim(product.image_url), '') is not null
  and (
    product.storefront_image_approved is true
    or lower(product.image_url) !~ '(placeholder|no[-_ ]?image|image[-_ ]?unavailable|coming[-_ ]?soon)'
  );

revoke all on public.storefront_products from public;
grant select on public.storefront_products to anon, authenticated;
