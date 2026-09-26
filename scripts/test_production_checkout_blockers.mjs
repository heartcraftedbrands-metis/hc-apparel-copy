import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [edge, migration, admin, checkout] = await Promise.all([
  readFile(new URL('../supabase/functions/checkout-pricing/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/202609260001_secure_checkout_pricing_settings.sql', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/AdminPaymentFeeSettings.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/Checkout.jsx', import.meta.url), 'utf8'),
]);

assert.match(migration, /security definer/i);
assert.match(migration, /set search_path = public, pg_temp/i);
assert.match(migration, /revoke all on function public\.get_checkout_pricing_settings_server\(\) from public, anon, authenticated/i);
assert.match(migration, /grant execute on function public\.get_checkout_pricing_settings_server\(\) to service_role/i);
assert.doesNotMatch(migration, /grant\s+select[^;]+checkout_financial_settings[^;]+(?:anon|authenticated)/i);

assert.match(edge, /admin\.rpc\('get_checkout_pricing_settings_server'\)/);
assert.match(edge, /customerSafeQuote/);
assert.match(edge, /quote: customerSafeQuote\(quote\)/);
assert.doesNotMatch(edge.match(/const customerSafeQuote[\s\S]+?\n\}\);/)?.[0] || '', /vendorCost|estimatedMargin|processingMethod|estimatedVendorShipping/);
assert.match(edge, /SS_SHIPPING_TIERS_INCOMPLETE/);
assert.match(edge, /USPS_DEFAULT_WEIGHT_MISSING/);
assert.match(edge, /USPS_PACKAGE_DIMENSIONS_MISSING/);
assert.match(edge, /USPS_RATE_AND_FALLBACK_UNAVAILABLE/);

assert.match(admin, /Checkout shipping readiness/);
assert.match(admin, /S&S checkout shipping configuration incomplete/);
assert.match(admin, /Tax calculation is currently disabled/);
assert.match(admin, /USPS live rates/);
assert.match(checkout, /Calculated before payment/);

console.log('PASS: checkout settings stay server-only, customer quotes are sanitized, and admin blockers are explicit.');
