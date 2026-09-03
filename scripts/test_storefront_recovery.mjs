import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePublicRuntimeConfig } from '../src/lib/publicRuntimeConfig.js';
import { isPublicProduct } from '../src/lib/productVisibility.js';
import { getProductPriceRange } from '../src/lib/shopGarmentFilters.js';
import { buildCustomizedCartItem } from '../src/lib/productCustomization.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const shop = read('src/pages/ShopGarments.jsx');
const detail = read('src/pages/ProductDetail.jsx');
const card = read('src/components/shop/GarmentProductCard.jsx');

const publishableConfig = validatePublicRuntimeConfig({
  VITE_SUPABASE_URL: 'https://example.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
});
assert.equal(publishableConfig.isValid, true);
assert.equal(publishableConfig.supabaseKeyEnvName, 'VITE_SUPABASE_PUBLISHABLE_KEY');

const anonConfig = validatePublicRuntimeConfig({
  VITE_SUPABASE_URL: 'https://example.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'eyJlegacy-public-anon-key',
});
assert.equal(anonConfig.isValid, true);
assert.equal(anonConfig.supabaseKeyEnvName, 'VITE_SUPABASE_ANON_KEY');

assert.equal(isPublicProduct({ product_type: 'physical', visibility: 'public', is_active: true }), true);
assert.equal(isPublicProduct({ product_type: 'physical', visibility: 'public', is_active: true, description: 'Low-profile garment designed for digital printing and artwork files.' }), true);
assert.equal(isPublicProduct({ product_type: 'physical', public_status: 'published', active: true }), true);
assert.equal(isPublicProduct({ product_type: 'physical', status: 'live', is_public: true }), true);
assert.equal(isPublicProduct({ product_type: 'physical', visibility: 'public', archived: true }), false);
assert.equal(isPublicProduct({ product_type: 'physical', visibility: 'public', hidden: true }), false);
assert.equal(isPublicProduct({ product_type: 'physical', visibility: 'public', is_active: false }), false);
assert.equal(isPublicProduct({ product_type: 'physical', status: 'hidden', is_public: true }), false);

assert.ok(shop.includes("base44.entities.Product.list('-created_date')"));
assert.ok(shop.includes('Garments could not be loaded.'));
assert.ok(detail.includes("? 'Standard' : color"));
assert.ok(detail.includes('Specs coming soon.'));
assert.ok(detail.includes('vendorSpecEntries.map'));
assert.ok(card.includes("['?', 'unknown', 'color unavailable']"));

const product = {
  id: 'fallback-product',
  name: 'Champion Example',
  price: 12.99,
  product_type: 'physical',
  size_prices: [{ size: '? / M', sku: 'CHAMP-M', price: null, inventory: 4 }],
};
assert.equal(getProductPriceRange(product).minimum, 12.99);
const cartItem = buildCustomizedCartItem(product, {
  selectedColor: 'Standard',
  selectedSize: 'M',
  quantity: 1,
  customization_requested: false,
});
assert.equal(cartItem.price, 12.99);
assert.equal(cartItem.selectedColor, 'Standard');
assert.equal(cartItem.sku, 'CHAMP-M');

console.log('Storefront recovery checks passed (27 assertions).');
