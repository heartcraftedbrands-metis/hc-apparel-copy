import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [stripeCredentials, checkout, verify, webhook, status, ssFunction, migrationBase, migrationHardening, panel, settings, sourceClient] = await Promise.all([
  readFile(new URL('../supabase/functions/_shared/stripeCredentials.ts', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/functions/createStripeCheckoutSession/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/functions/verifyStripePayment/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/functions/stripeWebhook/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/functions/getStripeStatus/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/functions/ss-activewear/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/202609150001_controlled_live_integrations.sql', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/202609150002_harden_ss_submission_transition.sql', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/orders/LiveSSSubmissionPanel.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/AdminPaymentSettings.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/api/supabaseClient.js', import.meta.url), 'utf8'),
]);
const migration = `${migrationBase}\n${migrationHardening}`;

for (const name of ['STRIPE_TEST_SECRET_KEY', 'STRIPE_TEST_WEBHOOK_SECRET', 'STRIPE_LIVE_SECRET_KEY', 'STRIPE_LIVE_WEBHOOK_SECRET']) {
  assert.match(stripeCredentials, new RegExp(name));
}
assert.match(stripeCredentials, /secretKey\?\.startsWith\(expectedPrefix\)/);
assert.match(stripeCredentials, /secret\.startsWith\(`\$\{name\}=`\)/);
assert.match(checkout, /stripe_mode/);
assert.match(checkout, /Stripe \$\{stripeMode\} mode is not configured/);
assert.match(verify, /modeFromCheckoutSessionId/);
assert.match(webhook, /constructEventAsync/);
assert.match(webhook, /event\.livemode/);
assert.match(status, /test: publicStatus\('test'\)/);
assert.match(status, /live: publicStatus\('live'\)/);
assert.match(status, /ready: credentials\[mode\]\.configured/);
assert.match(settings, /Stripe Environment/);
assert.match(settings, /Refresh status/);
assert.match(settings, /Status unavailable/);
assert.match(settings, /value="live"/);
assert.match(settings, /Switch Stripe Checkout to live mode\?/);

assert.match(migration, /ss_live_submission_enabled boolean not null default false/);
assert.match(migration, /zerotouch_live_submission_enabled boolean not null default false/);
assert.match(migration, /if not public\.is_admin\(\)/);
assert.match(migration, /begin_live_ss_submission/);
assert.match(migration, /complete_live_ss_submission/);
assert.match(migration, /ss_submission_state in \('submitting', 'submitted'\)/);

assert.match(ssFunction, /'submit_vendor_order'/);
assert.match(ssFunction, /begin_live_ss_submission/);
assert.match(ssFunction, /fail_live_ss_submission/);
assert.match(ssFunction, /complete_live_ss_submission/);
assert.match(ssFunction, /https:\/\/api\.ssactivewear\.com\/v2\/products\//);
assert.match(ssFunction, /https:\/\/api\.ssactivewear\.com\/v2\/orders\//);
assert.match(ssFunction, /testOrder: false/);
assert.match(ssFunction, /emailConfirmation: ''/);
assert.match(ssFunction, /buildSsOrderRequest/);
assert.match(ssFunction, /dry_run: true/);
assert.match(ssFunction, /submission_payload: submissionPayload/);
assert.match(ssFunction, /configured \(masked\)/);
assert.match(ssFunction, /inventory_check/);
assert.doesNotMatch(ssFunction, /zerotouch[^\n]*(?:fetch|POST)/i);

assert.match(panel, /Submit Live S&amp;S Order/);
assert.match(panel, /This will place a real S&S order\. Continue\?/);
assert.match(panel, /draft\.payment_status === 'paid'/);
assert.match(panel, /draft\.workflow_status === 'ready_to_submit_to_ss'/);
assert.match(panel, /status\?\.ss_live_submission_enabled/);

const frontend = `${panel}\n${settings}\n${sourceClient}`;
assert.doesNotMatch(frontend, /sk_(?:live|test)_[A-Za-z0-9]/);
assert.doesNotMatch(frontend, /whsec_[A-Za-z0-9]/);
assert.doesNotMatch(frontend, /SS_API_KEY|SS_ACCOUNT_NUMBER/);

console.log('Controlled live Stripe and S&S safety checks passed.');
