import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const hero = read('src/components/home/HomeHero.jsx');
const brands = read('src/components/home/HomeFeaturedBrands.jsx');
const home = read('src/pages/Home.jsx');

assert.ok(hero.includes('Affordable Apparel Blanks for Brands, Teams &amp; Creators'), 'hero uses the approved affordable apparel headline');
assert.ok(!hero.includes('Made Simple'), 'hero no longer says Made Simple');
assert.ok(!hero.includes('Custom Garments'), 'hero no longer says Custom Garments');
assert.ok(hero.includes('Shop brand-name blanks for creators, brands, families, teams, and businesses'), 'hero uses the approved blank-first subheadline');
assert.ok(hero.includes('Shop Blanks'), 'primary CTA says Shop Blanks');
assert.ok(hero.includes('to="/ShopGarments"'), 'Shop Blanks links to the public garment shop');
assert.ok(hero.includes('Bulk Quote 50+'), 'secondary CTA remains Bulk Quote 50+');
assert.ok(hero.includes('to="/RequestQuote"'), 'bulk quote CTA links to the quote page');
assert.ok(hero.includes('Upload your artwork'), 'custom printing is retained as secondary support text');
assert.ok(brands.includes('Columbia') && brands.includes('Shaka Wear') && brands.includes('Champion'), 'required blank brands remain featured');
assert.ok(home.includes('<HomeFeaturedBrands />'), 'featured brand collections render on the homepage');
assert.ok(hero.includes('lg:grid-cols-2'), 'desktop hero uses a true two-column split');
assert.ok(hero.includes('data-testid="hero-visual-panel"'), 'hero includes a dedicated visual panel');
assert.ok(hero.includes("const HERO_BRANDS = ['Columbia', 'Shaka Wear', 'Champion']"), 'hero visual retains Columbia, Shaka Wear, and Champion');
assert.ok(hero.includes('lg:grid-cols-2'), 'desktop hero uses a bounded 50/50 split at desktop widths');
assert.ok(hero.includes('grid-cols-1'), 'hero stacks into one column below desktop widths');
assert.ok(hero.includes('min-w-0'), 'hero grid cells may shrink without causing horizontal overflow');
assert.ok(!hero.includes('100vw'), 'hero does not use viewport-width padding that can overflow a split column');
assert.ok(hero.includes('getHeroProductImage'), 'hero resolves approved images from product and variant image fields');
assert.ok(hero.includes('onError={() => setImageFailed(true)}'), 'broken catalog images fall back to a styled brand panel');
assert.ok(hero.includes('Shop {brand} Blanks'), 'featured brand cards expose a clear shop CTA');

console.log('Homepage blank-first split-screen checks passed (20 assertions).');
