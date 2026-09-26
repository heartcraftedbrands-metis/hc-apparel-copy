import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const orders = readFileSync(new URL('../src/pages/AdminOrders.jsx', import.meta.url), 'utf8');
const drafts = readFileSync(new URL('../src/pages/AdminVendorOrders.jsx', import.meta.url), 'utf8');
const draftDetail = readFileSync(new URL('../src/pages/AdminVendorOrderDraft.jsx', import.meta.url), 'utf8');
const livePanel = readFileSync(new URL('../src/components/orders/LiveSSSubmissionPanel.jsx', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../src/pages/AdminDashboard.jsx', import.meta.url), 'utf8');
const inbox = readFileSync(new URL('../src/pages/AdminInbox.jsx', import.meta.url), 'utf8');
const operations = readFileSync(new URL('../src/pages/AdminOperationsDashboard.jsx', import.meta.url), 'utf8');
const analytics = readFileSync(new URL('../src/pages/AdminAnalytics.jsx', import.meta.url), 'utf8');
const client = readFileSync(new URL('../src/api/base44Client.js', import.meta.url), 'utf8');
const liveAnalyticsMigration = readFileSync(
  new URL('../supabase/migrations/202609150006_exclude_test_orders_from_live_sales_analytics.sql', import.meta.url),
  'utf8',
);
const customerNotifications = readFileSync(new URL('../src/pages/AdminCustomerNotifications.jsx', import.meta.url), 'utf8');
const migration = [
  readFileSync(new URL('../supabase/migrations/202609150003_separate_qa_test_orders.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../supabase/migrations/202609150004_separate_test_orders_from_launch_metrics.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../supabase/migrations/202609150005_archive_orphan_qa_notifications.sql', import.meta.url), 'utf8'),
].join('\n');

assert.match(orders, /order\.is_sample/);
assert.match(client, /LiveOrder:\s*\{\s*table:\s*'admin_live_orders'/);
assert.match(analytics, /entities\.LiveOrder\.list/);
assert.doesNotMatch(analytics, /entities\.Order\.list/);
assert.match(liveAnalyticsMigration, /security_invoker\s*=\s*true/);
assert.match(liveAnalyticsMigration, /excluded_from_live_metrics/);
assert.match(liveAnalyticsMigration, /stripe sandbox qa/);
assert.match(liveAnalyticsMigration, /grant select on public\.admin_live_orders to authenticated/);
assert.match(orders, /QA\/Test — Do Not Fulfill/);
assert.match(drafts, /draft\.is_sample/);
assert.match(drafts, /key: 'qa'/);
assert.match(drafts, /liveDrafts\.length/);
assert.match(draftDetail, /!form\.is_sample/);
assert.match(livePanel, /!draft\.is_sample/);
assert.match(dashboard, /filter\(order => !order\.is_sample\)/);
assert.match(inbox, /filter\(isActiveInboxOrder\)/);
assert.match(inbox, /isActiveInboxOrder/);
assert.match(operations, /filter\(\((?:order|draft|notification)\) => !(?:order|draft|notification)\.is_sample\)/);
assert.match(analytics, /Live customer orders only/);
assert.match(customerNotifications, /Live Notifications/);
assert.match(customerNotifications, /QA\/Test — Do Not Fulfill/);
assert.match(migration, /update public\.orders/);
assert.match(migration, /update public\.vendor_order_drafts/);
assert.match(migration, /update public\.vendor_orders/);
assert.match(migration, /update public\.customer_notifications/);
assert.match(migration, /2026-09-15 00:00:00\+00/);
assert.match(migration, /block_qa_test_vendor_submission/);
assert.match(migration, /QA\/Test vendor drafts cannot be submitted to S&S/);

console.log('QA/test admin separation checks passed.');
