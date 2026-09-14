const PENDING_ORDER_KEY = 'hc_pending_checkout_order_id';
const COMPLETED_ORDERS_KEY = 'hc_completed_checkout_order_ids';
const MAX_COMPLETED_ORDERS = 20;

function readCompletedOrderIds(storage) {
  try {
    const value = JSON.parse(storage.getItem(COMPLETED_ORDERS_KEY) || '[]');
    return Array.isArray(value) ? value.filter(id => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function markCheckoutPending(storage, orderId) {
  storage.setItem(PENDING_ORDER_KEY, orderId);
}

export function isCheckoutPending(storage, orderId) {
  return storage.getItem(PENDING_ORDER_KEY) === orderId;
}

export function isCheckoutCompleted(storage, orderId) {
  return readCompletedOrderIds(storage).includes(orderId);
}

export function markCheckoutCompleted(storage, orderId) {
  const completed = readCompletedOrderIds(storage).filter(id => id !== orderId);
  completed.push(orderId);
  storage.setItem(COMPLETED_ORDERS_KEY, JSON.stringify(completed.slice(-MAX_COMPLETED_ORDERS)));

  if (isCheckoutPending(storage, orderId)) {
    storage.removeItem(PENDING_ORDER_KEY);
  }
}
