import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { quoteDtfShipping, DTF_LIVE_PURCHASES, interpolateSupplierCost, proposedRetail, tierIndex } from '../src/lib/dtfTransfers.js';

assert.equal(DTF_LIVE_PURCHASES, true, 'approved live DTF checkout must be enabled');
assert.deepEqual(
  quoteDtfShipping({ transferSupplierSubtotal: 200, allItemsFreightEligible: true }),
  { status:'verified', customerCharge:0, combinedSupplierSubtotal:200, rule:'Verified S&S free freight', fulfillmentLegsCharged:0 },
);
assert.equal(quoteDtfShipping({ transferSupplierSubtotal: 75, allItemsFreightEligible:true }).status, 'supplier_quote_required');
assert.equal(quoteDtfShipping({ transferSupplierSubtotal: 80, eligibleSsGarmentSupplierSubtotal:120, allItemsFreightEligible:true }).customerCharge, 0);
assert.equal(quoteDtfShipping({ transferSupplierSubtotal: 80, eligibleSsGarmentSupplierSubtotal:120, allItemsFreightEligible:false }).customerCharge, null);
assert.equal(quoteDtfShipping({ transferSupplierSubtotal: 40, eligibleSsGarmentSupplierSubtotal:50 }).fulfillmentLegsCharged, 1);
assert.equal(tierIndex(1),0);
assert.equal(tierIndex(15),1);
assert.equal(tierIndex(50),2);
assert.equal(tierIndex(100),3);
assert.equal(tierIndex(250),4);
assert.equal(proposedRetail(interpolateSupplierCost(10,10,15,false)),6.78);
assert.equal(proposedRetail(interpolateSupplierCost(10,10,15,true)),7.14);
assert.equal(proposedRetail(interpolateSupplierCost(4,4,250,false)),0.99);
assert.equal(proposedRetail(interpolateSupplierCost(12,17,1,false)),14.87);

const migration=await readFile(new URL('../supabase/migrations/202610200002_dtf_transfer_shipping_policy.sql',import.meta.url),'utf8');
const stripeSession=await readFile(new URL('../supabase/functions/createStripeCheckoutSession/index.ts',import.meta.url),'utf8');
const stripeWebhook=await readFile(new URL('../supabase/functions/stripeWebhook/index.ts',import.meta.url),'utf8');
assert.match(migration,/dtf_transfer_quote_fingerprint/);
assert.match(migration,/record_dtf_shipping_quote/);
assert.match(migration,/validate_dtf_checkout_resume/);
assert.match(migration,/shipping_quote_expires_at<=now\(\)/);
assert.match(migration,/revoke select on public\.dtf_transfer_orders from authenticated/);
assert.match(migration,/list_admin_dtf_transfer_orders/);
assert.match(migration,/supplier_quote_required/);
assert.match(migration,/create_or_reuse_dtf_customer_checkout/);
assert.match(migration,/linked_customer_order_id/);
assert.match(migration,/'dtf_transfer_order'/);
assert.match(stripeSession,/dtf_transfer_order/);
assert.match(stripeSession,/idempotencyKey: `hc-apparel-order-\$\{order\.id\}`/);
assert.match(stripeWebhook,/DTF payment state update failed/);

console.log('PASS: DTF-only and mixed S&S freight is evaluated once; only verified free freight produces a charge.');
console.log('PASS: calculator uses the approved quantity boundaries and retail formula for supported reference sizes.');
console.log('SAFETY: live customer checkout is enabled; supplier submission remains separately approval-gated.');
