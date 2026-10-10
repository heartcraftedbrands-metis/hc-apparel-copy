const INTERNAL_PRODUCT_COPY = /\b(?:private|internal|qa|test)\b|(?:launch|catalog)[-\s]?batch|not approved/i;
const SUPPLIER_BRANDING = /\bS\s*(?:&|&amp;)\s*S(?:\s+Activewear)?\b|\bZeroTouch\b/i;

export function hasInternalProductCopy(value) {
  const text = String(value || '');
  return INTERNAL_PRODUCT_COPY.test(text) || SUPPLIER_BRANDING.test(text);
}

export function getPublicProductText(value) {
  const text = String(value || '').trim();
  return text && !hasInternalProductCopy(text) ? text : '';
}

export function getPublicProductDescription(product, displayName) {
  const description = getPublicProductText(product?.description);
  if (description) return description;
  const name = displayName || 'This product';
  if (product?.product_subtype === 'custom_printed' || product?.product_subtype === 'print_support') {
    return `Explore ${name} in the listed options. Contact HC Apparel for printing details.`;
  }
  return `${name} is available as blank apparel in the listed colors and sizes. Custom printing is optional when you need it.`;
}
