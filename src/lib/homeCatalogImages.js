import { getProductBrand, matchesCategory } from './shopGarmentFilters.js';

export function isUsableCatalogImage(value) {
  return typeof value === 'string'
    && /^https?:\/\//i.test(value)
    && !/(placeholder|no[-_ ]?image|image[-_ ]?unavailable|coming[-_ ]?soon)/i.test(value);
}

function firstImageFrom(value) {
  if (!Array.isArray(value)) return '';
  for (const item of value) {
    const candidate = typeof item === 'string'
      ? item
      : item?.image_url || item?.url || item?.src || '';
    if (isUsableCatalogImage(candidate)) return candidate;
  }
  return '';
}

export function getCatalogProductImage(product) {
  if (isUsableCatalogImage(product?.image_url)) return product.image_url;
  return firstImageFrom(product?.mockup_images) || firstImageFrom(product?.size_prices);
}

const normalize = value => String(value || '').trim().toLowerCase();

export function selectCatalogProduct(products, {
  category = 'all',
  preferredBrands = [],
  excludeIds = [],
} = {}) {
  const blockedIds = new Set(excludeIds);
  const preferred = preferredBrands.map(normalize);

  return (products || [])
    .filter(product => !blockedIds.has(product?.id))
    .filter(product => getCatalogProductImage(product))
    .filter(product => category === 'all' || matchesCategory(product, category))
    .map((product, index) => {
      const brand = normalize(getProductBrand(product));
      const preferredIndex = preferred.indexOf(brand);
      return {
        product,
        score: preferredIndex === -1 ? 0 : preferred.length - preferredIndex,
        index,
      };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.product || null;
}

export function selectBrandProduct(products, brand) {
  const requestedBrand = normalize(brand);
  return (products || []).find(product => (
    normalize(getProductBrand(product)) === requestedBrand
    && getCatalogProductImage(product)
  )) || null;
}
