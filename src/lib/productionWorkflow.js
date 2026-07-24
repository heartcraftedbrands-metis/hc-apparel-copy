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
];

export const PRODUCTION_STATUS_LABELS = Object.fromEntries(
  PRODUCTION_STATUSES.map(({ value, label }) => [value, label]),
);

export const PRODUCTION_NOTIFICATION_STATUSES = {
  payment_confirmed: 'order_received_payment_confirmed',
  artwork_received: 'artwork_received',
  artwork_approved: 'artwork_approved',
  sent_to_production: 'sent_to_production',
  shipped: 'shipped',
  completed: 'completed',
  issue_on_hold: 'order_on_hold',
};

export const NOTIFICATION_TEMPLATE_LABELS = {
  order_received_payment_confirmed: 'Order received / payment confirmed',
  artwork_received: 'Artwork received',
  artwork_approved: 'Artwork approved',
  sent_to_production: 'Sent to production',
  shipped: 'Shipped with tracking',
  completed: 'Order completed',
  order_on_hold: 'Order on hold / needs attention',
};

const firstItem = (order) => (Array.isArray(order?.order_items) ? order.order_items[0] : null) || {};

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
    productName: item.product_name || item.name || order.garment_type || 'HC Apparel order',
    quantity,
    status: PRODUCTION_STATUS_LABELS[order.production_status] || 'Order Received',
    trackingNumber: order.tracking_number || '',
    carrier: order.tracking_carrier || '',
    holdReason: order.production_hold_reason || '',
  };
};

export const buildNotificationTemplate = (templateKey, order = {}) => {
  const data = getOrderSummary(order);
  const details = `Order: ${data.orderNumber}\nProduct: ${data.productName}\nQuantity: ${data.quantity || '—'}`;
  const support = `Questions? Contact us at ${SUPPORT_EMAIL}.`;
  const templates = {
    order_received_payment_confirmed: {
      subject: `Payment confirmed for ${data.orderNumber}`,
      message: `Hi ${data.customerName},\n\nWe received your order and confirmed your payment.\n\n${details}\nStatus: Payment Confirmed\n\nWe will review your artwork and keep you updated.\n\n${support}`,
    },
    artwork_received: {
      subject: `Artwork received for ${data.orderNumber}`,
      message: `Hi ${data.customerName},\n\nWe received the artwork for your order.\n\n${details}\nStatus: Artwork Received\n\nOur team will review it for production.\n\n${support}`,
    },
    artwork_approved: {
      subject: `Artwork approved for ${data.orderNumber}`,
      message: `Hi ${data.customerName},\n\nYour artwork has been approved.\n\n${details}\nStatus: Artwork Approved\n\nWe are preparing your production packet.\n\n${support}`,
    },
    sent_to_production: {
      subject: `${data.orderNumber} has been sent to production`,
      message: `Hi ${data.customerName},\n\nYour order has been sent to production.\n\n${details}\nStatus: Sent to Production\n\nWe will notify you again when it ships.\n\n${support}`,
    },
    shipped: {
      subject: `${data.orderNumber} has shipped`,
      message: `Hi ${data.customerName},\n\nYour order has shipped.\n\n${details}\nStatus: Shipped\nCarrier: ${data.carrier || '—'}\nTracking number: ${data.trackingNumber || '—'}\n\n${support}`,
    },
    completed: {
      subject: `${data.orderNumber} is complete`,
      message: `Hi ${data.customerName},\n\nYour HC Apparel order is complete.\n\n${details}\nStatus: Completed\n\nThank you for your business.\n\n${support}`,
    },
    order_on_hold: {
      subject: `Action may be needed for ${data.orderNumber}`,
      message: `Hi ${data.customerName},\n\nYour order is currently on hold and needs attention.\n\n${details}\nStatus: Issue / On Hold\nReason: ${data.holdReason || 'Please contact us for details.'}\n\n${support}`,
    },
  };

  return {
    notification_type: templateKey,
    label: NOTIFICATION_TEMPLATE_LABELS[templateKey] || 'Customer update',
    subject: templates[templateKey]?.subject || `Update for ${data.orderNumber}`,
    customer_message: templates[templateKey]?.message || '',
    related_status: templateKey,
  };
};

export const buildMailtoUrl = (email, subject, message) =>
  `mailto:${encodeURIComponent(email || '')}?subject=${encodeURIComponent(subject || '')}&body=${encodeURIComponent(message || '')}`;

