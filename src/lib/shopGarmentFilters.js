import { SS_ACTIVEWEAR_BRANDS, brandFilterValue } from './ssBrands.js';

export const CATEGORY_FILTERS = [
  { value: 'all', label: 'All Products' },
  { value: 'hats', label: 'Hats' },
  { value: 'bags', label: 'Bags' },
  { value: 't_shirts', label: 'T-Shirts' },
  { value: 'hoodies', label: 'Hoodies' },
  { value: 'crewnecks', label: 'Crewnecks / Sweatshirts' },
  { value: 'long_sleeve', label: 'Long Sleeve' },
  { value: 'tank_tops', label: 'Tank Tops' },
  { value: 'womens', label: "Women's" },
  { value: 'kids', label: 'Youth / Kids' },
  { value: 'sportswear', label: 'Sports / Activewear' },
  { value: 'polos', label: 'Polos' },
  { value: 'custom_printed', label: 'Custom Printed' },
  { value: 'print_support', label: 'Print Support' },
];

export const STOREFRONT_CATEGORY_LABELS = {
  t_shirts: 'T-Shirt',
  hoodies: 'Hoodie',
  crewnecks: 'Crewneck / Sweatshirt',
  long_sleeve: 'Long Sleeve T-Shirt',
  tank_tops: 'Tank Top',
  kids: 'Youth / Kids',
  sportswear: 'Sports / Activewear',
  polos: 'Polo',
  hats: 'Hat',
  bags: 'Bag',
  custom_printed: 'Custom Print',
  print_support: 'Print Support',
  uncategorized: 'Garment',
};

export const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'featured', label: 'Featured' },
  { value: 'best_sellers', label: 'Best Sellers' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
];

const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL', 'ONE SIZE'];
const BRAND_MATCH_ORDER = [...SS_ACTIVEWEAR_BRANDS].sort((a, b) => b.length - a.length);
const VENDOR_CATEGORY_GROUPS = {
  t_shirts: ['short_sleeve_shirts', 'mens_short_sleeve_shirts', 'womens_short_sleeve_shirts', 't_shirts'],
  long_sleeve: ['long_sleeve_shirts', 'mens_long_sleeve_shirts', 'womens_long_sleeve_shirts', 'youth_long_sleeve_shirts'],
  hoodies: ['hoodies', 'mens_hoodies', 'womens_hoodies', 'youth_hoodies'],
  crewnecks: ['crewnecks', 'mens_crewnecks', 'womens_crewnecks', 'youth_crewnecks', 'sweatshirts'],
  tank_tops: ['tank_tops', 'mens_tank_tops', 'womens_tank_tops', 'youth_tank_tops'],
  sportswear: ['sportswear', 'mens_sportswear', 'womens_sportswear', 'youth_sportswear', 'performance_shirts'],
  polos: ['polo_shirts', 'mens_polo_shirts', 'womens_polo_shirts', 'youth_polo_shirts'],
  hats: ['hats', 'headwear'],
  bags: ['bags'],
};
const YOUTH_CATEGORIES = [
  'youth_short_sleeve_shirts',
  'youth_long_sleeve_shirts',
  'youth_crewnecks',
  'youth_polo_shirts',
  'youth_jackets',
  'youth_sportswear',
  'youth_hoodies',
  'toddler',
  'infant',
  'kids',
];
const STYLE_CATEGORY_RULES = [
  { category: 'hats', brand: 'oakley', styles: ['fos900833'] },
  { category: 'bags', brand: 'oakley', styles: ['fos901100'] },
  { category: 'polos', brand: 'oakley', styles: ['foa402993'] },
  { category: 'hoodies', brand: 'oakley', styles: ['foa402994'] },
  { category: 'hoodies', brand: 'gildan', styles: ['18500'] },
  { category: 'hoodies', brand: 'champion', styles: ['s700'] },
  { category: 'hoodies', brand: 'lane seven', styles: ['ls14001', 'ls14003'] },
  { category: 'hoodies', brand: 'independent trading co', styles: ['ss4500', 'ss4500z', 'ind4000', 'ind4000z', 'ind5000p'] },
  { category: 'crewnecks', brand: 'gildan', styles: ['18000'] },
  { category: 'crewnecks', brand: 'champion', styles: ['s600'] },
  { category: 'crewnecks', brand: 'lane seven', styles: ['ls14004'] },
  { category: 't_shirts', brand: 'gildan', styles: ['5000', '64000'] },
  { category: 't_shirts', brand: 'bella + canvas', styles: ['3001'] },
  { category: 't_shirts', brand: 'comfort colors', styles: ['1717'] },
  { category: 't_shirts', brand: 'next level', styles: ['3600'] },
  { category: 't_shirts', brand: 'tultex', styles: ['202'] },
  { category: 't_shirts', brand: 'hanes', styles: ['5280'] },
  { category: 't_shirts', brand: 'american apparel', styles: ['1301', '2001'] },
];

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === '') return [];
  return [value];
}

