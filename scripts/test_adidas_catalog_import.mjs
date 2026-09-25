import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const edge = await readFile(new URL('../supabase/functions/ss-activewear/index.ts', import.meta.url), 'utf8');
const brandPages = await readFile(new URL('../src/lib/brandPages.js', import.meta.url), 'utf8');
const admin = await readFile(new URL('../src/pages/AdminBrandPages.jsx', import.meta.url), 'utf8');

assert.match(edge, /'get_adidas_candidate_report'/);
assert.match(edge, /'import_adidas_live_products'/);
assert.match(edge, /readyCandidates\.length < 27/);
assert.match(edge, /adidasMerchScore/);
assert.match(edge, /adidasPrimary/);
assert.match(edge, /selectedBrand === 'adidas'/);
assert.match(edge, /nextlevel\|adidas/);
assert.match(edge, /\['Next Level', 'adidas'\]\.includes\(seasonalBrand\)/);
assert.match(edge, /visibility: 'public', is_active: true/);
assert.match(edge, /calculatedVariants\.some\(\(variant\) => !\(variant\.publicPrice > variant\.vendorCost\)\)/);
assert.match(edge, /Number\(row\.map_price\) > 0\.01/);
assert.match(brandPages, /slug: 'adidas'/);
assert.match(brandPages, /'bags'/);
assert.match(admin, /Publish passing Adidas products/);

console.log('Adidas catalog import safeguards passed.');
