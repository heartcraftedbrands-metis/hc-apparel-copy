export const SUPPORT_EMAIL = 'support@ilovehcapparel.net';

export const PRODUCTION_STATUSES = [
  { value: 'order_received', label: 'Order Received' },
  { value: 'payment_confirmed', label: 'Payment Confirmed' },
  { value: 'artwork_received', label: 'Artwork Received' },
  { value: 'artwork_under_review', label: 'Artwork Under Review' },
  { value: 'artwork_approved', label: 'Artwork Approved' },
  { value: 'production_packet_ready', label: 'Production Packet Ready' },
  { value: 'sent_to_production', label: 'Sent to Production' },
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
  artwork_received: 'artwork_received',
  artwork_under_review: 'artwork_under_review',
  artwork_approved: 'artwork_approved',
  production_packet_ready: 'production_packet_ready',
  sent_to_production: 'sent_to_production',
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
  artwork_received: 'Artwork received',
  artwork_under_review: 'Artwork under review',
  artwork_approved: 'Artwork approved',
  production_packet_ready: 'Production packet ready',
  sent_to_production: 'Sent to production',
  shipped: 'Shipped with tracking',
  delivered: 'Delivered',
  completed: 'Order completed',
  order_on_hold: 'Order on hold / needs attention',
  cancelled: 'Order cancelled',
  refunded: 'Order refunded',
};

const firstItem = (order) => (Array.isArray(order?.order_items) ? order.order_items[0] : null) || {};

const readArtworkAttention = (order = {}) =>
  order.artwork_attention_notes
  || order.artwork_correction_notes
  || order.customer_artwork_notes
  || '';

export const getOrderSummary = (order = {}) => {
  const items = Array.isArray(order.order_items) ? order.order_items : [];
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
  const templates = {
    order_received: {
      subject: `We received ${data.orderNumber}`,
      status: 'Order Received',
      nextStep: 'We will confirm payment and review the order details.',
      body: 'We received your HC Apparel order.',
    },
    payment_confirmed: {
      subject: `Payment confirmed for ${data.orderNumber}`,
      status: 'Payment Confirmed',
      nextStep: 'We will review your artwork and customization details.',
      body: 'Your payment has been confirmed.',
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
    sent_to_production: {
      subject: `${data.orderNumber} has been sent to production`,
      status: 'Sent to Production',
      nextStep: 'We will notify you again when the order ships.',
      body: 'Your order has been sent to production.',
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
  const template = templates[templateKey];

  return {
    notification_type: templateKey,
    label: NOTIFICATION_TEMPLATE_LABELS[templateKey] || 'Customer update',
    subject: template?.subject || `Update for ${data.orderNumber}`,
    customer_message: template
      ? formatMessage(data, template.status, template.nextStep, template.body, template.extraLines)
      : '',
    next_step: template?.nextStep || '',
    related_status: templateKey,
  };
};

export const validateNotificationDraft = (templateKey, order = {}) => {
  const data = getOrderSummary(order);
  const errors = [];

  if (!data.customerEmail) errors.push('Customer email is required.');
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

export const canTransitionProductionStatus = (currentStatus, nextStatus) =>
  nextStatus !== 'completed'
  || ['shipped', 'delivered', 'completed'].includes(currentStatus);

export const buildMailtoUrl = (email, subject, message) =>
  `mailto:${encodeURIComponent(email || '')}?subject=${encodeURIComponent(subject || '')}&body=${encodeURIComponent(message || '')}`;
