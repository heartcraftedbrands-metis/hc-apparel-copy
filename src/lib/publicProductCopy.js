const INTERNAL_PRODUCT_COPY = /\b(?:private|internal|qa|test)\b|(?:launch|catalog)[-\s]?batch|not approved/i;

export function hasInternalProductCopy(value) {
  return INTERNAL_PRODUCT_COPY.test(String(value || ''));
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
