import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [statusFunction, webhook, checkout, verify, credentials, adminSettings, config] = await Promise.all([
  readFile(new URL('../supabase/functions/getStripeStatus/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/functions/stripeWebhook/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/functions/createStripeCheckoutSession/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/functions/verifyStripePayment/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/functions/_shared/supabaseCredentials.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/AdminPaymentSettings.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/config.toml', import.meta.url), 'utf8'),
]);

assert.match(statusFunction, /Administrator access required/);
assert.match(statusFunction, /STRIPE_SECRET_KEY/);
assert.match(statusFunction, /STRIPE_WEBHOOK_SECRET/);
assert.doesNotMatch(statusFunction, /stripeSecretKey\s*[,}]/);
assert.match(statusFunction, /checkout_enabled: serverKeyDetected && webhookConfigured/);

assert.match(webhook, /request\.text\(\)/);
assert.match(webhook, /stripe-signature/);
assert.match(webhook, /constructEventAsync/);
assert.match(webhook, /Stripe\.createSubtleCryptoProvider/);
assert.match(webhook, /checkout\.session\.completed/);
assert.match(webhook, /checkout\.session\.async_payment_succeeded/);
assert.match(webhook, /session\.amount_total !== Math\.round\(Number\(order\.total_amount\) \* 100\)/);
assert.match(webhook, /session\.metadata\?\.source !== 'hc_apparel_customized_small_order'/);
assert.match(webhook, /order\.payment_status !== 'paid'/);
assert.match(webhook, /\.neq\('payment_status', 'paid'\)/);
assert.doesNotMatch(webhook, /api\.ssactivewear\.com|zero[\s-]?touch\/orders/i);

assert.match(checkout, /STRIPE_SECRET_KEY/);
assert.match(checkout, /getSupabaseServiceKey/);
assert.match(checkout, /checkout\.sessions\.create/);
assert.match(checkout, /internal_order_id: order\.id/);
assert.match(checkout, /\.from\('orders'\)/);
assert.match(checkout, /\.eq\('id', orderId\.trim\(\)\)/);
assert.match(checkout, /Unable to load customer order/);
assert.match(verify, /checkout\.sessions\.retrieve/);
assert.match(verify, /session\.amount_total !== Math\.round\(Number\(order\.total_amount\) \* 100\)/);

const currentSecretIndex = credentials.indexOf("readDefaultKey('SUPABASE_SECRET_KEYS')");
const legacySecretIndex = credentials.indexOf("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')");
assert.ok(currentSecretIndex >= 0, 'current Supabase secret-key map is supported');
assert.ok(legacySecretIndex > currentSecretIndex, 'current Supabase secret is preferred over legacy service-role key');
assert.match(credentials, /SUPABASE_SECRET_KEY/);
assert.match(credentials, /SUPABASE_PUBLISHABLE_KEYS/);

assert.match(adminSettings, /stripeStatus\?\.checkout_enabled/);
assert.match(adminSettings, /Stripe Checkout cannot be enabled until the test key and signed webhook are configured/);
assert.match(adminSettings, /This page never receives or displays them/);
assert.match(config, /\[functions\.stripeWebhook\]\s+verify_jwt = false/);
assert.match(config, /\[functions\.getStripeStatus\]\s+verify_jwt = true/);

console.log('Stripe test-mode connection checks passed.');
