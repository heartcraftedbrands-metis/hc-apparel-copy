import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isCheckoutIssueOrder } from '../src/lib/inboxFilters.js';
import { checkoutErrorMessage, PAYMENT_UNAVAILABLE, SIGN_IN_AGAIN } from '../src/lib/checkoutErrors.js';

const base = { checkout_source: 'customized_small_order', stripe_session_id: null };
assert.equal(isCheckoutIssueOrder({ ...base, payment_status: 'checkout_pending' }), true);
assert.equal(isCheckoutIssueOrder({ ...base, payment_status: 'checkout_failed' }), true);
assert.equal(isCheckoutIssueOrder({ ...base, payment_status: 'awaiting_payment' }), true);
assert.equal(isCheckoutIssueOrder({ ...base, payment_status: 'awaiting_payment', payment_method: 'Manual' }), false);
assert.equal(isCheckoutIssueOrder({ ...base, payment_status: 'awaiting_payment', stripe_session_id: 'cs_live_123' }), false);
assert.equal(isCheckoutIssueOrder({ ...base, payment_status: 'paid', stripe_session_id: 'cs_live_123' }), false);

assert.equal(await checkoutErrorMessage({ status: 401 }, 'payment'), SIGN_IN_AGAIN);
assert.equal(await checkoutErrorMessage({ message: 'Stripe session unavailable' }, 'payment'), PAYMENT_UNAVAILABLE);
assert.match(PAYMENT_UNAVAILABLE, /refresh and try again/);

const edge = readFileSync(new URL('../supabase/functions/createStripeCheckoutSession/index.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/202609180001_checkout_start_issues.sql', import.meta.url), 'utf8');
const checkout = readFileSync(new URL('../src/pages/Checkout.jsx', import.meta.url), 'utf8');
assert.match(migration, /new\.status := 'checkout_pending'/);
assert.match(edge, /status: 'checkout_failed'/);
assert.match(edge, /stripe_session_id: session\.id/);
assert.match(edge, /status: 'awaiting_payment'/);
assert.match(edge, /ORDER_ALREADY_PAID/);
assert.match(edge, /adminRetry/);
assert.match(edge, /adminHealthCheck/);
assert.match(edge, /session\.livemode !== \(stripeMode === 'live'\)/);
assert.doesNotMatch(checkout, /clearCart\(/);
console.log('PASS: failed checkout isolation, manual/Stripe distinction, safe errors, and paid-order guards');
