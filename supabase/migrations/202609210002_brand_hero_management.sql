begin;

alter table public.brand_pages
  add column if not exists hero_object_position text not null default 'center center';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'brand_pages_hero_object_position_check'
      and conrelid = 'public.brand_pages'::regclass
  ) then
    alter table public.brand_pages
      add constraint brand_pages_hero_object_position_check
      check (hero_object_position in (
        'center center', 'center top', 'center bottom', 'left center', 'right center'
      ));
  end if;
end $$;

insert into public.brand_pages (
  slug, name, tagline, description, categories, is_active, sort_order, hero_object_position
) values
  ('district', 'District', 'Modern everyday blanks for teams and creators.',
    'Shop approachable tees, fleece, and casual apparel for organizations, events, and branded programs.',
    array['t_shirts','long_sleeve','hoodies','crewnecks','womens'], true, 14, 'center center'),
  ('lane-seven', 'Lane Seven', 'Comfortable fleece and everyday layers.',
    'Explore hoodies, crewnecks, tees, and versatile blanks for brands, teams, and organizations.',
    array['t_shirts','hoodies','crewnecks','outerwear'], true, 15, 'center center')
on conflict (slug) do update set
  name = excluded.name,
  tagline = excluded.tagline,
  description = excluded.description,
  categories = excluded.categories,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  updated_at = now();

update public.brand_pages
set hero_image_url = '/brands/champion-hero.jpg',
    hero_object_position = 'center center',
    categories = array[
      't_shirts','hoodies','crewnecks','polos','quarter_zips','outerwear',
      'pants','shorts','womens','sportswear','business_apparel'
    ],
    updated_at = now()
where slug = 'champion';

commit;
