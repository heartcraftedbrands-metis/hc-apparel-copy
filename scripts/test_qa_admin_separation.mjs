import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const orders = readFileSync(new URL('../src/pages/AdminOrders.jsx', import.meta.url), 'utf8');
const drafts = readFileSync(new URL('../src/pages/AdminVendorOrders.jsx', import.meta.url), 'utf8');
const draftDetail = readFileSync(new URL('../src/pages/AdminVendorOrderDraft.jsx', import.meta.url), 'utf8');
const livePanel = readFileSync(new URL('../src/components/orders/LiveSSSubmissionPanel.jsx', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/202609150003_separate_qa_test_orders.sql', import.meta.url), 'utf8');

assert.match(orders, /order\.is_sample/);
assert.match(orders, /QA\/Test — Do Not Fulfill/);
assert.match(drafts, /draft\.is_sample/);
assert.match(drafts, /key: 'qa'/);
assert.match(draftDetail, /!form\.is_sample/);
assert.match(livePanel, /!draft\.is_sample/);
assert.match(migration, /update public\.orders/);
assert.match(migration, /update public\.vendor_order_drafts/);
assert.match(migration, /block_qa_test_vendor_submission/);
assert.match(migration, /QA\/Test vendor drafts cannot be submitted to S&S/);

console.log('QA/test admin separation checks passed.');
