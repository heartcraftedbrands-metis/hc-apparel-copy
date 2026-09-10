export const SUPPORT_EMAIL = 'support@ilovehcapparel.net';

export const PRODUCTION_STATUSES = [
  { value: 'order_received', label: 'Order Received' },
  { value: 'payment_confirmed', label: 'Payment Confirmed' },
  { value: 'order_reviewed', label: 'Order Reviewed' },
  { value: 'artwork_needed', label: 'Artwork Needed' },
  { value: 'artwork_received', label: 'Artwork Received' },
  { value: 'artwork_under_review', label: 'Artwork Under Review' },
  { value: 'artwork_correction_needed', label: 'Artwork Correction Needed' },
  { value: 'artwork_approved', label: 'Artwork Approved' },
  { value: 'production_packet_ready', label: 'Production Packet Ready' },
  { value: 'vendor_draft_ready', label: 'Vendor Draft Ready' },
  { value: 'sent_to_production', label: 'Sent to Production' },
  { value: 'sent_to_fulfillment', label: 'Sent to Fulfillment' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'completed', label: 'Completed' },
  { value: 'issue_on_hold', label: 'Issue / On Hold' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'refunded', label: 'Refunded' },
];

export const PRODUCTION_STATUS_LABELS = Object.fromEntries(
  PRODUCTION_STATUSES.map(({ value, label }) => [value, label]),
);

export const PRODUCTION_NOTIFICATION_STATUSES = {
  order_received: 'order_received',
  payment_confirmed: 'payment_confirmed',
  order_reviewed: 'order_reviewed',
  artwork_needed: 'artwork_needed',
  artwork_received: 'artwork_received',
  artwork_under_review: 'artwork_under_review',
  artwork_correction_needed: 'artwork_correction_needed',
  artwork_approved: 'artwork_approved',
  production_packet_ready: 'production_packet_ready',
  vendor_draft_ready: 'vendor_draft_ready',
  sent_to_production: 'sent_to_production',
  sent_to_fulfillment: 'sent_to_fulfillment',
  shipped: 'shipped',
  delivered: 'delivered',
  completed: 'completed',
  issue_on_hold: 'order_on_hold',
  cancelled: 'cancelled',
  refunded: 'refunded',
};

export const NOTIFICATION_TEMPLATE_LABELS = {
  order_received: 'Order received',
  payment_confirmed: 'Payment confirmed',
  order_reviewed: 'Order reviewed',
  artwork_needed: 'Artwork needed',
  artwork_received: 'Artwork received',
  artwork_under_review: 'Artwork under review',
  artwork_correction_needed: 'Artwork correction needed',
  artwork_approved: 'Artwork approved',
  production_packet_ready: 'Production packet ready',
  vendor_draft_ready: 'Vendor draft ready',
  sent_to_production: 'Sent to production',
  sent_to_fulfillment: 'Sent to fulfillment',
  shipped: 'Shipped with tracking',
  delivered: 'Delivered',
  completed: 'Order completed',
  order_on_hold: 'Order on hold / needs attention',
  cancelled: 'Order cancelled',
  refunded: 'Order refunded',
};

const orderItems = (order) => (
  Array.isArray(order?.order_items)
    ? order.order_items
    : (Array.isArray(order?.items) ? order.items : [])
);

const itemIsCustomized = (item = {}) => (
  item.purchase_mode === 'customized'
  || item.is_customized === true
  || Boolean(
    item.artwork_file_url
    || item.decoration_method
    || item.print_placement
    || item.print_size_option
  )
);

export const orderHasCustomPrinting = (order = {}) => orderItems(order).some(itemIsCustomized);

export const orderHasArtwork = (order = {}) => orderItems(order).some(
  item => Boolean(String(item?.artwork_file_url || '').trim()),
);

export const isBlankOnlyOrder = (order = {}) => (
  orderItems(order).length > 0 && !orderHasCustomPrinting(order)
);

