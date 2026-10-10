begin;

-- Keep customer-facing garment organization ready for verified vest imports.
-- This does not publish a product or relax any supplier restriction.
alter table public.products drop constraint if exists products_primary_garment_type_check;
alter table public.products add constraint products_primary_garment_type_check check (
  primary_garment_type is null or primary_garment_type in (
    't_shirts', 'long_sleeve', 'hoodies', 'crewnecks', 'polos', 'quarter_zips',
    'outerwear', 'vests', 'pants', 'shorts', 'hats', 'tank_tops', 'bags', 'other'
  )
);

update public.brand_pages
set
  categories = array(
    select distinct category
    from unnest(categories || array['outerwear']::text[]) as category
  ),
  updated_at = now()
where slug = 'shaka-wear';

insert into public.brand_pages (
  slug, name, tagline, description, categories, is_active, sort_order, updated_at
)
values (
  'under-armour',
  'Under Armour',
  'Performance apparel and outerwear.',
  'Shop verified Under Armour performance layers when online-retail authorization and inventory allow.',
  array['vests', 'outerwear', 'sportswear', 'performance', 'womens', 'mens'],
  true,
  18,
  now()
)
on conflict (slug) do update set
  name = excluded.name,
  tagline = excluded.tagline,
  description = excluded.description,
  categories = excluded.categories,
  is_active = true,
  updated_at = now();

commit;
