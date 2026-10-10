import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const hero = read('src/components/home/HomeHero.jsx');
const brands = read('src/components/home/HomeFeaturedBrands.jsx');
const categories = read('src/components/home/HomeFeaturedCategories.jsx');
const catalogImage = read('src/components/home/CatalogEditorialImage.jsx');
const catalogImageHelper = read('src/lib/homeCatalogImages.js');
const home = read('src/pages/Home.jsx');
const layout = read('src/Layout.jsx');
const { selectBrandProduct } = await import('../src/lib/homeCatalogImages.js');

assert.ok(hero.includes('HeartCrafted Apparel'), 'hero uses the approved introductory line');
assert.ok(hero.includes('HC Apparel'), 'hero uses the approved oversized headline');
assert.ok(hero.includes('HeartCrafted for Champions. Inspired by Love.'), 'hero uses the approved supporting headline');
assert.ok(hero.includes('From everyday essentials to team-ready apparel'), 'hero uses the approved supporting description');
assert.ok(hero.includes('Shop Apparel'), 'primary CTA says Shop Apparel');
assert.ok(hero.includes('to="/ShopGarments"'), 'Shop Apparel links to the public garment shop');
assert.ok(hero.includes('Explore Champion'), 'secondary CTA says Explore Champion');
assert.ok(hero.includes('to="/brand/champion"'), 'Explore Champion links to the existing Champion collection');
assert.ok(hero.includes('champion-cropped-hoodie-hero.jpg'), 'the supplied Champion image is the hero background');
assert.ok(hero.includes('aria-roledescription="carousel"'), 'the apparel cards expose an accessible carousel');
assert.ok(hero.includes("event.key === 'ArrowLeft'") && hero.includes("event.key === 'ArrowRight'"), 'the carousel supports keyboard navigation');
assert.ok(hero.includes('onTouchStart') && hero.includes('onTouchEnd'), 'the carousel supports touch swiping');
assert.ok(hero.includes('Editorial inspiration') && hero.includes('shop undecorated apparel'), 'the card treatment does not imply decorated team uniforms are sold');
for (const label of ['Together in Love', 'Heart of a Champion', 'Built for the Team', 'Move with Purpose', 'Carry Your Passion', 'Ready for What’s Next']) {
  assert.ok(hero.includes(label), `${label} remains in the hero carousel`);
}
assert.ok(brands.includes("name: 'adidas'") && brands.includes("name: 'Berne'") && brands.includes("name: 'American Apparel'"), 'lower featured section uses the approved adidas, Berne, and American Apparel order');
assert.ok(!brands.includes("name: 'Columbia'") && !brands.includes("name: 'Shaka Wear'") && !brands.includes("name: 'Champion'"), 'lower featured section no longer repeats the hero brands');
assert.ok(brands.includes("preferredStyles: ['A230']") && brands.includes("preferredStyles: ['CH416']") && brands.includes("preferredStyles: ['RF496']"), 'lower cards prefer approved live catalog styles');
assert.ok(home.includes('<HomeFeaturedBrands products={publicProducts} />'), 'featured brand collections render with public catalog products');
assert.ok(hero.includes('grid-cols-1') && hero.includes('lg:grid-cols-['), 'hero adapts from a mobile stack to an immersive desktop split');
assert.ok(hero.includes('min-w-0'), 'hero grid cells may shrink without causing horizontal overflow');
assert.ok(!hero.includes('100vw'), 'hero does not use viewport-width padding that can overflow the page');
assert.ok(hero.includes('disabled={activeIndex === 0}') && hero.includes('disabled={activeIndex === maxIndex}'), 'carousel controls expose their disabled boundaries');

for (const label of [
  'T-Shirts',
  'Hoodies',
  'Fleece',
  'Outerwear',
  'Tank Tops',
  "Women's Styles",
  'Sports / Activewear',
  'Hats',
  'Bags',
  'Bulk Orders',
  'Custom Printing',
]) {
  assert.ok(categories.includes(`label: '${label}'`) || categories.includes(`label: "${label}"`), `${label} has an editorial category card`);
}

for (const route of [
  '/ShopGarments?type=t_shirts',
  '/ShopGarments?type=hoodies',
  '/ShopGarments?type=fleece',
  '/ShopGarments?type=outerwear',
  '/ShopGarments?type=tank_tops',
  '/ShopGarments?type=womens',
  '/ShopGarments?type=sportswear',
  '/ShopGarments?type=hats',
  '/ShopGarments?type=bags',
  '/RequestQuote',
  '/CustomPrinting',
]) {
  assert.ok(categories.includes(route), `${route} remains wired to its existing customer flow`);
}

assert.ok(home.includes("queryKey: ['home-editorial-products']"), 'homepage loads the approved catalog once for all editorial visuals');
assert.ok(categories.includes('selectCatalogProduct'), 'category cards select images from public catalog products');
assert.ok(brands.includes('selectBrandProduct'), 'featured brand cards select matching catalog images');
assert.ok(catalogImageHelper.includes('isCatalogProductInStock'), 'featured brand cards require positive catalog inventory');
assert.ok(catalogImageHelper.includes('placeholder|no[-_ ]?image'), 'placeholder image URLs are rejected');
assert.ok(catalogImage.includes('onError={() => setFailed(true)}'), 'broken category and brand images fall back safely');
assert.ok(catalogImage.includes('linear-gradient(145deg,#637145'), 'missing images use the approved olive editorial fallback');
assert.ok(categories.includes('lg:grid-cols-12'), 'desktop category layout uses an editorial twelve-column grid');
assert.ok(categories.includes('grid-cols-1') && categories.includes('sm:grid-cols-2'), 'category cards stack without horizontal scrolling on small screens');
assert.ok(!categories.includes('emoji'), 'category cards do not use emoji placeholders');
assert.ok(brands.includes('Shop {brand.name} Blanks'), 'brand cards keep the approved brand-specific CTA wording');
assert.ok(!categories.includes('The Blank Edit'), 'the removed category eyebrow copy stays removed');
assert.ok(!categories.includes('Quality apparel blanks, curated by silhouette and purpose.'), 'the removed category supporting sentence stays removed');
const catalogFixtures = [
  { id: 'adidas-fallback', brand: 'adidas', style_number: 'A430', stock: 8, image_url: 'https://cdn.example/adidas-fallback.jpg' },
  { id: 'adidas-preferred-oos', brand: 'adidas', style_number: 'A230', stock: 0, image_url: 'https://cdn.example/adidas-a230.jpg' },
  { id: 'berne-fallback', brand: 'Berne', style_number: 'CH414', stock: 9, image_url: 'https://cdn.example/berne-ch414.jpg' },
  { id: 'berne-preferred', brand: 'Berne', style_number: 'CH416', stock: 12, image_url: 'https://cdn.example/berne-ch416.jpg' },
];
assert.equal(selectBrandProduct(catalogFixtures, 'adidas', { preferredStyles: ['A230'] })?.id, 'adidas-fallback', 'out-of-stock preferred products fall back to an in-stock brand product');
assert.equal(selectBrandProduct(catalogFixtures, 'Berne', { preferredStyles: ['CH416'] })?.id, 'berne-preferred', 'available preferred styles are selected for the brand card');
assert.ok(
  layout.includes('border-primary-foreground/40 bg-transparent text-primary-foreground'),
  'the desktop Login control remains visible against the olive header',
);

console.log('Homepage blank-first editorial checks passed.');