const ARTWORK_NOTIFICATION_TYPES = new Set([
  'artwork_needed',
  'artwork_received',
  'artwork_under_review',
  'artwork_correction_needed',
  'artwork_approved',
  'production_packet_ready',
]);

const ARTWORK_REQUIRES_UPLOAD_TYPES = new Set([
  'artwork_received',
  'artwork_under_review',
  'artwork_approved',
  'production_packet_ready',
]);

export const resolveNotificationTemplateKey = (templateKey, order = {}) => {
  if (isBlankOnlyOrder(order) && ARTWORK_NOTIFICATION_TYPES.has(templateKey)) {
    return templateKey === 'artwork_received' ? 'vendor_draft_ready' : 'order_reviewed';
  }
  if (
    orderHasCustomPrinting(order)
    && !orderHasArtwork(order)
    && ARTWORK_REQUIRES_UPLOAD_TYPES.has(templateKey)
  ) {
    return order.artwork_needs_correction ? 'artwork_correction_needed' : 'artwork_needed';
  }
  return templateKey;
};

export const getAvailableProductionStatuses = (order = {}) => PRODUCTION_STATUSES.filter(({ value }) => {
  if (isBlankOnlyOrder(order)) return !ARTWORK_NOTIFICATION_TYPES.has(value);
  if (orderHasCustomPrinting(order) && !orderHasArtwork(order)) {
    return !ARTWORK_REQUIRES_UPLOAD_TYPES.has(value);
  }
  return true;
});

export const getAvailableNotificationTemplates = (order = {}) => Object.entries(
  NOTIFICATION_TEMPLATE_LABELS,
).filter(([key]) => {
  if (isBlankOnlyOrder(order)) return !ARTWORK_NOTIFICATION_TYPES.has(key);
  if (orderHasCustomPrinting(order) && !orderHasArtwork(order)) {
    return !ARTWORK_REQUIRES_UPLOAD_TYPES.has(key);
  }
  return true;
});

const firstItem = (order) => orderItems(order)[0] || {};

const readArtworkAttention = (order = {}) =>
  order.artwork_attention_notes
  || order.artwork_correction_notes
  || order.customer_artwork_notes
  || '';

export const getOrderSummary = (order = {}) => {
  const items = orderItems(order);
  const quantity = items.reduce(
    (total, item) => total + Number(item.quantity || item.qty || 0),
    0,
  ) || Number(order.quantity || 0);
  const item = firstItem(order);

  return {
    customerName: order.customer_name || 'Customer',
    customerEmail: order.customer_email || '',
    orderNumber: order.id ? `#${order.id.slice(-8).toUpperCase()}` : 'your order',
    productName: item.product_name || item.name || order.product_name || order.garment_type || 'HC Apparel order',
    quantity,
    status: PRODUCTION_STATUS_LABELS[order.production_status] || 'Order Received',
    trackingNumber: order.tracking_number || '',
    carrier: order.tracking_carrier || order.carrier || '',
    holdReason: order.production_hold_reason || order.hold_reason || '',
    artworkNeedsCorrection: Boolean(order.artwork_needs_correction),
    artworkAttention: readArtworkAttention(order),
    blankOnly: isBlankOnlyOrder(order),
    hasArtwork: orderHasArtwork(order),
  };
};

const formatMessage = (data, status, nextStep, body, extraLines = []) => {
  const details = [
    `Order: ${data.orderNumber}`,
    `Product: ${data.productName}`,
    `Quantity: ${data.quantity || '—'}`,
    `Status: ${status}`,
    ...extraLines.filter(Boolean),
  ].join('\n');

  return `Hi ${data.customerName},\n\n${body}\n\n${details}\n\nNext step: ${nextStep}\n\nQuestions? Contact us at ${SUPPORT_EMAIL}.`;
};

