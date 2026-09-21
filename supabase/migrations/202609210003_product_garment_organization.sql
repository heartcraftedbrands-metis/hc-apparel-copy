begin;

-- Store HC Apparel's customer-facing organization separately from imported
-- vendor categories. Raw S&S category/tags data remains untouched.
alter table public.products
  add column if not exists primary_garment_type text,
  add column if not exists secondary_tags jsonb not null default '[]'::jsonb;

alter table public.products drop constraint if exists products_primary_garment_type_check;
alter table public.products add constraint products_primary_garment_type_check check (
  primary_garment_type is null or primary_garment_type in (
    't_shirts', 'long_sleeve', 'hoodies', 'crewnecks', 'polos', 'quarter_zips',
    'outerwear', 'pants', 'shorts', 'hats', 'tank_tops', 'bags', 'other'
  )
);

alter table public.products drop constraint if exists products_secondary_tags_array_check;
alter table public.products add constraint products_secondary_tags_array_check check (
  jsonb_typeof(secondary_tags) = 'array'
);

with source as (
  select
    product.id,
    lower(concat_ws(' ', product.name, product.description, product.style_number,
      product.category, product.categories::text, product.tags::text, product.vendor_specs::text)) as text_value
  from public.products product
  where product.product_type = 'physical'
), classified as (
  select
    source.id,
    case
      when text_value ~ '(quarter[- ]?zip|1/4[- ]?zip)' then 'quarter_zips'
      when text_value ~ '(hoodie|hooded|hooded sweatshirt|pullover hood)' then 'hoodies'
      when text_value ~ '(crewneck|crew neck|sweatshirt|sweater)' then 'crewnecks'
      when text_value ~ '(jacket|outerwear|coat|softshell|soft shell|fleece jacket|fleece vest|full[- ]?zip fleece)' then 'outerwear'
      when text_value ~ '(jogger|sweat ?pant|track pant|athletic pant|legging|pants)' then 'pants'
      when text_value ~ '(^|[^a-z])(shorts)([^a-z]|$)' then 'shorts'
      when text_value ~ '(tank top|racerback tank|muscle tee|muscle shirt|sleeveless)' then 'tank_tops'
      when text_value ~ '(backpack|tote|duffel|duffle|bag)' then 'bags'
      when text_value ~ '(beanie|headwear|baseball cap|trucker cap|snapback|[^a-z]cap[^a-z]|[^a-z]hat[^a-z])' then 'hats'
      when text_value ~ '(long sleeve|long-sleeve)' then 'long_sleeve'
      when text_value ~ '(polo|golf shirt)' then 'polos'
      when text_value ~ '(t-shirt|t shirt|tee|short sleeve|softstyle|jersey)' then 't_shirts'
      when text_value ~ '(performance shirt|sport shirt|athletic shirt|sportswear)' then 't_shirts'
      when text_value ~ '(fleece|pullover)' then 'crewnecks'
      else 'other'
    end as primary_type,
    to_jsonb(array_remove(array[
      case when text_value ~ '(women''s|womens|ladies|female fit|womens_)' then 'womens' end,
      case when text_value ~ '(^|[^a-z])men''?s([^a-z]|$)|male fit|unisex|mens_' then 'mens' end,
      case when text_value ~ '(youth|toddler|infant|kids|child|youth_)' then 'kids' end,
      case when text_value ~ '(sport|athletic|activewear|training|teamwear|sportswear|performance)' then 'sportswear' end,
      case when text_value ~ '(polo|quarter[- ]?zip|staff|uniform|corporate)' then 'business_apparel' end,
      case when text_value ~ '(workwear|work jacket|work shirt|work pant|utility)' then 'workwear' end,
      case when text_value ~ '(outdoor|rain|waterproof|weather|softshell|soft shell)' then 'outdoor' end,
      case when text_value ~ '(performance|moisture[- ]?wicking|dry fit|dri-fit)' then 'performance' end
    ]::text[], null)) as inferred_secondary_tags
  from source
)
update public.products product
set
  primary_garment_type = classified.primary_type,
  secondary_tags = classified.inferred_secondary_tags
from classified
where product.id = classified.id
  and product.primary_garment_type is null;

-- Preserve the existing customer-safe projection and append only the two
-- customer-facing classification fields. Vendor cost/internal data stays out.
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
  product.vendor_data_refreshed_at,
  product.primary_garment_type,
  product.secondary_tags
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

commit;
