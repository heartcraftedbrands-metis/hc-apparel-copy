import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  BULK_QUOTE_MINIMUM,
  BULK_QUOTE_MINIMUM_MESSAGE,
  isBulkQuoteQuantity,
} from '../src/lib/quoteRules.js';
import { createOrderHelpUrl } from '../src/lib/orderHelp.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');

const [
  requestQuote,
  homeQuote,
  contact,
  productDetail,
  garmentCard,
  adminQuotes,
  adminQuoteDetail,
  vendorMigration,
  minimumMigration,
] = await Promise.all([
  read('src/pages/RequestQuote.jsx'),
  read('src/components/home/HomeQuoteRequest.jsx'),
  read('src/pages/Contact.jsx'),
  read('src/pages/ProductDetail.jsx'),
  read('src/components/shop/GarmentProductCard.jsx'),
  read('src/pages/AdminQuoteRequests.jsx'),
  read('src/pages/AdminQuoteRequestDetail.jsx'),
  read('supabase/migrations/202607240008_ss_vendor_order_workflow.sql'),
  read('supabase/migrations/202607240009_bulk_quote_minimum.sql'),
]);

const pass = (label) => console.log(`PASS: ${label}`);

assert.equal(BULK_QUOTE_MINIMUM, 50);
assert.equal(isBulkQuoteQuantity(49), false);
assert.equal(isBulkQuoteQuantity('49'), false);
assert.match(requestQuote, /isBulkQuoteQuantity\(form\.quantity\)/);
assert.match(homeQuote, /isBulkQuoteQuantity\(form\.quantity\)/);
assert.match(requestQuote, /min=\{BULK_QUOTE_MINIMUM\}/);
assert.match(minimumMigration, /new\.quantity < 50/);
assert.ok(minimumMigration.includes(BULK_QUOTE_MINIMUM_MESSAGE));
assert.match(minimumMigration, /before insert or update of quantity/);
assert.match(minimumMigration, /product_loading_paused is distinct from true/);
assert.doesNotMatch(minimumMigration, /\b(insert into|update|delete from)\s+public\.products\b/i);
pass('Quantity 49 is rejected by both public forms and the database guard');

assert.equal(isBulkQuoteQuantity(50), true);
assert.equal(isBulkQuoteQuantity('50'), true);
assert.equal(isBulkQuoteQuantity(50.5), false);
assert.match(requestQuote, /submitQuoteRequest/);
assert.match(homeQuote, /submitQuoteRequest/);
pass('Quantity 50 is accepted for bulk quote submission');

const orderHelpUrl = createOrderHelpUrl({
  product: 'Gildan 5000',
  quantity: 12,
  color: 'Black',
  size: 'L',
  sku: 'G5000-BLK-L',
});
assert.ok(orderHelpUrl.startsWith('/Contact?'));
assert.ok(orderHelpUrl.includes('mode=order-help'));
assert.ok(orderHelpUrl.includes('quantity=12'));
assert.match(contact, /submitContactMessage/);
assert.match(contact, /orders of 1–49 items/);
assert.match(productDetail, /createOrderHelpUrl/);
assert.match(garmentCard, /createOrderHelpUrl/);
pass('Request Order Help remains a separate contact flow for smaller orders');

assert.match(adminQuotes, /r\.quantity/);
assert.match(adminQuotes, /50 or more/);
pass('Admin quote requests continue to display bulk quantities');

assert.match(adminQuoteDetail, /create_ss_vendor_order_draft_from_quote/);
assert.match(vendorMigration, /v_payment_received :=/);
assert.match(vendorMigration, /and v_payment_received/);
assert.match(vendorMigration, /live_submission_enabled = false/);
pass('Approved and paid quotes retain the vendor draft workflow with live submission disabled');

console.log('All bulk quote and vendor-order regression checks passed.');
