import assert from 'node:assert/strict';
import { DEFAULT_PAYMENT_METHOD_COSTS, orderNetMargin, paymentProtectedFloor, processingCost } from '../src/lib/paymentProcessing.js';

const amounts = [5, 10, 25, 50, 100, 200];
for (const amount of amounts) {
  const card = processingCost(amount, DEFAULT_PAYMENT_METHOD_COSTS.card);
  const afterpay = processingCost(amount, DEFAULT_PAYMENT_METHOD_COSTS.afterpay_clearpay);
  const klarna = processingCost(amount, DEFAULT_PAYMENT_METHOD_COSTS.klarna);
  assert.ok(afterpay >= klarna && klarna > card, `worst-case ordering failed at $${amount}`);
}

for (const vendorCost of amounts) {
  const desiredMargin = 3;
  const floor = paymentProtectedFloor(vendorCost, desiredMargin, DEFAULT_PAYMENT_METHOD_COSTS);
  assert.equal(floor.methodKey, 'afterpay_clearpay');
  const net = floor.amount - processingCost(floor.amount, floor.method) - vendorCost;
  assert.ok(net >= desiredMargin - 0.011, `margin floor failed at vendor cost $${vendorCost}`);
}

const realCatalogExamples = [
  { name: 'American Apparel ReFlex Crewneck', vendorCost: 14.05 },
  { name: 'Tultex 202', vendorCost: 4.88 },
];

for (const product of realCatalogExamples) {
  const floor = paymentProtectedFloor(product.vendorCost, 3, DEFAULT_PAYMENT_METHOD_COSTS);
  const protectedMargin = floor.amount - processingCost(floor.amount, floor.method) - product.vendorCost;
  assert.equal(floor.methodKey, 'afterpay_clearpay', `${product.name}: wrong worst method`);
  assert.ok(protectedMargin >= 2.99, `${product.name}: payment-protected margin failed`);
  assert.ok(Math.abs(floor.amount * 100 - Math.round(floor.amount * 100)) < 1e-8, `${product.name}: floor was not rounded to cent precision`);
}

assert.equal(orderNetMargin({
  merchandiseRevenue: 50,
  shippingRevenue: 8,
  vendorGarmentCost: 20,
  vendorShippingCost: 6,
  processingCost: 3.78,
  printCost: 4,
  otherVendorFees: 1,
  taxCollected: 99,
}), 23.22, 'net margin must deduct fulfillment/processing costs and ignore tax');

console.log('Payment method fee and safe-price calculations passed for $5, $10, $25, $50, $100, and $200 plus two verified HC Apparel vendor-cost examples.');
