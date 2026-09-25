export const BRAND_PAGES = [
  { slug: 'dri-duck', name: 'DRI DUCK', tagline: 'Built for work, weather, and everyday wear.', description: 'Outdoor-ready blanks, jackets, fleece, headwear, and workwear options for teams, brands, and businesses.', categories: ['fleece', 'outerwear', 'hats', 'womens'], logo: '/brands/dri-duck.jpg' },
  { slug: 'comfort-colors', name: 'Comfort Colors', tagline: 'Garment-dyed blanks with a soft, lived-in feel.', description: 'Tees, long sleeves, sweatshirts, and casual blanks for brands, creators, events, and everyday apparel.', categories: ['t_shirts', 'long_sleeve', 'crewnecks', 'hoodies', 'tank_tops', 'kids'], logo: '/brands/comfort-colors.jpg' },
  { slug: 'gildan', name: 'Gildan', tagline: 'Everyday blanks for every kind of project.', description: 'Reliable tees, fleece, and more for brands, teams, events, and bulk orders.', categories: ['t_shirts', 'hoodies', 'fleece', 'crewnecks'], logo: '/brands/gildan.jpg' },
  { slug: 'shaka-wear', name: 'Shaka Wear', tagline: 'Streetwear-ready blank essentials.', description: 'Structured tees and versatile blanks for creators, brands, and teams.', categories: ['t_shirts', 'long_sleeve', 'hoodies'], logo: '/brands/shaka-wear.jpg' },
  { slug: 'champion', name: 'Champion', tagline: 'Champion blanks for teams, businesses, organizations, and everyday wear.', description: 'Explore sports, teamwear, staff apparel, corporate-casual layers, and premium everyday Champion blanks through HC Apparel.', categories: ['t_shirts', 'long_sleeve', 'polos', 'quarter_zips', 'hoodies', 'crewnecks', 'outerwear', 'pants', 'shorts', 'hats', 'winter_cold_weather', 'womens', 'sportswear', 'business_apparel'], logo: '/brands/champion.jpg', hero_image_url: '/brands/champion-hero.jpg', hero_object_position: 'center center' },
  { slug: 'american-apparel', name: 'American Apparel', tagline: 'Modern layers and everyday blanks for cooler weather.', description: 'Shop fall and winter-ready American Apparel long sleeves, fleece, hoodies, sweatshirts, pants, and layering basics.', categories: ['t_shirts', 'long_sleeve', 'hoodies', 'crewnecks', 'outerwear', 'pants', 'winter_cold_weather', 'womens', 'mens'], hero_image_url: '/brands/american-apparel-hero.jpg', hero_object_position: 'center center', hero_mobile_object_position: 'center top', hero_image_fit: 'contain' },
  { slug: 'columbia', name: 'Columbia', tagline: 'Ready for colder days and outdoor work.', description: 'Explore fleece, outerwear, and everyday gear for teams and businesses.', categories: ['outerwear', 'fleece', 'sportswear'], logo: '/brands/columbia.jpg' },
  { slug: 'bella-canvas', name: 'Bella + Canvas', tagline: 'Versatile blanks for creative projects.', description: 'Shop tees and other apparel blanks for brands, creators, and events.', categories: ['t_shirts', 'tank_tops', 'womens'], logo: '/brands/bella-canvas.jpg' },
  { slug: 'next-level', name: 'Next Level', tagline: 'Modern blanks for your next idea.', description: 'Explore tees and everyday apparel for teams, businesses, and creators.', categories: ['t_shirts', 'tank_tops', 'womens'], logo: '/brands/next-level.jpg' },
  { slug: 'hanes', name: 'Hanes', tagline: 'Dependable everyday apparel blanks.', description: 'Find approachable tees, fleece, and basics for groups and bulk orders.', categories: ['t_shirts', 'hoodies', 'fleece', 'kids'], logo: '/brands/hanes.jpg' },
  { slug: 'rabbit-skins', name: 'Rabbit Skins', tagline: 'Little sizes for big ideas.', description: 'Explore youth and family-friendly apparel blanks for schools, events, creators, and teams.', categories: ['kids', 't_shirts', 'hoodies'], logo: '/brands/rabbit-skins.jpg' },
  { slug: 'port-company', name: 'Port & Company', tagline: 'Practical blanks for groups and teams.', description: 'Browse apparel options for uniforms, events, schools, and businesses.', categories: ['t_shirts', 'hoodies', 'polos', 'hats'] },
  { slug: 'independent-trading-co', name: 'Independent Trading Co.', tagline: 'Fleece and layers made for the everyday.', description: 'Shop hoodie, sweatshirt, and outerwear blanks for brands and teams.', categories: ['hoodies', 'fleece', 'crewnecks', 'outerwear'] },
  { slug: 'district', name: 'District', tagline: 'Modern everyday blanks for teams and creators.', description: 'Shop approachable tees, fleece, and casual apparel for organizations, events, and branded programs.', categories: ['t_shirts', 'long_sleeve', 'hoodies', 'crewnecks', 'womens'] },
  { slug: 'lane-seven', name: 'Lane Seven', tagline: 'Comfortable fleece and everyday layers.', description: 'Explore hoodies, crewnecks, tees, and versatile blanks for brands, teams, and organizations.', categories: ['t_shirts', 'hoodies', 'crewnecks', 'outerwear'] },
  { slug: 'adidas', name: 'adidas', tagline: 'Performance apparel and gear for teams, businesses, and everyday wear.', description: 'Shop authentic adidas tees, polos, layers, outerwear, headwear, and bags through HC Apparel.', categories: ['t_shirts', 'long_sleeve', 'polos', 'quarter_zips', 'hoodies', 'crewnecks', 'outerwear', 'pants', 'shorts', 'hats', 'bags', 'sportswear', 'business_apparel'] },
  { slug: 'oakley', name: 'Oakley', tagline: 'Performance-inspired everyday gear.', description: 'Shop apparel and accessories for active teams and businesses.', categories: ['sportswear', 'polos', 'hats', 'bags'], logo: undefined },
];

export const normalizeBrandName = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export const brandSlug = value => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/\+/g, ' plus ')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .replace(/^bella-plus-canvas$/, 'bella-canvas')
  .replace(/^port-and-company$/, 'port-company');

export const brandPageBySlug = slug => BRAND_PAGES.find(brand => brand.slug === brandSlug(slug));
export const brandPageByName = name => BRAND_PAGES.find(brand => normalizeBrandName(brand.name) === normalizeBrandName(name));

export function defaultBrandPage(name) {
  const savedDefault = brandPageByName(name);
  if (savedDefault) return savedDefault;
  return {
    slug: brandSlug(name),
    name: String(name || '').trim(),
    tagline: `Shop ${String(name || '').trim()} apparel blanks.`,
    description: `Explore public ${String(name || '').trim()} garments for teams, businesses, creators, and everyday wear.`,
    categories: [],
    is_active: true,
  };
}
