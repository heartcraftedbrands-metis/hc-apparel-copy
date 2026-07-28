import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  NOTIFICATION_TEMPLATE_LABELS,
  PRODUCTION_NOTIFICATION_STATUSES,
  PRODUCTION_STATUSES,
  SUPPORT_EMAIL,
  buildNotificationTemplate,
  canTransitionProductionStatus,
  validateNotificationDraft,
} from '../src/lib/productionWorkflow.js';

let assertions = 0;
const check = (condition, message) => {
  assert.ok(condition, message);
  assertions += 1;
};

const baseOrder = {
  id: 'order-customer-notification-12345678',
  customer_name: 'Jordan Customer',
  customer_email: 'jordan@example.com',
  production_status: 'order_received',
  order_items: [
    {
      product_name: 'Gildan 5000 T-Shirt',
      quantity: 3,
    },
  ],
};

const contextForStatus = (status) => ({
  ...baseOrder,
  production_status: status,
  ...(status === 'shipped' ? {
    tracking_carrier: 'UPS',
    tracking_number: '1ZTEST123',
  } : {}),
  ...(status === 'issue_on_hold' ? {
    production_hold_reason: 'Please confirm the corrected artwork.',
  } : {}),
});

check(PRODUCTION_STATUSES.length === 13, 'All 13 production lifecycle statuses must be available.');
check(Object.keys(NOTIFICATION_TEMPLATE_LABELS).length === 13, 'All 13 customer notification templates must be available.');

for (const status of PRODUCTION_STATUSES) {
  const templateKey = PRODUCTION_NOTIFICATION_STATUSES[status.value];
  check(Boolean(templateKey), `${status.label} must map to a notification template.`);

  const context = contextForStatus(status.value);
  const template = buildNotificationTemplate(templateKey, context);
  check(Boolean(template.subject), `${status.label} must have a subject.`);
  check(template.customer_message.includes('Jordan Customer'), `${status.label} must include the customer name.`);
  check(template.customer_message.includes('#12345678'), `${status.label} must include the order number.`);
  check(template.customer_message.includes('Gildan 5000 T-Shirt'), `${status.label} must include the product name.`);
  check(template.customer_message.includes('Quantity: 3'), `${status.label} must include quantity.`);
  check(template.customer_message.includes('Status:'), `${status.label} must include status.`);
  check(template.customer_message.includes('Next step:'), `${status.label} must include the next step.`);
  check(template.customer_message.includes(SUPPORT_EMAIL), `${status.label} must include the support email.`);
  check(validateNotificationDraft(templateKey, context).length === 0, `${status.label} must validate with complete data.`);
}

const shippedMissingTracking = validateNotificationDraft('shipped', {
  ...baseOrder,
  production_status: 'shipped',
});
check(shippedMissingTracking.some((error) => error.includes('Carrier')), 'Shipped draft must require a carrier.');
check(shippedMissingTracking.some((error) => error.includes('Tracking number')), 'Shipped draft must require a tracking number.');

const holdMissingReason = validateNotificationDraft('order_on_hold', {
  ...baseOrder,
  production_status: 'issue_on_hold',
});
check(holdMissingReason.some((error) => error.includes('Hold reason')), 'On-hold draft must require a hold reason.');

const correctionContext = {
  ...baseOrder,
  production_status: 'artwork_under_review',
  artwork_needs_correction: true,
};
check(
  validateNotificationDraft('artwork_under_review', correctionContext)
    .some((error) => error.includes('Artwork correction details')),
  'Artwork correction draft must require customer-facing attention details.',
);
const correctionTemplate = buildNotificationTemplate('artwork_under_review', {
  ...correctionContext,
  artwork_attention_notes: 'Please provide a transparent PNG.',
});
check(
  correctionTemplate.customer_message.includes('Needs attention: Please provide a transparent PNG.'),
  'Artwork correction details must appear in the customer draft.',
);

check(
  !canTransitionProductionStatus('artwork_approved', 'completed'),
  'Completed must be blocked before shipped or delivered.',
);
check(canTransitionProductionStatus('shipped', 'completed'), 'Shipped orders may be completed.');
check(canTransitionProductionStatus('delivered', 'completed'), 'Delivered orders may be completed.');

const migrationPath = new URL(
  '../supabase/migrations/202607240016_customer_notification_draft_workflow.sql',
  import.meta.url,
);
const migration = fs.readFileSync(migrationPath, 'utf8').toLowerCase();

for (const expected of [
  'artwork_needs_correction',
  'artwork_attention_notes',
  'copied_at',
  'copied_by_email',
  'manually_sent_at',
  'manually_sent_by_email',
  "'refunded'",
  "'artwork_under_review'",
  "'production_packet_ready'",
  "'cancelled'",
  'product_loading_paused',
  'batch_sequence > 3',
  'live_submission_enabled',
]) {
  check(migration.includes(expected), `Migration must include ${expected}.`);
}

check(!migration.includes('insert into public.products'), 'Migration must not insert catalog products.');
check(!migration.includes('update public.products'), 'Migration must not update catalog products.');
check(!migration.includes('insert into public.ss_launch_batches'), 'Migration must not create a catalog batch.');
check(!migration.includes('send_email'), 'Migration must not send email.');
check(!migration.includes('zero touch orders'), 'Migration must not call ZeroTouch.');

console.log(`Customer notification workflow checks passed (${assertions} assertions).`);
