import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  NOTIFICATION_TEMPLATE_LABELS,
  PRODUCTION_NOTIFICATION_STATUSES,
  PRODUCTION_STATUSES,
  SUPPORT_EMAIL,
  buildNotificationTemplate,
  canTransitionProductionStatus,
  getAvailableNotificationTemplates,
  getAvailableProductionStatuses,
  isBlankOnlyOrder,
  orderHasArtwork,
  resolveNotificationTemplateKey,
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
      purchase_mode: 'customized',
      is_customized: true,
      artwork_file_url: 'supabase://customer-files/uploads/customer/artwork.png',
      decoration_method: 'DTF',
      print_placement: 'front_center',
      print_size_option: 'standard_front',
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

check(PRODUCTION_STATUSES.length === 18, 'All 18 production lifecycle statuses must be available.');
check(Object.keys(NOTIFICATION_TEMPLATE_LABELS).length === 18, 'All 18 customer notification templates must be available.');

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

const blankOrder = {
  ...baseOrder,
  order_items: [{
    product_name: 'Shaka Wear 012C2 SHGMT',
    sku: 'B012C2504',
    color: 'Black',
    size: 'M',
    quantity: 1,
    purchase_mode: 'blank',
    is_customized: false,
    artwork_file_url: '',
    decoration_method: '',
    print_placement: '',
    print_size_option: '',
  }],
};
check(isBlankOnlyOrder(blankOrder), 'Blank-only orders must be detected from line-item metadata.');
check(!orderHasArtwork(blankOrder), 'Blank-only orders must not be treated as having artwork.');
check(
  !getAvailableProductionStatuses(blankOrder).some(status => status.value.startsWith('artwork_')),
  'Blank-only production status choices must exclude artwork lifecycle states.',
);
check(
  !getAvailableNotificationTemplates(blankOrder).some(([key]) => key.startsWith('artwork_')),
  'Blank-only notification template choices must exclude artwork templates.',
);
const blankPaymentTemplate = buildNotificationTemplate('payment_confirmed', blankOrder);
check(
  blankPaymentTemplate.customer_message.includes('blank apparel order'),
  'Blank payment copy must identify a blank apparel order.',
);
const guardedBlankArtworkTemplate = buildNotificationTemplate('artwork_received', blankOrder);
check(
  guardedBlankArtworkTemplate.notification_type === 'vendor_draft_ready',
  'An artwork-received request for a blank order must resolve to vendor-draft-ready.',
);
check(
  !/artwork/i.test(guardedBlankArtworkTemplate.subject + guardedBlankArtworkTemplate.customer_message),
  'Blank-order fallback copy must not mention artwork.',
);
check(
  validateNotificationDraft('artwork_received', blankOrder)
    .some(error => error.includes('not available for blank apparel orders')),
  'Blank orders must reject artwork notification drafts.',
);
check(
  !canTransitionProductionStatus('payment_confirmed', 'artwork_received', blankOrder),
  'Blank orders must not transition into artwork production states.',
);

const customWithoutArtwork = {
  ...baseOrder,
  artwork_needs_correction: false,
  order_items: [{
    ...baseOrder.order_items[0],
    artwork_file_url: '',
  }],
};
check(!isBlankOnlyOrder(customWithoutArtwork), 'A selected custom-print option is not a blank order.');
check(!orderHasArtwork(customWithoutArtwork), 'Missing custom-print artwork must be detected.');
check(
  resolveNotificationTemplateKey('artwork_received', customWithoutArtwork) === 'artwork_needed',
  'Custom print without artwork must use artwork-needed instead of artwork-received.',
);
const artworkNeededTemplate = buildNotificationTemplate('artwork_received', customWithoutArtwork);
check(
  artworkNeededTemplate.notification_type === 'artwork_needed'
    && /artwork (?:is still )?needed/i.test(artworkNeededTemplate.customer_message),
  'Missing-artwork copy must clearly request artwork.',
);
check(
  validateNotificationDraft('artwork_received', customWithoutArtwork)
    .some(error => error.includes('Artwork has not been uploaded')),
  'Artwork-received must validate as unavailable until custom-print artwork exists.',
);
check(
  buildNotificationTemplate('artwork_received', baseOrder).notification_type === 'artwork_received',
  'Custom print with uploaded artwork must retain artwork-received.',
);
check(
  resolveNotificationTemplateKey('artwork_approved', {
    ...customWithoutArtwork,
    artwork_needs_correction: true,
  }) === 'artwork_correction_needed',
  'A custom order needing correction must use artwork-correction-needed when artwork is missing.',
);

const migrationPath = new URL(
  '../supabase/migrations/202609100001_fix_blank_order_notification_statuses.sql',
  import.meta.url,
);
const migration = fs.readFileSync(migrationPath, 'utf8').toLowerCase();

for (const expected of [
  'artwork_needs_correction',
  'artwork_attention_notes',
  'customer_notification_order_context',
  'enforce_customer_notification_order_kind',
  "'artwork_needed'",
  "'artwork_correction_needed'",
  "'order_reviewed'",
  "'vendor_draft_ready'",
  "'sent_to_fulfillment'",
  "'refunded'",
  "'artwork_under_review'",
  "'production_packet_ready'",
  "'cancelled'",
  'blank apparel order',
  "new.sent_status := 'draft'",
  'live_submission_enabled',
  'zerotouch_enabled',
]) {
  check(migration.includes(expected), `Migration must include ${expected}.`);
}

check(!migration.includes('insert into public.products'), 'Migration must not insert catalog products.');
check(!migration.includes('update public.products'), 'Migration must not update catalog products.');
check(!migration.includes('insert into public.ss_launch_batches'), 'Migration must not create a catalog batch.');
check(!migration.includes('send_email'), 'Migration must not send email.');
check(!migration.includes('zero touch orders'), 'Migration must not call ZeroTouch.');

console.log(`Customer notification workflow checks passed (${assertions} assertions).`);
