import { getCustomizationVariants, findCustomizationVariant } from './productCustomization.js';
import { getProductBrand, getPublicProductName, getProductStyleLabel } from './productDisplayName.js';
import { getStorefrontCategory } from './shopGarmentFilters.js';
import { isRestrictedCustomizationProduct } from './designStudio.js';

export const STUDIO_GARMENT_TYPES = [
  ['all', 'All eligible'],
  ['t_shirts', 'T-shirts'],
  ['hoodies', 'Hoodies'],
  ['crewnecks', 'Crewnecks'],
];

const clean = value => String(value || '').trim();
const lower = value => clean(value).toLowerCase();

export function getStudioGarmentType(product) {
  const text = lower(`${product?.name || ''} ${product?.description || ''} ${product?.category || ''} ${product?.product_subtype || ''}`);
  if (/\b(?:jacket|coat|anorak|windbreaker|puffer|vest)\b/.test(text)) return '';
  const explicit = lower(product?.primary_garment_type);
  if (['t_shirts', 'hoodies', 'crewnecks'].includes(explicit)) return explicit;
  const category = getStorefrontCategory(product);
  if (['t_shirts', 'hoodies', 'crewnecks'].includes(category)) return category;
  if (/\b(?:full[- ]?zip|zip[- ]?up|pullover)?\s*hood(?:ie|ed)|hooded sweatshirt\b/.test(text)) return 'hoodies';
  if (/\b(?:crewneck|crew neck|sweatshirt)\b/.test(text) && !/hood/.test(text)) return 'crewnecks';
  if (/\b(?:t-?shirt|tee)\b/.test(text)) return 't_shirts';
  return '';
}

export function getStudioGarmentLabel(product) {
  const type = getStudioGarmentType(product);
  if (type === 'hoodies') return isZipHoodie(product) ? 'Zip hoodie' : 'Pullover hoodie';
  if (type === 'crewnecks') return 'Crewneck sweatshirt';
  if (type === 't_shirts') return 'T-shirt';
  return 'Unsupported garment';
}

export function isZipHoodie(product) {
  return getStudioGarmentType(product) === 'hoodies'
    && /\b(?:full[- ]?zip|zip[- ]?up|zip hoodie|zip hooded)\b/i.test(`${product?.name || ''} ${product?.description || ''}`);
}

export function isStudioEligibleProduct(product) {
  if (!product || (product.product_type || 'physical') !== 'physical') return false;
  if (product.visibility !== 'public' || product.is_active !== true || Number(product.stock || 0) <= 0) return false;
  if (!getStudioGarmentType(product) || isRestrictedCustomizationProduct(product)) return false;
  return getCustomizationVariants(product).some(variant => Number(variant.inventory) > 0);
}

export function getStudioProductSummary(product) {
  const type = getStudioGarmentType(product);
  const publicName = getPublicProductName(product);
  const rawName = clean(product?.name);
  const publicNameLooksLikeWrongType = type !== 't_shirts' && /\bt-?shirt\b/i.test(publicName);
  return {
    name: publicNameLooksLikeWrongType && rawName ? rawName : publicName,
    brand: getProductBrand(product) || 'Brand unavailable',
    style: getProductStyleLabel(product) || '',
    type,
    typeLabel: getStudioGarmentLabel(product),
  };
}

export function getVariantForColor(product, color, size = '') {
  if (!product || !color) return null;
  if (size) return findCustomizationVariant(product, color, size);
  const normalized = lower(color);
  return getCustomizationVariants(product).find(item => lower(item.color) === normalized && (item.inventory === null || item.inventory > 0)) || null;
}

export function getVariantImage(product, color = '', size = '') {
  const variant = getVariantForColor(product, color, size);
  return clean(variant?.image_url || product?.image_url);
}

const viewFromUrl = url => {
  const text = lower(url);
  if (/(?:_|\/)(?:b|back)(?:_|\.|\/)/.test(text)) return 'back';
  if (/(?:_|\/)(?:ls|left[-_ ]?sleeve)(?:_|\.|\/)/.test(text)) return 'left_sleeve';
  if (/(?:_|\/)(?:rs|right[-_ ]?sleeve)(?:_|\.|\/)/.test(text)) return 'right_sleeve';
  return '';
};

const mockupValues = value => {
  if (!value) return [];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(mockupValues);
  if (typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => {
      if (typeof item !== 'string') return [];
      return [{ view: lower(key), url: item }];
    });
  }
  return [];
};

