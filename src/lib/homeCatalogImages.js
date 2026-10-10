import { getProductBrand, matchesCategory } from './shopGarmentFilters.js';

export function isUsableCatalogImage(value) {
  return typeof value === 'string'
    && (/^https?:\/\//i.test(value) || value.startsWith('/images/'))
    && !/(placeholder|no[-_ ]?image|image[-_ ]?unavailable|coming[-_ ]?soon)/i.test(value);
}

const HOME_CATEGORY_IMAGE_FALLBACKS = {
  t_shirts: '/images/home-catalog/t-shirts-model.jpg',
  hoodies: '/images/home-catalog/hoodies.jpg',
  fleece: '/images/home-catalog/fleece-columbia-212478.jpg',
  outerwear: '/images/home-catalog/outerwear-model.jpg',
  jackets: '/images/home-catalog/outerwear-model.jpg',
  vests: '/images/home-catalog/outerwear-model.jpg',
  tank_tops: '/images/home-catalog/tank-tops-model.jpg',
  womens: '/images/home-catalog/womens-model.jpg',
  sportswear: '/images/home-catalog/sportswear-model.jpg',
  hats: '/images/home-catalog/hats.jpg',
  bags: '/images/home-catalog/bags-oakley-fos901100.jpg',
  all: '/images/home-catalog/bulk-orders-model.jpg',
};

const HOME_BRAND_IMAGE_FALLBACKS = {
  adidas: '/images/home-catalog/adidas-model.jpg',
  berne: '/images/home-catalog/berne-model.jpg',
  'american apparel': '/images/home-catalog/american-apparel-model.jpg',
};

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

export function getHomeCategoryFallback(category) {
  const value = normalize(category).replace(/[\s/-]+/g, '_');
  if (HOME_CATEGORY_IMAGE_FALLBACKS[value]) return HOME_CATEGORY_IMAGE_FALLBACKS[value];
  if (value.includes('bag')) return HOME_CATEGORY_IMAGE_FALLBACKS.bags;
  if (value.includes('fleece') || value.includes('sweatshirt')) return HOME_CATEGORY_IMAGE_FALLBACKS.fleece;
  if (value.includes('jacket') || value.includes('vest') || value.includes('outerwear')) return HOME_CATEGORY_IMAGE_FALLBACKS.outerwear;
  if (value.includes('sport') || value.includes('active')) return HOME_CATEGORY_IMAGE_FALLBACKS.sportswear;
  if (value.includes('hat') || value.includes('cap')) return HOME_CATEGORY_IMAGE_FALLBACKS.hats;
  if (value.includes('hood')) return HOME_CATEGORY_IMAGE_FALLBACKS.hoodies;
  if (value.includes('tank')) return HOME_CATEGORY_IMAGE_FALLBACKS.tank_tops;
  if (value.includes('women')) return HOME_CATEGORY_IMAGE_FALLBACKS.womens;
  return HOME_CATEGORY_IMAGE_FALLBACKS.t_shirts;
}

export function getHomeBrandFallback(brand) {
  return HOME_BRAND_IMAGE_FALLBACKS[normalize(brand)] || HOME_CATEGORY_IMAGE_FALLBACKS.t_shirts;
}

export function isCatalogProductInStock(product) {
  if (Number(product?.stock) > 0) return true;
  return Array.isArray(product?.size_prices)
    && product.size_prices.some(variant => Number(variant?.inventory) > 0);
}

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

export function selectBrandProduct(products, brand, { preferredStyles = [] } = {}) {
  const requestedBrand = normalize(brand);
  const preferred = preferredStyles.map(normalize);
  return (products || [])
    .filter(product => normalize(getProductBrand(product)) === requestedBrand)
    .filter(isCatalogProductInStock)
    .filter(product => getCatalogProductImage(product))
    .map((product, index) => {
      const style = normalize(product?.style_number || product?.supplier_sku);
      const preferredIndex = preferred.indexOf(style);
      return {
        product,
        score: preferredIndex === -1 ? 0 : preferred.length - preferredIndex,
        index,
      };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.product || null;
}
