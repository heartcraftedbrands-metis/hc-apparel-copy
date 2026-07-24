export const SS_VENDOR_ORDER_STAGES = [
  { value: 'quote_request_received', label: 'Quote Request Received' },
  { value: 'quote_reviewed', label: 'Quote Reviewed' },
  { value: 'customer_approved', label: 'Customer Approved' },
  { value: 'payment_link_sent', label: 'Payment Link Sent' },
  { value: 'payment_received', label: 'Payment Received' },
  { value: 'vendor_order_draft_created', label: 'Vendor Order Draft Created' },
  { value: 'vendor_order_reviewed', label: 'Vendor Order Reviewed' },
  { value: 'ready_to_submit_to_ss', label: 'Ready to Submit to S&S' },
  { value: 'submitted_to_ss', label: 'Submitted to S&S' },
  { value: 'vendor_order_confirmed', label: 'Vendor Order Confirmed' },
  { value: 'tracking_received', label: 'Tracking Received' },
  { value: 'completed', label: 'Completed' },
];

export const SS_VENDOR_ORDER_STAGE_MAP = Object.fromEntries(
  SS_VENDOR_ORDER_STAGES.map((stage, index) => [
    stage.value,
    { ...stage, index },
  ]),
);

export const ssVendorOrderStageLabel = (value) =>
  SS_VENDOR_ORDER_STAGE_MAP[value]?.label || value || 'Not started';
