-- Add the American Apparel brand landing page and owner-managed hero settings.
-- Product publication is handled separately after authenticated S&S QA.
insert into public.brand_pages (
  slug, name, tagline, description, categories, is_active, sort_order,
  hero_image_url, hero_object_position, updated_at
)
values (
  'american-apparel',
  'American Apparel',
  'Modern layers and everyday blanks for cooler weather.',
  'Shop fall and winter-ready American Apparel long sleeves, fleece, hoodies, sweatshirts, pants, and layering basics.',
  array['long_sleeve','hoodies','crewnecks','outerwear','pants','winter_cold_weather','womens','mens'],
  true,
  6,
  '/brands/american-apparel-hero.jpg',
  'center top',
  now()
)
on conflict (slug) do update set
  name = excluded.name,
  tagline = excluded.tagline,
  description = excluded.description,
  categories = excluded.categories,
  is_active = true,
  hero_image_url = excluded.hero_image_url,
  hero_object_position = excluded.hero_object_position,
  updated_at = now();
