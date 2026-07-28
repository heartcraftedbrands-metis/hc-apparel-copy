import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCustomizedCartItem } from '../src/lib/productCustomization.js';
import { getProductPrice } from '../src/lib/shopGarmentFilters.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(
  root,
  'supabase',
  'migrations',
  '202607240015_affordable_storefront_pricing.sql',
);
const migration = fs.readFileSync(migrationPath, 'utf8');

let assertions = 0;
const check = (condition, message) => {
  assert.ok(condition, message);
  assertions += 1;
};

const expectedRules = [
  ['basic_tshirt', '4.99', '7.99'],
  ['premium_tshirt', '7.99', '11.99'],
  ['long_sleeve', '9.99', '14.99'],
  ['tank_top', '6.99', '11.99'],
  ['youth_kids', '4.99', '8.99'],
  ['crewneck', '14.99', '24.99'],
  ['hoodie', '18.99', '34.99'],
  ['hat', '7.99', '18.99'],
  ['bag', '7.99', '39.99'],
];

for (const [rule, minimum, maximum] of expectedRules) {
  const rulePattern = new RegExp(
    `\\('${rule}',[^\\n]+${minimum.replace('.', '\\.')}[^\\n]+${maximum.replace('.', '\\.')}`,
  );
  check(rulePattern.test(migration), `${rule} must retain its approved price range`);
}

check(
  migration.includes("'Hidden from public shop due to high retail price.'"),
  'the known overpriced Adidas product must receive the required admin note',
);
check(
  migration.includes('storefront_image_approved'),
  'missing or placeholder images must be blocked unless specifically approved',
);
check(
  migration.includes("previous_price >= 50"),
  'unapproved extreme public prices must be hidden',
);
check(
  migration.includes('storefront_pricing_adjustments'),
  'pricing changes must be auditable without exposing vendor cost publicly',
);
check(
  !/vendor_cost[,\n][\s\S]{0,120}from public\.products[\s\S]{0,80}where visibility = 'public'/i.test(
    migration.split('create or replace view public.storefront_products')[1] || '',
  ),
  'the public storefront view must not expose vendor cost',
);

const product = {
  id: 'gildan-5000',
  name: 'Gildan 5000',
  price: 6.99,
  sale_price: null,
  product_type: 'physical',
  image_url: 'https://example.test/gildan-5000.jpg',
  size_prices: [{
    size: 'Black / M',
    sku: 'G5000-BLK-M',
    price: 12.99,
    inventory: 10,
  }],
};

check(getProductPrice(product) === 6.99, 'the clean storefront price must be used');

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
  cartItem.price === 6.99,
  'a stale variant price must not bypass the customer-facing blank price in cart',
);
check(
  cartItem.sku === 'G5000-BLK-M',
  'SKU selection must remain intact when storefront pricing is applied',
);
check(
  migration.includes("where product.product_type = 'physical'"),
  'pricing must not modify digital products',
);
check(
  !/\bdelete\s+from\s+public\.products\b/i.test(migration),
  'the migration must never delete product records',
);
check(
  !/\binventory\s*=/i.test(migration),
  'the migration must not change SKU inventory',
);

console.log(`Storefront pricing checks passed: ${assertions} assertions.`);
