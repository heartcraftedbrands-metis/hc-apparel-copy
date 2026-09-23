import assert from 'node:assert/strict';
import { isLiveTaxOrder, quarterRange, quarterlyDataCheck, summarizeQuarter, toCsv } from '../src/lib/quarterlyTax.js';

const paid = {
  id: 'ORDER-1', created_date: '2026-07-10T12:00:00Z', updated_date: '2026-07-10T12:00:00Z',
  payment_status: 'paid', status: 'paid', amount_paid: 118, product_subtotal: 100,
  shipping_amount: 10, sales_tax_amount: 8, printing_revenue: 0, actual_processing_cost: 4,
  vendor_garment_cost: 50, actual_vendor_shipping: 5, actual_shipping_cost: 0, other_vendor_fees: 1,
  payment_method_type: 'card', fulfillment_source: 'ss_activewear', shipping_address: { state: 'GA', zip: '30338' },
  _saleInPeriod: true, _refundInPeriod: false,
};
const testOrder = { ...paid, id: 'QA-1', is_sample: true };

assert.equal(isLiveTaxOrder(paid), true);
assert.equal(isLiveTaxOrder(testOrder), false);
const range = quarterRange(2026, 3);
assert.equal(range.key, '2026-Q3');
const summary = summarizeQuarter([paid]);
assert.equal(summary.grossSales, 110);
assert.equal(summary.salesTax, 8);
assert.equal(summary.grossProfit, 50);
assert.equal(summary.netSales, 110, 'tax must not be counted as revenue');
assert.equal(quarterlyDataCheck([paid]).status, 'passed');
const csv = toCsv(['Name', 'Amount'], [['Quoted, value', 12.5]]);
assert.ok(csv.startsWith('\uFEFF'));
assert.ok(csv.includes('"Quoted, value",12.5'));
console.log('Quarterly Tax Center calculation and CSV tests passed.');
