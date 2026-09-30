import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const edge = await readFile(new URL('../supabase/functions/ss-activewear/index.ts', import.meta.url), 'utf8');
const brandPages = await readFile(new URL('../src/lib/brandPages.js', import.meta.url), 'utf8');
const brands = await readFile(new URL('../src/lib/ssBrands.js', import.meta.url), 'utf8');
const admin = await readFile(new URL('../src/pages/AdminBrandPages.jsx', import.meta.url), 'utf8');

assert.match(edge, /'get_berne_candidate_report'/);
assert.match(edge, /'import_berne_live_products'/);
assert.match(edge, /berneMerchScore/);
assert.match(edge, /bernePrimary/);
assert.match(edge, /berneSecondaryTags/);
assert.match(edge, /selectedBrand === 'Berne'/);
assert.match(edge, /readyCandidates\.length < 20/);
assert.match(edge, /\['Next Level', 'adidas', 'Berne'\]\.includes\(seasonalBrand\)/);
assert.match(edge, /visibility: 'public', is_active: true/);
assert.match(edge, /No stocked SKU variants/);
assert.match(edge, /No current vendor price/);
assert.match(edge, /Pricing or inventory is stale/);
assert.match(edge, /Pricing guardrail failed/);
assert.match(brandPages, /slug: 'berne'/);
assert.match(brandPages, /'workwear'/);
assert.match(brands, /'Berne'/);
assert.match(admin, /Publish 20 passing Berne products/);
assert.doesNotMatch(edge, /submit_vendor_order.*import_berne_live_products/);

console.log('PASS: Berne authenticated import requires 20 complete, current, guardrail-safe products before publication.');
console.log('SAFETY: catalog import does not submit an S&S order.');
