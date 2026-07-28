import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  buildSmallOrderCheckoutPayload,
  getVendorDraftWarnings,
  validateCheckoutCart,
  validateCheckoutCustomer,
} from '../src/lib/smallOrderCheckout.js';

const completeItem = {
  id: 'product-1',
  product_id: 'product-1',
  name: 'Gildan 5000',
  product_name: 'Gildan 5000',
  brand: 'Gildan',
  style_number: '5000',
  sku: 'G5000-BLK-M',
  color: 'Black',
  size: 'M',
  quantity: 1,
  price: 12.99,
  artwork_file_url: 'supabase://customer-files/uploads/user-id/artwork.png',
  artwork_file_name: 'artwork.png',
  decoration_method: 'DTF',
  print_placement: 'front_center',
  print_size_option: 'standard_front',
  print_notes: 'Center two inches below collar.',
};

const customer = {
  customer_name: 'Test Customer',
  customer_email: 'customer@example.com',
  customer_phone: '555-0100',
  shipping_address: {
    street: '123 Main St',
    city: 'Columbus',
    state: 'OH',
    zip: '43215',
    country: 'USA',
  },
  billing_address: {
    street: '123 Main St',
    city: 'Columbus',
    state: 'OH',
    zip: '43215',
    country: 'USA',
  },
  shipping_method: 'standard',
};

assert.ok(
  validateCheckoutCart([{ ...completeItem, artwork_file_url: '' }])
    .some(error => error.includes('private artwork')),
  'cart with missing artwork cannot checkout',
);
assert.deepEqual(validateCheckoutCart([completeItem]), [], 'complete customization reaches checkout');
const blankItem = {
  ...completeItem,
  is_customized: false,
  purchase_mode: 'blank',
  artwork_file_url: '',
  artwork_file_name: '',
  decoration_method: '',
  print_placement: '',
  print_size_option: '',
};
assert.deepEqual(
  validateCheckoutCart([blankItem]),
  [],
  'blank apparel checkout does not require artwork or decoration',
);
assert.deepEqual(validateCheckoutCustomer(customer), [], 'complete customer and addresses pass');

const payload = buildSmallOrderCheckoutPayload([completeItem], customer);
assert.equal(payload.items[0].artwork_file_url, completeItem.artwork_file_url);
assert.equal(payload.items[0].decoration_method, 'DTF');
assert.equal(payload.items[0].print_placement, 'front_center');
assert.equal(payload.items[0].print_size_option, 'standard_front');
assert.equal(payload.items[0].style_number, '5000');
assert.equal(payload.shipping_address.zip, '43215');
assert.equal(payload.order_total, 12.99);
const blankPayload = buildSmallOrderCheckoutPayload([blankItem], customer);
assert.equal(blankPayload.items[0].purchase_mode, 'blank');
assert.equal(blankPayload.items[0].is_customized, false);

assert.ok(
  getVendorDraftWarnings({ items: [completeItem], shipping_address: customer.shipping_address, payment_status: 'unpaid' })
    .includes('Unpaid order'),
  'unpaid order is warned and blocked server-side',
);
assert.deepEqual(
  getVendorDraftWarnings({ items: [completeItem], shipping_address: customer.shipping_address, payment_status: 'paid' }),
  [],
  'paid complete draft has no checkout warnings',
);
assert.deepEqual(
  getVendorDraftWarnings({
    items: [blankItem],
    shipping_address: customer.shipping_address,
    payment_status: 'paid',
  }),
  [],
  'paid blank-apparel draft does not warn about optional artwork',
);

const [migration, checkout, adapter, confirmation, adminOrder, createPayment, verifyPayment] = await Promise.all([
  readFile(new URL('../supabase/migrations/202607280010_blank_first_storefront_fix.sql', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/Checkout.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/api/base44Client.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/OrderConfirmation.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/AdminOrderDetail.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/functions/createStripeCheckoutSession/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/functions/verifyStripePayment/index.ts', import.meta.url), 'utf8'),
]);

assert.match(migration, /create or replace function public\.small_order_required_data_errors/);
assert.match(migration, /v_is_customized/);
assert.match(migration, /artwork_file_url/);
assert.match(migration, /decoration_method/);
assert.match(migration, /print_placement/);
assert.match(migration, /print_size_option/);
assert.match(migration, /shipping_address/);
assert.match(migration, /v_product\.sale_price, v_product\.price/);
assert.match(migration, /live_submission_enabled is true/);
assert.match(migration, /product_loading_paused is not true or max_batch_sequence <> 3/);
assert.doesNotMatch(migration, /\b(insert into|update|delete from)\s+public\.products\b/i);

assert.match(checkout, /validateCheckoutCart/);
assert.match(checkout, /Create Order & Continue to Payment/);
assert.match(checkout, /createSmallOrderCheckout/);
assert.match(adapter, /createSmallOrderCheckout: \['create_small_order_checkout'/);
assert.match(adapter, /createVendorDraftFromPaidOrder/);
assert.match(confirmation, /notification drafts are prepared/);
assert.match(adminOrder, /Create Vendor Draft/);
assert.match(createPayment, /checkout_source !== 'customized_small_order'/);
assert.match(createPayment, /STRIPE_SECRET_KEY/);
assert.match(verifyPayment, /payment_status: 'paid'/);
assert.match(verifyPayment, /vendor_draft_prepared_by_database: true/);
assert.doesNotMatch(createPayment + verifyPayment, /api\.ssactivewear\.com|zero[\s-]?touch\/orders/i);

console.log('PASS: secure checkout validation and paid-order vendor-draft connection checks');
