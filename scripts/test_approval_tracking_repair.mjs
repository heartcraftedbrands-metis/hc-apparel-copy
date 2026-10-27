import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const migration=read('supabase/migrations/202610270001_approval_execution_and_verified_measurement.sql');
const dashboard=read('src/pages/AdminBusinessIntelligence.jsx');
const analytics=read('src/lib/marketingAnalytics.js');
const navigation=read('src/lib/NavigationTracker.jsx');
const product=read('src/pages/ProductDetail.jsx');
const dtf=read('src/pages/DTFTransfers.jsx');
const briefing=read('supabase/functions/operations-intelligence/index.ts');

assert.match(migration,/operations_action_executions/,'Approval must have a separate execution lifecycle');
assert.match(migration,/implementation:'\|\|p_action\.id/,'Approval must create one durable implementation task');
assert.match(migration,/on conflict\(generated_key\) do nothing/,'Implementation task creation must be idempotent');
assert.match(migration,/v_duplicate:=true/,'Repeated decisions must be detected server-side');
assert.match(migration,/Approved — awaiting implementation/,'Saved approval must not imply execution');
assert.match(migration,/worker_kind='codex_deployment'/,'The authorized experiment must record the real worker');
assert.match(migration,/status='live'/,'The authorized experiment must have an explicit live state');
assert.match(migration,/budget_cents[^;]+default 0/,'Experiment budget must remain explicit');
assert.match(migration,/dtf_cross_sell_click/,'Experiment click must be measured');
assert.match(migration,/dtf_experiment_landing/,'Experiment landing must be measured');
assert.match(migration,/paid-order triggers|paid_order_trigger/,'Purchases must use verified paid-order evidence');
assert.match(migration,/is_internal=false/,'Business KPIs must exclude internal activity');
assert.match(migration,/is_test=false/,'Business KPIs must exclude tests');
assert.match(migration,/count\(distinct session_id\)/,'Sessions must be distinct from page views');
assert.match(migration,/count\(distinct browser_id\)/,'Estimated browsers must be distinct from sessions');
assert.match(migration,/acquisition_sources/,'Acquisition sources must be separate from page paths');
assert.match(migration,/Historical baseline retained/,'Historical limitations must be preserved');
assert.match(migration,/not proof of abandonment/i,'Incomplete event counts must not be described as proven drop-off');

assert.match(dashboard,/Saving approval…/,'Mobile UI must show an immediate saving state');
assert.match(dashboard,/Approval was not saved/,'Failure must be explicit');
assert.match(dashboard,/Retry safely/,'Failure must provide a safe retry');
assert.match(dashboard,/No duplicate task was created/,'Duplicate decisions must be explained');
assert.match(dashboard,/Experiment live — measurement in progress/,'Live work must be distinguishable from approval');
assert.match(dashboard,/Detailed measurement diagnostics/,'Detailed warnings must remain available separately');
assert.match(dashboard,/Estimated browsers/,'Dashboard must not call browser estimates unique people');

assert.match(analytics,/window\.location\.pathname\.slice/,'Analytics paths must omit private query strings');
assert.match(analytics,/p_referrer_host/,'Sanitized referrer must be sent separately');
assert.match(analytics,/p_session_id/,'Session measurement must be present');
assert.match(analytics,/p_browser_id/,'Estimated browser measurement must be present');
assert.match(analytics,/p_is_internal/,'Internal activity must be marked');
assert.match(analytics,/p_is_test/,'Test activity must be marked');
assert.match(navigation,/\['admin', 'operations_manager'\]/,'Authenticated staff must be identified');
assert.match(navigation,/if \(isLoadingAuth\) return/,'Analytics must wait for authentication state before classifying a visit');
assert.match(product,/Need prints only\? Check DTF prices/,'Approved product-to-DTF link must be present');
assert.match(product,/public_dtf_cross_sell_offer/,'Only server-selected experiment targets may show the link');
assert.match(dtf,/record_owned_dtf_marketing_attribution/,'DTF attribution must survive an allowed cross-session order relationship');
assert.match(briefing,/These step counts are not proof of abandonment/,'Briefing must not overstate an incomplete funnel');
assert.match(briefing,/Open measurement health/,'Briefing must link to the exact repair status');

console.log('Approval workflow and verified measurement repair safeguards verified.');
