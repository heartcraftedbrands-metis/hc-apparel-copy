import assert from 'node:assert/strict';
import { DEFAULT_PAYMENT_METHOD_COSTS, paymentProtectedFloor, processingCost } from '../src/lib/paymentProcessing.js';

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

console.log('Payment method fee and safe-price calculations passed for $5, $10, $25, $50, $100, and $200.');