function normalized(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[\u2018\u2019]/g, "'");
}

function searchableProductText(product) {
  return [
    product?.name,
    product?.title,
    product?.vendor_title,
    product?.style_name,
    product?.description,
    product?.brand,
    product?.style_number,
    product?.vendor_style_number,
    product?.product_subtype,
    product?.category,
    ...asArray(product?.categories),
    ...asArray(product?.tags),
  ].map(normalized).join(' ');
}

function productIdentityText(product) {
  return [
    product?.name,
    product?.title,
    product?.vendor_title,
    product?.style_name,
    product?.description,
    product?.brand,
    product?.style_number,
    product?.vendor_style_number,
  ].map(normalized).join(' ');
}

function isAvailableOption(option) {
  if (!option || typeof option !== 'object') return true;
  const availabilityKeys = ['inventory_qty', 'inventory', 'quantity', 'stock', 'available_quantity'];
  const presentKey = availabilityKeys.find(key => option[key] !== undefined && option[key] !== null);
  return !presentKey || Number(option[presentKey]) > 0;
}

export function normalizeSize(value) {
  const size = String(value ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (['XXL', '2X', '2 X'].includes(size)) return '2XL';
  if (['XXXL', '3X', '3 X'].includes(size)) return '3XL';
  if (['XXXXL', '4X', '4 X'].includes(size)) return '4XL';
  if (['OS', 'OSFA', 'ONE-SIZE', 'ONESIZE'].includes(size)) return 'ONE SIZE';
  return size;
}

export function getProductSizes(product) {
  return [...new Set(
    asArray(product?.available_sizes)
      .filter(isAvailableOption)
      .map(size => normalizeSize(
        typeof size === 'object'
          ? size.size ?? size.name ?? size.value ?? size.label
          : size,
      ))
      .filter(Boolean),
  )];
}

export function getProductColors(product) {
  return [...new Set(
    asArray(product?.available_colors)
      .filter(isAvailableOption)
      .map(color => normalized(
        typeof color === 'object'
          ? color.name ?? color.color ?? color.value ?? color.label
          : color,
      ))
      .filter(Boolean),
  )];
}

export function getProductPrice(product) {
  const preferred = product?.sale_price ?? product?.price;
  const price = Number(preferred);
  return Number.isFinite(price) ? price : 0;
}

export function getProductBrand(product) {
  if (product?.brand) return String(product.brand).trim();
  const text = searchableProductText(product);
  return BRAND_MATCH_ORDER.find(brand => text.includes(normalized(brand))) || '';
}

function getStyleTokens(product) {
  return new Set([
    product?.style_number,
    product?.vendor_style_number,
    product?.style,
    ...String(product?.name || '').split(/[^a-z0-9]+/i),
  ].map(normalized).filter(Boolean));
}

function hasAnyTerm(text, terms) {
  return terms.some(term => {
    if (!['tee', 'cap', 'hat', 'bag'].includes(term)) return text.includes(term);
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escaped}s?([^a-z0-9]|$)`, 'i').test(text);
  });
}

function hasAnyVendorCategory(categories, categoryGroup) {
  return (VENDOR_CATEGORY_GROUPS[categoryGroup] || []).some(category => categories.includes(category));
}

function hasExplicitStorefrontCategoryTag(product, categoryValue) {
  const acceptedTags = new Set([
    `storefront:${categoryValue}`,
    `hc-category:${categoryValue}`,
    `hc_category:${categoryValue}`,
  ]);
  return asArray(product?.tags).map(normalized).some(tag => acceptedTags.has(tag));
}

export function isWomensSpecific(product) {
  const text = productIdentityText(product);
  const categories = [
    ...asArray(product?.categories),
    product?.category,
  ].map(normalized).filter(Boolean);
  return hasAnyTerm(text, ["women's", 'womens', 'ladies', 'female fit'])
    || categories.some(category => category.startsWith('womens_'));
}

export function getStorefrontCategory(product) {
  const text = productIdentityText(product);
  const brand = normalized(getProductBrand(product));
  const styleTokens = getStyleTokens(product);
  const categories = [
    ...asArray(product?.categories),
    product?.category,
  ].map(normalized).filter(Boolean);
  const subtype = normalized(product?.product_subtype);

  if (subtype === 'custom_printed') return 'custom_printed';
  if (subtype === 'print_support') return 'print_support';

  if (
    brand === 'rabbit skins'
    || hasAnyTerm(text, ['youth', 'toddler', 'infant', 'kids', 'child'])
    || categories.some(category => YOUTH_CATEGORIES.includes(category))
  ) return 'kids';

  const styleRule = STYLE_CATEGORY_RULES.find(rule => (
    (brand === rule.brand || text.includes(rule.brand)) && rule.styles.some(style => styleTokens.has(style))
  ));
  if (styleRule) return styleRule.category;

  // Strong garment terms take precedence over loose or incorrect vendor labels.
  if (hasAnyTerm(text, ['hoodie', 'hooded', 'pullover hood', 'hooded sweatshirt', 'fleece hood'])) return 'hoodies';
  if (hasAnyTerm(text, ['crewneck', 'crew neck', 'fleece crew', 'sweatshirt', 'sweater'])) return 'crewnecks';
  if (hasAnyTerm(text, ['tank top', 'tank', 'sleeveless', 'muscle tee', 'muscle shirt'])) return 'tank_tops';
  if (hasAnyTerm(text, ['backpack', 'tote', 'duffel', 'duffle', 'bag'])) return 'bags';
  if (hasAnyTerm(text, ['beanie', 'headwear', 'baseball cap', 'trucker cap', 'snapback', 'cap', 'hat'])) return 'hats';
  if (hasAnyTerm(text, ['long sleeve tee', 'long sleeve t-shirt', 'long sleeve shirt', 'long-sleeve tee'])) return 'long_sleeve';
  if (hasAnyTerm(text, ['polo', 'golf shirt'])) return 'polos';
  if (hasAnyTerm(text, ['performance shirt', 'activewear', 'sport shirt', 'athletic'])) return 'sportswear';
  if (hasAnyTerm(text, ['t-shirt', 't shirt', 'tee', 'short sleeve', 'pocket tee', 'softstyle', 'jersey tee'])) return 't_shirts';

  // Vendor categories are fallback signals only after stronger title/style rules.
  if (hasAnyVendorCategory(categories, 'hoodies')) return 'hoodies';
  if (hasAnyVendorCategory(categories, 'crewnecks')) return 'crewnecks';
  if (hasAnyVendorCategory(categories, 'tank_tops')) return 'tank_tops';
  if (hasAnyVendorCategory(categories, 'bags')) return 'bags';
  if (hasAnyVendorCategory(categories, 'hats')) return 'hats';
  if (hasAnyVendorCategory(categories, 'long_sleeve')) return 'long_sleeve';
  if (hasAnyVendorCategory(categories, 'polos')) return 'polos';
  if (hasAnyVendorCategory(categories, 'sportswear')) return 'sportswear';
  if (hasAnyVendorCategory(categories, 't_shirts')) return 't_shirts';
  return 'uncategorized';
}

export function getStorefrontCategoryLabel(product) {
  return STOREFRONT_CATEGORY_LABELS[getStorefrontCategory(product)] || STOREFRONT_CATEGORY_LABELS.uncategorized;
}

export function matchesCategory(product, categoryValue) {
  if (!categoryValue || categoryValue === 'all') return true;
  if (categoryValue === 'womens') return isWomensSpecific(product);
  const normalizedCategory = getStorefrontCategory(product);
  if (categoryValue === 't_shirts') {
    return normalizedCategory === 't_shirts' || normalizedCategory === 'long_sleeve';
  }
  if (categoryValue === 'sportswear') {
    return normalizedCategory === 'sportswear'
      || hasExplicitStorefrontCategoryTag(product, 'sportswear');
  }
  return normalizedCategory === categoryValue;
}

export function matchesBrand(product, brandValue) {
  if (!brandValue || brandValue === 'all') return true;
  const requestedBrand = SS_ACTIVEWEAR_BRANDS.find(brand => (
    normalized(brand) === normalized(brandValue)
    || brandFilterValue(brand) === normalized(brandValue)
  ));
  return requestedBrand ? normalized(getProductBrand(product)) === normalized(requestedBrand) : false;
}

export function getFilterOptions(products) {
  const brands = SS_ACTIVEWEAR_BRANDS
    .map(brand => ({
      value: brandFilterValue(brand),
      label: brand,
      count: products.filter(product => matchesBrand(product, brand)).length,
    }))
    .filter(option => option.count > 0);

  const sizeCounts = new Map();
  const colorCounts = new Map();
  products.forEach(product => {
    getProductSizes(product).forEach(size => sizeCounts.set(size, (sizeCounts.get(size) || 0) + 1));
    getProductColors(product).forEach(color => colorCounts.set(color, (colorCounts.get(color) || 0) + 1));
  });

  const sizes = [...sizeCounts.entries()]
    .sort(([a], [b]) => {
      const aIndex = SIZE_ORDER.indexOf(a);
      const bIndex = SIZE_ORDER.indexOf(b);
      if (aIndex !== -1 || bIndex !== -1) {
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      }
      return a.localeCompare(b);
    })
    .map(([value, count]) => ({ value, label: value === 'ONE SIZE' ? 'One Size' : value, count }));

  const colors = [...colorCounts.entries()]
    .sort(([, aCount], [, bCount]) => bCount - aCount)
    .map(([value, count]) => ({
      value,
      label: value.replace(/\b\w/g, letter => letter.toUpperCase()),
      count,
    }));

  return { brands, sizes, colors };
}

export function filterAndSortGarments(products, filters = {}) {
  const {
    category = 'all',
    brand = 'all',
    search = '',
    minPrice = '',
    maxPrice = '',
    sizes = [],
    colors = [],
    featuredOnly = false,
    bestSellersOnly = false,
    sort = 'newest',
  } = filters;

  const query = normalized(search);
  const selectedSizes = new Set(sizes.map(normalizeSize));
  const selectedColors = new Set(colors.map(normalized));
  const parsedMinPrice = minPrice === '' ? null : Number(minPrice);
  const parsedMaxPrice = maxPrice === '' ? null : Number(maxPrice);

  const result = products.filter(product => {
    if (!matchesCategory(product, category) || !matchesBrand(product, brand)) return false;
    if (query && !searchableProductText(product).includes(query)) return false;

    const price = getProductPrice(product);
    if (Number.isFinite(parsedMinPrice) && price < parsedMinPrice) return false;
    if (Number.isFinite(parsedMaxPrice) && price > parsedMaxPrice) return false;

    const productSizes = getProductSizes(product);
    if (selectedSizes.size > 0 && !productSizes.some(size => selectedSizes.has(size))) return false;

    const productColors = getProductColors(product);
    if (selectedColors.size > 0 && !productColors.some(color => selectedColors.has(color))) return false;

    if (featuredOnly && product.is_featured !== true) return false;
    if (bestSellersOnly && product.is_best_seller !== true) return false;
    return true;
  });

  return [...result].sort((a, b) => {
    if (sort === 'price_asc') return getProductPrice(a) - getProductPrice(b);
    if (sort === 'price_desc') return getProductPrice(b) - getProductPrice(a);
    if (sort === 'featured') return Number(Boolean(b.is_featured)) - Number(Boolean(a.is_featured));
    if (sort === 'best_sellers') return Number(Boolean(b.is_best_seller)) - Number(Boolean(a.is_best_seller));
    return (Date.parse(b.created_date) || 0) - (Date.parse(a.created_date) || 0);
  });
}

export function countActiveGarmentFilters(filters = {}) {
  return [
    filters.category && filters.category !== 'all',
    filters.brand && filters.brand !== 'all',
    Boolean(filters.search),
    filters.minPrice !== '' && filters.minPrice !== undefined,
    filters.maxPrice !== '' && filters.maxPrice !== undefined,
    (filters.sizes || []).length > 0,
    (filters.colors || []).length > 0,
    filters.featuredOnly,
    filters.bestSellersOnly,
    filters.sort && filters.sort !== 'newest',
  ].filter(Boolean).length;
}
