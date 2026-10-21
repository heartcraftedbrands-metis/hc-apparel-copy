const PRIVATE_DTF_SHIPPING_TERMS = /(?:s\s*&\s*s|ss\s*activewear|ninja|supplier|quote\s*source|fixture|sandbox|internal|test\s*freight)/i;

/**
 * Keep supplier routing and quote metadata out of customer-facing surfaces.
 * Admin records retain those values unchanged.
 */
export function getCustomerDtfDeliveryMethod({ isTestOrder = false, verifiedService = '' } = {}) {
  if (isTestOrder) return 'DTF transfer shipping — test order only';

  const service = String(verifiedService || '').trim();
  if (!service || PRIVATE_DTF_SHIPPING_TERMS.test(service)) return 'DTF transfer shipping';

  return `DTF transfer shipping — ${service}`;
}

export function orderHasDtfTransfers(order) {
  return Array.isArray(order?.order_items)
    && order.order_items.some(item => item?.product_type === 'transfer' || Boolean(item?.dtf_order_id));
}
