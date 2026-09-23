export const DEFAULT_PUBLIC_VISITOR_PRICING = Object.freeze({
  enabled: true,
  difference: 5,
});

export function normalizePublicVisitorPricing(value) {
  const difference = Number(value?.difference ?? value?.public_visitor_price_difference);
  return {
    enabled: value?.enabled ?? value?.public_visitor_price_markup_enabled ?? true,
    difference: Number.isFinite(difference) && difference >= 0 ? difference : 5,
  };
}

export function isPublicMarkupEligible(product) {
  return product?.product_type !== 'digital'
    && product?.product_subtype !== 'print_support'
    && product?.product_subtype !== 'custom_printing_service';
}

export function publicVisitorPrice(customerPrice, settings, product = {}) {
  const price = Number(customerPrice);
  if (!Number.isFinite(price)) return null;
  const normalized = normalizePublicVisitorPricing(settings);
  return normalized.enabled && isPublicMarkupEligible(product)
    ? Math.round((price + normalized.difference + Number.EPSILON) * 100) / 100
    : price;
}
