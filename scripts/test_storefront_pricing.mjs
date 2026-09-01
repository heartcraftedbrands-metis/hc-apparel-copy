import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCustomizedCartItem } from '../src/lib/productCustomization.js';
import {
  getProductPrice,
  getProductPriceRange,
} from '../src/lib/shopGarmentFilters.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(
  root,
  'supabase',
  'migrations',
  '202607280012_ss_variant_pricing_colors_specs.sql',
);
const migration = fs.readFileSync(migrationPath, 'utf8');

let assertions = 0;
const check = (condition, message) => {
  assert.ok(condition, message);
  assertions += 1;
};

check(
  migration.includes("'price', round(variant.customer_price + 3.00, 2)"),
  'each S&S SKU public price must be its customer price plus exactly $3.00',
);
check(
  migration.includes("'vendor_cost', round(variant.customer_price, 2)"),
  'the admin record must retain the source S&S SKU cost for audit',
);
check(
  migration.includes("- 'vendor_cost'"),
  'the public view must remove vendor cost from variant JSON',
);
check(
  migration.includes("then (v_variant ->> 'price')::numeric"),
  'trusted checkout must reselect the stored variant public price',
);
check(
  !/maximum_price|minimum_price|cost_multiplier/.test(migration),
  'real S&S variant pricing must not be replaced by category price ranges',
);

const product = {
  id: 'gildan-5000',
  name: 'Gildan 5000',
  price: 11.99,
  sale_price: null,
  product_type: 'physical',
  image_url: 'https://example.test/gildan-5000.jpg',
  size_prices: [{
    size: 'Black / M',
    sku: 'G5000-BLK-M',
    price: 9.99,
    inventory: 10,
  }, {
    size: 'Black / 2XL',
    sku: 'G5000-BLK-2XL',
    price: 11.05,
    inventory: 4,
  }],
};

check(getProductPrice(product) === 9.99, 'card price must use the lowest in-stock SKU price');
check(
  getProductPriceRange(product).hasVariablePricing,
  'a product with SKU price differences must be labeled as variable pricing',
);

const cartItem = buildCustomizedCartItem(product, {
  selectedColor: 'Black',
  selectedSize: 'M',
  quantity: 1,
  artwork_file_url: 'supabase://customer-files/example.png',
  artwork_file_name: 'example.png',
  decoration_method: 'DTF',
  print_placement: 'front_center',
  print_size_option: 'standard_front',
  print_notes: '',
});

check(
  cartItem.price === 9.99,
  'cart must use the selected SKU public price instead of a style-level price',
);
check(
  cartItem.sku === 'G5000-BLK-M',
  'SKU selection must remain intact when storefront pricing is applied',
);
check(
  buildCustomizedCartItem(product, {
    selectedColor: 'Black',
    selectedSize: '2XL',
    quantity: 1,
    customization_requested: false,
  }).price === 11.05,
  'a higher-cost selected 2XL SKU must retain its own public price',
);
check(
  !/\bdelete\s+from\s+public\.products\b/i.test(migration),
  'the migration must never delete product records',
);
check(migration.includes('inventory_qty'), 'variant inventory must come from S&S staging');

console.log(`Storefront pricing checks passed: ${assertions} assertions.`);
