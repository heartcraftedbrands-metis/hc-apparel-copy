import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const supplierPattern = /S(?:&amp;|&)S(?:\s+Activewear)?|ZeroTouch/i;

const customerFiles = [
  'src/components/home/SpecialsSection.jsx',
  'src/components/marketing/WeeklyOrganicReview.jsx',
  'src/pages/Checkout.jsx',
  'src/pages/DTFTransfers.jsx',
  'src/pages/PrivacyPolicy.jsx',
];

for (const file of customerFiles) {
  assert.doesNotMatch(read(file), supplierPattern, `${file} must not expose supplier branding`);
}

const specials = read('src/components/home/SpecialsSection.jsx');
for (const copy of [
  'Limited-Time HC Apparel Deals',
  'Limited-time deal',
  'Discover special offers on your favorite apparel while supplies last.',
  'Available at a special price while supplies last.',
  'Your Price',
]) assert.ok(specials.includes(copy), `homepage specials include: ${copy}`);

const productCopy = read('src/lib/publicProductCopy.js');
assert.match(productCopy, /SUPPLIER_BRANDING/, 'imported customer copy has a supplier-branding guard');

const refresh = read('supabase/functions/homepage-specials-refresh/index.ts');
assert.ok(refresh.includes('Available at a special price while supplies last.'), 'future homepage refreshes store neutral customer copy');

const migration = read('supabase/migrations/202610100002_remove_supplier_branding_from_storefront_copy.sql');
assert.match(migration, /update public\.homepage_specials/i, 'existing homepage promotion rows are corrected');
assert.doesNotMatch(migration.match(/set subtitle = ([^;]+)/i)?.[1] || '', supplierPattern, 'the persisted customer subtitle is supplier-neutral');

const customerShipping = await import('../src/lib/customerShipping.js');
assert.equal(customerShipping.getCustomerDtfDeliveryMethod({}), 'DTF transfer shipping');
assert.equal(
  customerShipping.getCustomerDtfDeliveryMethod({ isTestOrder: true, verifiedService: 'private fixture' }),
  'DTF transfer shipping — test order only',
);
assert.equal(
  customerShipping.getCustomerDtfDeliveryMethod({ verifiedService: 'USPS Ground Advantage' }),
  'DTF transfer shipping — USPS Ground Advantage',
);
assert.equal(
  customerShipping.getCustomerDtfDeliveryMethod({ verifiedService: 'Authenticated S&S transfer-cart freight quote' }),
  'DTF transfer shipping',
);

for (const file of [
  'supabase/functions/stripeWebhook/index.ts',
  'supabase/functions/dtf-test-order-notification/index.ts',
]) {
  assert.ok(read(file).includes('DTF transfer shipping — test order only'), `${file} uses customer-safe test delivery wording`);
}

console.log('Customer-facing supplier-branding safeguards passed.');
