const PENDING_ORDER_KEY = 'hc_pending_checkout_order_id';
const COMPLETED_ORDERS_KEY = 'hc_completed_checkout_order_ids';
const CHECKOUT_ATTEMPT_KEY = 'hc_active_checkout_attempt';
const MAX_COMPLETED_ORDERS = 20;

function newAttemptKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `checkout-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getOrCreateCheckoutAttempt(storage, fingerprint) {
  try {
    const current = JSON.parse(storage.getItem(CHECKOUT_ATTEMPT_KEY) || 'null');
    if (current?.fingerprint === fingerprint && typeof current?.key === 'string') return current.key;
  } catch {
    // A malformed browser value is safely replaced below.
  }
  const next = { fingerprint, key: newAttemptKey() };
  storage.setItem(CHECKOUT_ATTEMPT_KEY, JSON.stringify(next));
  return next.key;
}

export function clearCheckoutAttempt(storage) {
  storage.removeItem(CHECKOUT_ATTEMPT_KEY);
}

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
