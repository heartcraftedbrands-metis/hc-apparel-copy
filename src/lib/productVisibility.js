/**
 * Central source of truth for product visibility rules.
 * Only products with visibility === 'public' (or legacy is_active=true with no visibility set)
 * should appear on any customer-facing page.
 *
 * Digital categories are always forced to admin_archive regardless.
 */

export const DIGITAL_CATEGORIES = [
  'digital_designs',
  'halftone_packs',
  'distressed_packs',
  'design_elements',
];

const DIGITAL_KEYWORDS = [
  'png', 'dtf', 'download', 'digital', 'bundle', 'artwork', 'design pack',
  'halftone', 'distressed', 'file', 'instant download',
];

/**
 * Returns true if a product should be treated as a digital/archive product
 * based on its type, category, or name keywords.
 */
export function isDigitalProduct(product) {
  if (product.product_type === 'digital') return true;
  if (product.visibility === 'admin_archive') return true;

  const cats = product.categories?.length
    ? product.categories
    : product.category
    ? [product.category]
    : [];

  if (cats.some(c => DIGITAL_CATEGORIES.includes(c))) return true;

  const name = (product.name || '').toLowerCase();
  const desc = (product.description || '').toLowerCase();
  if (DIGITAL_KEYWORDS.some(kw => name.includes(kw) || desc.includes(kw))) return true;

  return false;
}

/**
 * Returns true if a product should be shown on the public customer-facing site.
 * Strict: visibility must explicitly be 'public'.
 * Legacy products with no visibility field but is_active=true are also shown
 * UNLESS they are digital.
 */
export function isPublicProduct(product) {
  if (isDigitalProduct(product)) return false;

  // New visibility system
  if (product.visibility) {
    return product.visibility === 'public';
  }

  // Legacy fallback: treat is_active=true as public for physical products
  return product.is_active !== false;
}

/**
 * Filter an array of products to only public ones.
 */
export function filterPublicProducts(products) {
  return (products || []).filter(isPublicProduct);
}