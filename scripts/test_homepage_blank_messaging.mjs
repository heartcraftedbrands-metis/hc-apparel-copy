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
assert.ok(hero.includes('md:grid-cols-2'), 'desktop hero uses a true two-column split');
assert.ok(hero.includes('data-testid="hero-visual-panel"'), 'hero includes a dedicated visual panel');
assert.ok(hero.includes("const HERO_BRANDS = ['Columbia', 'Shaka Wear', 'Champion']"), 'hero visual retains Columbia, Shaka Wear, and Champion');

console.log('Homepage blank-first split-screen checks passed (13 assertions).');
