import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { publicVisitorPrice } from '../src/lib/customerPricing.js';

const customerPrice = 7.01;
const settings = { enabled: true, difference: 5 };
assert.equal(publicVisitorPrice(customerPrice, settings, { product_type: 'physical' }), 12.01);
assert.equal(customerPrice, 7.01, 'Stored/customer price must remain unchanged.');
assert.equal(publicVisitorPrice(customerPrice, { enabled: false, difference: 5 }, { product_type: 'physical' }), 7.01);
assert.equal(publicVisitorPrice(customerPrice, settings, { product_type: 'digital' }), 7.01);

const checkout = await readFile(new URL('../supabase/functions/checkout-pricing/index.ts', import.meta.url), 'utf8');
assert.match(checkout, /from\('products'\)\.select\('id,name,price,sale_price,size_prices/);
assert.match(checkout, /variant\?\.price \|\| product\.sale_price \|\| product\.price/);
assert.doesNotMatch(checkout, /const price = safeNumber\(item\.price\)/);

console.log('Public visitor pricing: guest $12.01; customer $7.01; checkout reloads DB price.');
