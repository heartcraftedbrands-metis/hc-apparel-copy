import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateCheckoutCart } from '../src/lib/smallOrderCheckout.js';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const migration = read('supabase/migrations/202610090001_digital_mockups_storefront.sql');
const mixedMigration = read('supabase/migrations/202610090002_mixed_digital_physical_checkout.sql');
const edge = read('supabase/functions/digital-mockups/index.ts');
const webhook = read('supabase/functions/stripeWebhook/index.ts');
const checkoutPricing = read('supabase/functions/checkout-pricing/index.ts');
const cart = read('src/components/shop/CartContext.jsx');
const routes = read('src/App.jsx');
const client = read('src/lib/digitalMockups.js');

const item = { id: 'product-1', product_id: 'product-1', product_name: 'Black T-Shirt Mockup', product_type: 'digital', quantity: 1, price: 1.2 };
assert.equal(item.product_type, 'digital');
assert.equal(item.quantity, 1);
assert.deepEqual(validateCheckoutCart([item]), []);
assert.ok(validateCheckoutCart([{ ...item, quantity: 2 }]).some(error => error.includes('once per order')));

assert.match(migration, /digital-mockup-originals'[\s\S]*?false,/);
assert.match(migration, /original_sha256 text not null unique/);
assert.match(migration, /unique \(order_id, product_id, version_id\)/);
const publicView = migration.slice(migration.indexOf('create or replace view public.storefront_digital_mockups'), migration.indexOf('revoke all on public.storefront_digital_mockups'));
assert.doesNotMatch(publicView, /original_storage_path|original_sha256/);
assert.match(edge, /createSignedUrl\(version\.original_storage_path, expiresIn/);
assert.match(edge, /const expiresIn = 120/);
assert.match(edge, /session\.payment_status !== 'paid'/);
assert.match(edge, /confirmation_email_status === 'accepted'/);
assert.match(webhook, /hc_apparel_digital_mockups/);
assert.match(webhook, /hc_apparel_mixed_storefront/);
assert.match(checkoutPricing, /product\.product_type === 'digital'/);
assert.match(mixedMigration, /where item ->> 'product_type' = 'physical'/);
assert.match(mixedMigration, /Digital mockups can be purchased once per order/);
assert.match(cart, /product_type === 'digital' \? 1/);
assert.match(client, /product_type: 'digital'/);
assert.match(client, /HC_LOGO_URL/);
assert.match(routes, /path="\/DigitalMockups"/);
assert.match(routes, /path="\/MyDownloads"/);

console.log('Digital Mockups catalog, checkout, entitlement, and mixed-cart safety checks passed.');
