-- Correct Champion storefront organization and expose a winter filter without
-- changing S&S source categories, prices, visibility, or the brand hero.
begin;

update public.products product
set primary_garment_type = mapping.primary_garment_type
from (values
  ('chp160', 't_shirts'), ('chp130', 't_shirts'), ('t453w', 't_shirts'),
  ('00784', 't_shirts'), ('63284', 't_shirts'), ('chp140', 'long_sleeve'),
  ('chp115', 'polos'), ('s450', 'quarter_zips'), ('s171', 'hoodies'),
  ('chp100', 'hoodies'), ('s790', 'hoodies'), ('s800', 'hoodies'),
  ('s101', 'hoodies'), ('22884', 'hoodies'), ('s149', 'crewnecks'),
  ('sl650', 'crewnecks'), ('21284', 'crewnecks'), ('co100', 'outerwear'),
  ('co125', 'outerwear'), ('co126', 'outerwear'), ('p930', 'pants'),
  ('chp120', 'pants'), ('chp200', 'pants'), ('8187', 'shorts')
) as mapping(style_key, primary_garment_type)
where product.brand = 'Champion'
  and lower(btrim(coalesce(product.style_number, ''))) = mapping.style_key;

-- Winter is a merchandising tag only. Products stay in their garment sections.
update public.products product
set secondary_tags = (
  select jsonb_agg(tag order by tag)
  from (
    select distinct tag
    from jsonb_array_elements_text(coalesce(product.secondary_tags, '[]'::jsonb)) tag
    union all select 'winter_cold_weather'
  ) tags
)
where product.brand = 'Champion'
  and lower(btrim(coalesce(product.style_number, ''))) in (
    's171','p930','co125','s149','chp120','chp100','chp200','sl650','s790',
    'co126','s450','s800','co100','s101','21284','22884'
  );

-- Women-specific products should not carry the inferred men's tag.
update public.products
set secondary_tags = secondary_tags - 'mens'
where brand = 'Champion'
  and lower(btrim(coalesce(style_number, ''))) in ('chp120','chp100','sl650','chp130','chp140','t453w');

-- Replace style-only public names with customer-friendly garment names.
update public.products product
set name = mapping.customer_name
from (values
  ('00784', 'Champion Unisex Short Sleeve T-Shirt'),
  ('63284', 'Champion Unisex Performance T-Shirt'),
  ('21284', 'Champion Unisex Powerblend Crewneck Sweatshirt'),
  ('22884', 'Champion Unisex Powerblend Hooded Sweatshirt')
) as mapping(style_key, customer_name)
where product.brand = 'Champion'
  and lower(btrim(coalesce(product.style_number, ''))) = mapping.style_key;

update public.brand_pages page
set categories = (
  select array_agg(value order by position)
  from (
    select distinct on (value) value, position
    from unnest(coalesce(page.categories, array[]::text[]) || array[
      'long_sleeve','polos','quarter_zips','hoodies','crewnecks','outerwear','pants',
      'shorts','hats','winter_cold_weather','womens','sportswear','business_apparel'
    ]) with ordinality values_with_position(value, position)
    order by value, position
  ) deduplicated
)
where slug = 'champion';

commit;
