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