export const buildNotificationTemplate = (templateKey, order = {}) => {
  const data = getOrderSummary(order);
  const safeTemplateKey = resolveNotificationTemplateKey(templateKey, order);
  const templates = {
    order_received: {
      subject: `We received ${data.orderNumber}`,
      status: 'Order Received',
      nextStep: 'We will confirm payment and review the order details.',
      body: data.blankOnly
        ? 'We received your blank apparel order.'
        : 'We received your HC Apparel custom print order.',
    },
    payment_confirmed: {
      subject: `Payment confirmed for ${data.orderNumber}`,
      status: 'Payment Confirmed',
      nextStep: data.blankOnly
        ? 'We will review your blank apparel order and prepare it for fulfillment.'
        : (data.hasArtwork
          ? 'We will review your artwork and customization details.'
          : 'Please provide the artwork required for your custom print order.'),
      body: data.blankOnly
        ? 'Payment has been confirmed for your blank apparel order.'
        : 'Your custom print order payment has been confirmed.',
    },
    order_reviewed: {
      subject: `Order reviewed for ${data.orderNumber}`,
      status: 'Order Reviewed',
      nextStep: data.blankOnly
        ? 'We will prepare the blank apparel order for fulfillment.'
        : 'We will prepare the order for its next production step.',
      body: data.blankOnly
        ? 'We reviewed your blank apparel order.'
        : 'We reviewed your HC Apparel order.',
    },
    artwork_needed: {
      subject: `Artwork needed for ${data.orderNumber}`,
      status: 'Artwork Needed',
      nextStep: 'Please provide the print-ready artwork so we can review your custom print order.',
      body: 'We still need artwork for your custom print order.',
    },
    artwork_received: {
      subject: `Artwork received for ${data.orderNumber}`,
      status: 'Artwork Received',
      nextStep: 'Our team will review the artwork for production.',
      body: 'We received the artwork for your order.',
    },
    artwork_under_review: {
      subject: `Artwork review update for ${data.orderNumber}`,
      status: 'Artwork Under Review',
      nextStep: data.artworkNeedsCorrection
        ? 'Please review the requested artwork correction and reply when it is ready.'
        : 'We will notify you as soon as the artwork review is complete.',
      body: 'Your artwork is currently under review.',
      extraLines: data.artworkNeedsCorrection
        ? [`Needs attention: ${data.artworkAttention || 'Please contact us for correction details.'}`]
        : [],
    },
    artwork_correction_needed: {
      subject: `Artwork correction needed for ${data.orderNumber}`,
      status: 'Artwork Correction Needed',
      nextStep: 'Please provide corrected artwork so we can continue preparing your custom print order.',
      body: 'Your custom print order needs corrected artwork before production.',
      extraLines: [`Needs attention: ${data.artworkAttention || 'Please contact us for correction details.'}`],
    },
    artwork_approved: {
      subject: `Artwork approved for ${data.orderNumber}`,
      status: 'Artwork Approved',
      nextStep: 'We are preparing the production packet.',
      body: 'Your artwork has been approved.',
    },
    production_packet_ready: {
      subject: `Production packet ready for ${data.orderNumber}`,
      status: 'Production Packet Ready',
      nextStep: 'The order will be released to production after final internal review.',
      body: 'Your production instructions and artwork packet are ready.',
    },
    vendor_draft_ready: {
      subject: `Fulfillment preparation ready for ${data.orderNumber}`,
      status: 'Vendor Draft Ready',
      nextStep: 'Our team will review the fulfillment details before releasing the order.',
      body: data.blankOnly
        ? 'Your blank apparel order is ready for fulfillment preparation.'
        : 'Your order is ready for fulfillment preparation.',
    },
    sent_to_production: {
      subject: `${data.orderNumber} has been sent to production`,
      status: 'Sent to Production',
      nextStep: 'We will notify you again when the order ships.',
      body: 'Your order has been sent to production.',
    },
    sent_to_fulfillment: {
      subject: `${data.orderNumber} has been sent to fulfillment`,
      status: 'Sent to Fulfillment',
      nextStep: 'We will notify you again when the order ships.',
      body: data.blankOnly
        ? 'Your blank apparel order has been sent to fulfillment.'
        : 'Your order has been sent to fulfillment.',
    },
    shipped: {
      subject: `${data.orderNumber} has shipped`,
      status: 'Shipped',
      nextStep: 'Use the tracking number below to follow the shipment.',
      body: 'Your order has shipped.',
      extraLines: [
        `Carrier: ${data.carrier || '—'}`,
        `Tracking number: ${data.trackingNumber || '—'}`,
      ],
    },
    delivered: {
      subject: `${data.orderNumber} was delivered`,
      status: 'Delivered',
      nextStep: 'Please inspect the order and contact us if anything needs attention.',
      body: 'The carrier reports that your order has been delivered.',
    },
    completed: {
      subject: `${data.orderNumber} is complete`,
      status: 'Completed',
      nextStep: 'No further action is required. Thank you for your business.',
      body: 'Your HC Apparel order is complete.',
    },
    order_on_hold: {
      subject: `Action may be needed for ${data.orderNumber}`,
      status: 'Issue / On Hold',
      nextStep: 'Please review the reason below and contact us so we can continue.',
      body: 'Your order is currently on hold and needs attention.',
      extraLines: [`Hold reason: ${data.holdReason || '—'}`],
    },
    cancelled: {
      subject: `${data.orderNumber} was cancelled`,
      status: 'Cancelled',
      nextStep: 'Contact us if you have questions about the cancellation.',
      body: 'Your order has been cancelled.',
    },
    refunded: {
      subject: `Refund update for ${data.orderNumber}`,
      status: 'Refunded',
      nextStep: 'Please allow your payment provider’s normal processing time for the refund.',
      body: 'A refund has been recorded for your order.',
    },
  };
  const template = templates[safeTemplateKey];

  return {
    notification_type: safeTemplateKey,
    label: NOTIFICATION_TEMPLATE_LABELS[safeTemplateKey] || 'Customer update',
    subject: template?.subject || `Update for ${data.orderNumber}`,
    customer_message: template
      ? formatMessage(data, template.status, template.nextStep, template.body, template.extraLines)
      : '',
    next_step: template?.nextStep || '',
    related_status: safeTemplateKey,
  };
};

