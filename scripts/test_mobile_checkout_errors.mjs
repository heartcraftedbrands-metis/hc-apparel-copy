import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildSmallOrderCheckoutPayload, validateCheckoutCart, validateCheckoutCustomer } from '../src/lib/smallOrderCheckout.js';
import { checkoutErrorMessage, CHECKOUT_CONNECT, PAYMENT_UNAVAILABLE, SIGN_IN_AGAIN } from '../src/lib/checkoutErrors.js';

const cart = [{
  product_id: 'catalog-product', product_name: 'Tultex T-Shirt', brand: 'Tultex', style_number: '10259',
  sku: 'B10259417', color: 'Heather Mellow Yellow', size: '2XL', quantity: 1, price: 7.88,
  is_customized: false, purchase_mode: 'blank',
}];
const address = { street: 'Test Street', city: 'Test City', state: 'NY', zip: '10001' };
const customer = { customer_name: 'QA Customer', customer_email: 'qa@example.com', shipping_address: address, billing_address: address };
assert.deepEqual(validateCheckoutCart(cart), []);
assert.deepEqual(validateCheckoutCustomer(customer), []);
const payload = buildSmallOrderCheckoutPayload(cart, customer);
assert.equal(payload.items[0].sku, 'B10259417');
assert.equal(payload.items[0].color, 'Heather Mellow Yellow');
assert.equal(payload.items[0].size, '2XL');
assert.equal(payload.order_total, 7.88);

assert.equal(await checkoutErrorMessage(new TypeError('Load failed'), 'order'), CHECKOUT_CONNECT);
assert.equal(await checkoutErrorMessage(new TypeError('Load failed'), 'payment'), CHECKOUT_CONNECT);
assert.equal(await checkoutErrorMessage({ status: 401, message: 'JWT expired' }, 'payment'), SIGN_IN_AGAIN);
assert.equal(await checkoutErrorMessage({ status: 400, message: 'Invalid Refresh Token' }, 'order'), SIGN_IN_AGAIN);
assert.equal(await checkoutErrorMessage({ message: 'Checkout validation failed: ["Complete shipping address is required"]' }, 'order'), 'Complete shipping address is required');
assert.equal(await checkoutErrorMessage({ message: 'Checkout validation failed: ["secret: do not show"]' }, 'order'), CHECKOUT_CONNECT);
assert.equal(await checkoutErrorMessage({ message: 'Stripe rejected secret_key_123' }, 'payment'), PAYMENT_UNAVAILABLE);
assert.equal(await checkoutErrorMessage({ cause: { context: new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401 }) } }, 'payment'), SIGN_IN_AGAIN);
assert.equal(await checkoutErrorMessage({ cause: { context: new Response(JSON.stringify({ error: 'Payment checkout could not be started' }), { status: 502 }) } }, 'payment'), PAYMENT_UNAVAILABLE);

const [checkout, functionSource, confirmation, migration] = await Promise.all([
  readFile(new URL('../src/pages/Checkout.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/functions/createStripeCheckoutSession/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/OrderConfirmation.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/202607240014_checkout_paid_vendor_draft.sql', import.meta.url), 'utf8'),
]);
assert.match(checkout, /setCreatedOrder\(\{ orderId, payloadKey \}\)/);
assert.match(checkout, /settings\.payment_mode === 'stripe' && settings\.stripe_connected/);
assert.match(checkout, /hostname !== 'checkout\.stripe\.com'/);
assert.doesNotMatch(checkout, /clearCart\(/);
assert.match(confirmation, /paymentConfirmed/);
assert.match(confirmation, /clearCart\(\)/);
assert.match(functionSource, /'Access-Control-Allow-Methods': 'POST, OPTIONS'/);
assert.match(functionSource, /if \(request\.method === 'OPTIONS'\) return respond\(\{ ok: true \}\)/);
assert.match(functionSource, /order\.payment_status === 'paid'/);
assert.match(functionSource, /idempotencyKey: `hc-apparel-order-\$\{order\.id\}`/);
assert.doesNotMatch(functionSource, /api\.ssactivewear\.com|zero[\s-]?touch\/orders/i);
assert.match(migration, /if v_order\.payment_status <> 'paid' then/);
console.log('PASS: mobile checkout payload, safe errors, payment routing, and no vendor submission');
