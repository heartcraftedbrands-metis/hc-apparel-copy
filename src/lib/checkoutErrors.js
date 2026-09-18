export const SIGN_IN_AGAIN = 'Please sign in again to continue checkout.';
export const CHECKOUT_CONNECT = 'Checkout could not connect. Please refresh and try again.';
export const PAYMENT_UNAVAILABLE = 'Payment checkout could not be started. Please refresh and try again. If this continues, contact support@ilovehcapparel.net.';

const safeValidationReasons = new Set([
  'At least one garment item is required',
  'Every item requires a product',
  'Every item requires a color',
  'Every item requires a size',
  'Every item requires a positive whole-number quantity',
  'Customized items require private artwork',
  'Artwork must use a private customer-files reference',
  'Artwork does not belong to the signed-in customer',
  'Customized items require a decoration method',
  'Customized items require a print placement',
  'Customized items require a print size option',
  'Orders of 50 or more require a Bulk Quote 50+',
  'Complete shipping address is required',
  'Complete billing address is required',
  'Customer name is required',
  'Checkout email must match the signed-in account',
  'A checkout product is unavailable',
]);

export async function checkoutErrorMessage(error, stage) {
  let status = Number(error?.status) || Number(error?.cause?.status) || 0;
  let message = String(error?.message || '');
  const context = error?.cause?.context || error?.context;
  if (context && typeof context.json === 'function') {
    status = context.status || status;
    try { message = String((await context.clone().json())?.error || message); }
    catch { /* The gateway may return non-JSON errors. */ }
  }
  if (status === 401 || /authentication required|invalid jwt|jwt expired|session expired|invalid refresh token|refresh token not found|auth session missing/i.test(message)) return SIGN_IN_AGAIN;
  if (stage === 'order') {
    if (safeValidationReasons.has(message)) return message;
    const match = message.match(/^Checkout validation failed: (\[.*\])$/s);
    if (match) {
      try {
        const reasons = JSON.parse(match[1]);
        if (Array.isArray(reasons) && reasons.length && reasons.every(reason => safeValidationReasons.has(reason))) return reasons.join(' ');
      } catch { /* Do not display untrusted database error text. */ }
    }
  }
  if (/load failed|failed to fetch|network|fetch failed|timeout|abort/i.test(message)
      || /FunctionsFetchError/i.test(String(error?.cause?.name || error?.name || ''))) return CHECKOUT_CONNECT;
  if (stage === 'payment') {
    if (message === 'Order is already paid') return 'This order has already been paid. Please check your order history.';
    return PAYMENT_UNAVAILABLE;
  }
  return CHECKOUT_CONNECT;
}
