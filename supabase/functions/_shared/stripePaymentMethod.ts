import Stripe from 'npm:stripe@17';

const labels: Record<string, string> = {
  afterpay_clearpay: 'Afterpay / Clearpay',
  card: 'Card',
  cashapp: 'Cash App Pay',
  klarna: 'Klarna',
  link: 'Link',
};

export const stripePaymentMethodLabel = async (
  stripe: Stripe,
  session: Stripe.Checkout.Session,
) => {
  const intentId = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id;
  if (!intentId) return 'Stripe Checkout';

  try {
    const intent = await stripe.paymentIntents.retrieve(intentId, {
      expand: ['payment_method'],
    });
    const method = intent.payment_method;
    const type = typeof method === 'string' ? null : method?.type;
    return type ? labels[type] || `Stripe (${type})` : 'Stripe Checkout';
  } catch (error) {
    console.error('Stripe payment method lookup failed', {
      error_name: error instanceof Error ? error.name : 'Unknown',
    });
    return 'Stripe Checkout';
  }
};
