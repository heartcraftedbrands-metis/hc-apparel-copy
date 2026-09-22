import Stripe from 'npm:stripe@17';

const labels: Record<string, string> = {
  afterpay_clearpay: 'Cash App Afterpay',
  card: 'Card',
  cashapp: 'Cash App Pay',
  klarna: 'Klarna',
  link: 'Link',
};

export const stripePaymentDetails = async (
  stripe: Stripe,
  session: Stripe.Checkout.Session,
) => {
  const intentId = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id;
  if (!intentId) return { type: 'stripe', label: 'Stripe Checkout', actualProcessingCost: null };

  try {
    const intent = await stripe.paymentIntents.retrieve(intentId, {
      expand: ['payment_method', 'latest_charge.balance_transaction'],
    });
    const method = intent.payment_method;
    const rawType = typeof method === 'string' ? null : method?.type;
    const walletType = typeof method === 'string' || method?.type !== 'card' ? null : method.card?.wallet?.type;
    const type = walletType === 'apple_pay' || walletType === 'link' ? walletType : rawType || 'stripe';
    const charge = typeof intent.latest_charge === 'string' ? null : intent.latest_charge;
    const transaction = !charge || typeof charge.balance_transaction === 'string' ? null : charge.balance_transaction;
    return {
      type,
      label: labels[type] || `Stripe (${type})`,
      actualProcessingCost: transaction?.fee == null ? null : transaction.fee / 100,
    };
  } catch (error) {
    console.error('Stripe payment method lookup failed', {
      error_name: error instanceof Error ? error.name : 'Unknown',
    });
    return { type: 'stripe', label: 'Stripe Checkout', actualProcessingCost: null };
  }
};

export const stripePaymentMethodLabel = async (stripe: Stripe, session: Stripe.Checkout.Session) => (
  await stripePaymentDetails(stripe, session)
).label;

const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

export const orderNetMargin = (order: Record<string, unknown>, processingCost: number) => {
  const total = number(order.total_amount);
  const shippingRevenue = number(order.shipping_amount);
  const tax = number(order.sales_tax_amount);
  const merchandiseRevenue = order.product_subtotal == null
    ? Math.max(0, total - shippingRevenue - tax)
    : number(order.product_subtotal);
  const vendorGarmentCost = number(order.vendor_cost_estimate);
  const vendorShippingCost = number(order.actual_vendor_shipping ?? order.actual_shipping_cost ?? order.estimated_vendor_shipping);
  const printCost = number(order.printing_cost_estimate);
  const otherVendorFees = number(order.other_vendor_fees);
  return Math.round((
    merchandiseRevenue + shippingRevenue - vendorGarmentCost - vendorShippingCost
    - number(processingCost) - printCost - otherVendorFees
  ) * 100) / 100;
};