export const validateNotificationDraft = (templateKey, order = {}) => {
  const data = getOrderSummary(order);
  const errors = [];

  if (!data.customerEmail) errors.push('Customer email is required.');
  if (isBlankOnlyOrder(order) && ARTWORK_NOTIFICATION_TYPES.has(templateKey)) {
    errors.push('Artwork notifications are not available for blank apparel orders.');
  }
  if (
    orderHasCustomPrinting(order)
    && !orderHasArtwork(order)
    && ARTWORK_REQUIRES_UPLOAD_TYPES.has(templateKey)
  ) {
    errors.push('Artwork has not been uploaded; use Artwork Needed or Artwork Correction Needed.');
  }
  if (templateKey === 'shipped' && !data.carrier) errors.push('Carrier is required for a shipped notification.');
  if (templateKey === 'shipped' && !data.trackingNumber) errors.push('Tracking number is required for a shipped notification.');
  if (templateKey === 'order_on_hold' && !data.holdReason) errors.push('Hold reason is required for an on-hold notification.');
  if (templateKey === 'artwork_under_review' && data.artworkNeedsCorrection && !data.artworkAttention) {
    errors.push('Artwork correction details are required when the artwork needs attention.');
  }
  if (
    templateKey === 'completed'
    && !['shipped', 'delivered', 'completed'].includes(order.production_status)
  ) {
    errors.push('The order must be shipped or delivered before creating a completed notification.');
  }

  return errors;
};

export const canTransitionProductionStatus = (currentStatus, nextStatus, order = null) => (
  (!order || getAvailableProductionStatuses(order).some(status => status.value === nextStatus))
  && (
    nextStatus !== 'completed'
    || ['shipped', 'delivered', 'completed'].includes(currentStatus)
  )
);

export const buildMailtoUrl = (email, subject, message) =>
  `mailto:${encodeURIComponent(email || '')}?subject=${encodeURIComponent(subject || '')}&body=${encodeURIComponent(message || '')}`;
