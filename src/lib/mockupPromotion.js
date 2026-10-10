export const MOCKUP_DEAL_NAME = '3 for $2 Mockup Deal';

const cents = value => Math.round((Number(value) || 0) * 100);

export function calculateMockupPromotion(items = []) {
  const normalized = items.map((item, index) => ({
    item,
    index,
    quantity: Math.max(0, Math.floor(Number(item.quantity) || 0)),
    unitCents: cents(item.price),
  }));
  const catalogCents = normalized.reduce((sum, entry) => sum + entry.unitCents * entry.quantity, 0);
  const eligible = normalized.filter(entry => entry.item.product_type === 'digital' && entry.quantity === 1 && entry.unitCents === 99);
  const groups = Math.floor(eligible.length / 3);
  const discountCents = groups * 97;
  const totalCents = catalogCents - discountCents;
  const remainder = eligible.length % 3;
  return {
    name: MOCKUP_DEAL_NAME,
    eligibleCount: eligible.length,
    groups,
    discountCents,
    catalogCents,
    totalCents,
    savings: discountCents / 100,
    catalogTotal: catalogCents / 100,
    total: totalCents / 100,
    progress: groups > 0 && remainder === 0
      ? 'Deal applied — add 3 more eligible mockups for another $0.97 savings.'
      : `${3 - remainder} more eligible mockup${3 - remainder === 1 ? '' : 's'} to unlock the next 3 for $2 deal.`,
  };
}