export function buildMockupViews(product, color = '', size = '', mapped = []) {
  const front = getVariantImage(product, color, size);
  const views = front ? { front: { url: front, source: 'Live catalog variant image', verified: true } } : {};
  for (const item of mockupValues(product?.mockup_images)) {
    const value = typeof item === 'string' ? { url: item, view: viewFromUrl(item) } : item;
    const view = ['front', 'back', 'left_sleeve', 'right_sleeve'].includes(value.view) ? value.view : viewFromUrl(value.url);
    if (view && !views[view]) views[view] = { url: value.url, source: 'Live catalog mockup asset', verified: true };
  }
  const applicableMappings = (mapped || []).filter(item => !item.color_key || item.color_key === '*' || lower(item.color_key) === lower(color))
    .sort((a, b) => Number(a.color_key !== '*') - Number(b.color_key !== '*'));
  for (const item of applicableMappings) {
    if (item.image_url && item.view) views[item.view] = {
      url: item.image_url,
      source: item.source_note || 'Admin-mapped authorized asset',
      verified: Boolean(item.verified),
      previewArea: item.preview_area || null,
    };
  }
  return views;
}

export function viewForPlacement(placement) {
  if (placement === 'back') return 'back';
  if (placement === 'left_sleeve') return 'left_sleeve';
  if (placement === 'right_sleeve') return 'right_sleeve';
  return 'front';
}

export function placementAvailability(product, mockupViews = {}) {
  const type = getStudioGarmentType(product);
  const zip = isZipHoodie(product);
  const front = Boolean(mockupViews.front?.url);
  return Object.fromEntries([
    ['front', { enabled: front && !zip, reason: zip ? 'A full-zip hoodie needs a verified split-front print area; an uninterrupted center-front print is not offered.' : (!front ? 'No authorized front garment image is available.' : '') }],
    ['left_chest', { enabled: front, reason: front ? '' : 'No authorized front garment image is available.' }],
    ['right_chest', { enabled: front, reason: front ? '' : 'No authorized front garment image is available.' }],
    ['back', { enabled: Boolean(mockupViews.back?.url), reason: mockupViews.back?.url ? '' : 'A real back-view asset has not been mapped for this product and color.' }],
    ['left_sleeve', { enabled: Boolean(mockupViews.left_sleeve?.url), reason: mockupViews.left_sleeve?.url ? '' : 'A real wearer-left sleeve view has not been mapped.' }],
    ['right_sleeve', { enabled: Boolean(mockupViews.right_sleeve?.url), reason: mockupViews.right_sleeve?.url ? '' : 'A real wearer-right sleeve view has not been mapped.' }],
  ]);
}

export function previewSurface(product, placement, mappedArea = null) {
  if (mappedArea && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(Number(mappedArea[key])))) {
    return Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, Number(mappedArea[key])]));
  }
  const type = getStudioGarmentType(product);
  if (placement === 'left_chest') return { x: 27, y: type === 'hoodies' ? 27 : 24, width: 21, height: 23 };
  if (placement === 'right_chest') return { x: 52, y: type === 'hoodies' ? 27 : 24, width: 21, height: 23 };
  if (placement.includes('sleeve')) return { x: 26, y: 25, width: 48, height: 55 };
  if (placement === 'back') return { x: 28, y: type === 'hoodies' ? 25 : 22, width: 44, height: type === 'hoodies' ? 48 : 58 };
  if (type === 'hoodies') return { x: 28, y: 27, width: 44, height: 34 };
  if (type === 'crewnecks') return { x: 28, y: 23, width: 44, height: 56 };
  return { x: 28, y: 22, width: 44, height: 58 };
}

export function getOfficialGarmentSource(product) {
  const identity = lower(`${product?.brand || ''} ${product?.name || ''} ${product?.style_number || ''}`);
  if (identity.includes('gildan') && /\b5000\b/.test(identity)) return { label: 'Gildan 5000 official product specifications', url: 'https://www.gildan.com/us/en/5000-adult-t-shirt-en_us', note: 'Confirms garment construction, sizes, and colors; it does not publish an HC production print-area measurement.' };
  if (identity.includes('gildan') && /\b18500\b/.test(identity)) return { label: 'Gildan 18500 official product specifications', url: 'https://www.gildan.com/us/en/18500-adult-hooded-sweatshirt-en_us', note: 'Confirms the hood and pouch pocket; it does not publish an HC production print-area measurement.' };
  if (identity.includes('gildan') && /\b18000\b/.test(identity)) return { label: 'Gildan 18000 official product specifications', url: 'https://www.gildan.com/us/en/18000-adult-crewneck-sweatshirt-en_us', note: 'Confirms garment construction, sizes, and colors; it does not publish an HC production print-area measurement.' };
  return null;
}
