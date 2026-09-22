export const DEFAULT_PAYMENT_METHOD_COSTS = {
  card: { label: 'Card', enabled: true, percentage: 2.9, fixed_fee: 0.3 },
  apple_pay: { label: 'Apple Pay', enabled: true, percentage: 2.9, fixed_fee: 0.3 },
  cashapp: { label: 'Cash App Pay', enabled: true, percentage: 2.9, fixed_fee: 0.3 },
  link: { label: 'Link / Card', enabled: true, percentage: 2.9, fixed_fee: 0.3 },
  afterpay_clearpay: { label: 'Cash App Afterpay', enabled: true, percentage: 6, fixed_fee: 0.3 },
  klarna: { label: 'Klarna', enabled: true, percentage: 5.99, fixed_fee: 0.3 },
};

export const normalizePaymentMethodCosts = (costs = {}) => Object.fromEntries(
  Object.entries(DEFAULT_PAYMENT_METHOD_COSTS).map(([key, defaults]) => [key, {
    ...defaults,
    ...(costs?.[key] || {}),
    enabled: costs?.[key]?.enabled ?? defaults.enabled,
    percentage: Number(costs?.[key]?.percentage ?? defaults.percentage),
    fixed_fee: Number(costs?.[key]?.fixed_fee ?? defaults.fixed_fee),
  }]),
);

export const processingCost = (charge, method) => {
  if (!method?.enabled) return 0;
  return Math.round((Number(charge) * Number(method.percentage) / 100 + Number(method.fixed_fee)) * 100) / 100;
};

export const paymentProtectedFloor = (vendorCost, desiredMargin, costs) => {
  const enabled = Object.entries(normalizePaymentMethodCosts(costs)).filter(([, method]) => method.enabled);
  if (!enabled.length) return { amount: Number(vendorCost) + Number(desiredMargin), methodKey: null, method: null };
  return enabled.reduce((worst, [methodKey, method]) => {
    const rate = Number(method.percentage) / 100;
    const amount = (Number(vendorCost) + Number(desiredMargin) + Number(method.fixed_fee)) / (1 - rate);
    return amount > worst.amount ? { amount, methodKey, method } : worst;
  }, { amount: 0, methodKey: null, method: null });
};
