import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const migration=read('supabase/migrations/202610230001_business_operations_intelligence.sql');
const monitor=read('supabase/functions/operations-intelligence/index.ts');
const page=read('src/pages/AdminBusinessIntelligence.jsx');
const dtf=read('src/pages/DTFTransfers.jsx');
const app=read('src/App.jsx');

assert.match(migration,/profiles_role_check[\s\S]+operations_manager/,'Operations role must be explicit');
assert.match(migration,/record_operations_dtf_shipping_quote/,'Freight must use a narrow operations RPC');
assert.doesNotMatch(migration,/supplier_submitted_at\s*=|supplier_order_number\s*=/,'Operations migration must not submit supplier orders');
assert.match(migration,/is_sample=false and payment_status='paid'/,'KPI snapshot must exclude test orders');
assert.match(migration,/shipping_cost','not available/i,'Missing shipping cost must be labeled unavailable');
assert.match(migration,/cron\.schedule\('hc-business-operations-monitor','\*\/15 \* \* \* \*'/,'Monitor must be persistent');
assert.match(monitor,/status=delivered===count/,'Provider delivery events must be reconciled separately from acceptance');
assert.match(monitor,/ordinary email replies|Replies do not authorize sensitive actions/i,'Email must preserve authentication boundaries');
assert.match(monitor,/sample_pending/,'Authorized sample must be idempotent');
assert.match(page,/min-h-12/,'Mobile controls must have touch-sized targets');
assert.match(page,/Heart Command Center remains a separate system/,'System separation must be visible');
assert.match(page,/Supplier submission remains a separate owner approval/,'Supplier purchasing gate must remain explicit');
for(const event of ['dtf_calculator_engaged','artwork_upload_success','artwork_upload_failure','freight_review_requested'])assert.ok(dtf.includes(event),`Missing DTF event ${event}`);
assert.match(app,/requiredRoles=\{\['admin','operations_manager'\]\}/,'Dashboard route must allow only owner/admin and operations manager');

console.log('Business operations safeguards verified.');
