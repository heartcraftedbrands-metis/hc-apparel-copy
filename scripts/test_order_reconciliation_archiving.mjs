import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clearCheckoutAttempt, getOrCreateCheckoutAttempt } from '../src/lib/checkoutCompletion.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../supabase/migrations/202610030001_reconcile_orders_and_archive_test_data.sql');
const archiveLockMigration = read('../supabase/migrations/202610030005_lock_archived_test_orders.sql');
const checkout = read('../src/pages/Checkout.jsx');
const pricing = read('../supabase/functions/checkout-pricing/index.ts');
const webhook = read('../supabase/functions/stripeWebhook/index.ts');
const verification = read('../supabase/functions/verifyStripePayment/index.ts');
const inbox = read('../src/pages/AdminInbox.jsx');
const detail = read('../src/pages/AdminOrderDetail.jsx');
const orders = read('../src/pages/AdminOrders.jsx');

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const storage = new MemoryStorage();
const first = getOrCreateCheckoutAttempt(storage, 'same-cart');
assert.equal(getOrCreateCheckoutAttempt(storage, 'same-cart'), first);
assert.notEqual(getOrCreateCheckoutAttempt(storage, 'changed-cart'), first);
clearCheckoutAttempt(storage);
assert.notEqual(getOrCreateCheckoutAttempt(storage, 'changed-cart'), first);

assert.match(checkout, /checkout_attempt_key: checkoutAttemptKey/);
assert.match(pricing, /create_or_reuse_small_order_checkout/);
assert.match(migration, /orders_owner_checkout_attempt_unique/);
assert.match(migration, /pg_advisory_xact_lock/);

assert.match(webhook, /stripe_webhook_events/);
assert.match(webhook, /payment_confirmation_source: 'stripe_webhook'/);
assert.match(webhook, /\.neq\('payment_status', 'paid'\)/);
assert.match(verification, /payment_confirmation_source: 'stripe_verification'/);
assert.match(verification, /\.neq\('payment_status', 'paid'\)/);
assert.match(migration, /Verified Stripe payment is required before fulfillment/);
assert.doesNotMatch(inbox, /Order\.update\(order\.id, paidData\)/);
assert.match(detail, /Stripe checkout payments can only be marked paid after server-side verification/);

for (const suffix of ['a00017', 'b25b48']) assert.match(migration.toLowerCase(), new RegExp(suffix));
assert.match(migration, /purge_after = archived_at \+ interval '6 months'/);
assert.match(migration, /purge-expired-hc-test-archives/);
assert.match(migration, /select public\.purge_expired_test_archives\(\)/);
assert.match(migration, /stripe_session_id like 'cs_test_%'/);
assert.doesNotMatch(migration, /customer_name.*~.*test/is);
assert.match(migration, /test_review_required = true/);
assert.match(migration, /customer_profile_deleted', false/);
assert.match(migration, /external_provider_records_deleted', false/);
assert.match(archiveLockMigration, /Archived test orders are read-only until scheduled purge/);
assert.match(archiveLockMigration, /before update on public\.orders/);
assert.match(detail, /Restricted test archive — read only/);

assert.match(orders, /Archived Test/);
assert.match(orders, /Scheduled deletion/);
assert.match(orders, /Provider records and backups follow their own retention policies/);
assert.match(orders, /md:hidden/);
assert.match(orders, /hidden overflow-x-auto md:block/);

console.log('Order reconciliation and six-month test archive checks passed.');
