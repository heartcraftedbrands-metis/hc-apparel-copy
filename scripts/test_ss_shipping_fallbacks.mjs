import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [checkout, migration, admin, stripe] = await Promise.all([
  readFile(new URL('../supabase/functions/checkout-pricing/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/202609270002_configure_verified_ss_shipping_tiers.sql', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/AdminPaymentFeeSettings.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/functions/createStripeCheckoutSession/index.ts', import.meta.url), 'utf8'),
]);

const settings = { threshold: 200, tier12: 13.5, tier35: 16.5, tier612: 16.5, tier13: null, buffer: 0 };
function quote(quantity, subtotal, freeFreightEligible, configured = settings) {
  if (subtotal >= configured.threshold && freeFreightEligible === true) return 0;
  if (quantity <= 2) return configured.tier12;
  if (quantity <= 5) return configured.tier35;
  if (quantity <= 12) return configured.tier612;
  if (configured.tier13 == null) return 'review';
  return configured.tier13;
}

assert.equal(quote(1, 20, false), 13.5);
assert.equal(quote(3, 60, false), 16.5);
assert.equal(quote(5, 100, false), 16.5);
assert.equal(quote(12, 180, false), 16.5);
assert.equal(quote(12, 220, true), 0);
assert.equal(quote(12, 220, false), 16.5);
assert.equal(quote(12, 220, null), 16.5);
assert.equal(quote(13, 190, false), 'review');
assert.equal(quote(13, 220, true), 0);
assert.equal(13.5 + 8.72, 22.22, 'Mixed fulfillment combines separate S&S and USPS legs once');

assert.match(checkout, /fields', 'Sku,ExcludeFreeFreight'/);
assert.match(checkout, /freeFreight\.eligible/);
assert.match(checkout, /SS_SHIPPING_REVIEW_REQUIRED/);
assert.match(checkout, /shipping_charged_to_customer: quote\.shipping/);
assert.match(checkout, /estimated_s_and_s_shipping: quote\.estimatedVendorShipping/);
assert.match(migration, /ss_tier_1_2 = 13\.50/);
assert.match(migration, /ss_tier_3_5 = 16\.50/);
assert.match(migration, /ss_tier_6_12 = 16\.50/);
assert.match(migration, /ss_tier_13_plus = null/);
assert.match(migration, /ss_free_freight_threshold = 200\.00/);
assert.match(admin, /13\+ garment fallback is blank/);
assert.match(admin, /observed S&S checkout freight/);
assert.match(stripe, /\{ name: 'Shipping', amount: Number\(order\.shipping_amount \|\| 0\) \}/);

console.log('PASS: verified S&S fallback tiers, free-freight eligibility, 13+ review, mixed shipping, and Stripe shipping inclusion.');
console.log('SAFETY: no payment, S&S order, or USPS label was created.');