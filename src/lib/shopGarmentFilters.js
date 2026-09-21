import { SS_ACTIVEWEAR_BRANDS, brandFilterValue } from './ssBrands.js';

export const CATEGORY_FILTERS = [
  { value: 'all', label: 'All Products' },
  { value: 't_shirts', label: 'T-Shirts' },
  { value: 'long_sleeve', label: 'Long Sleeve' },
  { value: 'polos', label: 'Polos' },
  { value: 'quarter_zips', label: 'Quarter-Zips' },
  { value: 'hoodies', label: 'Hoodies' },
  { value: 'crewnecks', label: 'Sweatshirts / Crewnecks' },
  { value: 'outerwear', label: 'Jackets / Outerwear' },
  { value: 'pants', label: 'Pants / Joggers / Leggings' },
  { value: 'shorts', label: 'Shorts' },
  { value: 'hats', label: 'Headwear' },
  { value: 'tank_tops', label: 'Tank Tops' },
  { value: 'bags', label: 'Bags' },
  { value: 'other', label: 'Other' },
  { value: 'winter_cold_weather', label: 'Winter / Cold Weather' },
  { value: 'womens', label: "Women's" },
  { value: 'mens', label: "Men's" },
  { value: 'kids', label: 'Youth / Kids' },
  { value: 'sportswear', label: 'Sports / Activewear' },
  { value: 'business_apparel', label: 'Business Apparel' },
  { value: 'workwear', label: 'Workwear' },
  { value: 'outdoor', label: 'Outdoor' },
  { value: 'performance', label: 'Performance' },
  { value: 'custom_printed', label: 'Custom Printed' },
  { value: 'print_support', label: 'Print Support' },
];

export const STOREFRONT_CATEGORY_LABELS = {
  t_shirts: 'T-Shirt',
  hoodies: 'Hoodie',
  crewnecks: 'Sweatshirt / Crewneck',
  quarter_zips: 'Quarter-Zip',
  outerwear: 'Jacket / Outerwear',
  pants: 'Pants / Joggers / Leggings',
  shorts: 'Shorts',
  long_sleeve: 'Long Sleeve T-Shirt',
  tank_tops: 'Tank Top',
  kids: 'Youth / Kids',
  polos: 'Polo',
  hats: 'Hat',
  bags: 'Bag',
  other: 'Other',
  custom_printed: 'Custom Print',
  print_support: 'Print Support',
  uncategorized: 'Garment',
};

export const PRIMARY_GARMENT_SECTION_LABELS = {
  t_shirts: 'T-Shirts',
  long_sleeve: 'Long Sleeve',
  polos: 'Polos',
  quarter_zips: 'Quarter-Zips',
  hoodies: 'Hoodies',
  crewnecks: 'Sweatshirts / Crewnecks',
  outerwear: 'Jackets / Outerwear',
  pants: 'Pants / Joggers / Leggings',
  shorts: 'Shorts',
  hats: 'Headwear',
  tank_tops: 'Tank Tops',
  bags: 'Bags',
  other: 'Other',
};

export const PRIMARY_GARMENT_CATEGORY_ORDER = [
  't_shirts', 'long_sleeve', 'polos', 'quarter_zips', 'hoodies', 'crewnecks',
  'outerwear', 'pants', 'shorts', 'hats', 'tank_tops', 'bags', 'other',
];

export const PRIMARY_GARMENT_TYPE_OPTIONS = PRIMARY_GARMENT_CATEGORY_ORDER.map(value => ({
  value,
  label: STOREFRONT_CATEGORY_LABELS[value],
}));

export const SECONDARY_TAG_OPTIONS = [
  { value: 'winter_cold_weather', label: 'Winter / Cold Weather' },
  { value: 'womens', label: "Women's" },
  { value: 'mens', label: "Men's" },
  { value: 'kids', label: 'Youth / Kids' },
  { value: 'sportswear', label: 'Sports / Activewear' },
  { value: 'business_apparel', label: 'Business Apparel' },
  { value: 'workwear', label: 'Workwear' },
  { value: 'outdoor', label: 'Outdoor' },
  { value: 'performance', label: 'Performance' },
];

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
  fleece: ['fleece', 'pullovers'],
  crewnecks: ['crewnecks', 'mens_crewnecks', 'womens_crewnecks', 'youth_crewnecks', 'sweatshirts'],
  outerwear: [
    'outerwear',
    'jackets',
    'mens_jackets',
    'womens_jackets',
    'youth_jackets',
  ],
  tank_tops: ['tank_tops', 'mens_tank_tops', 'womens_tank_tops', 'youth_tank_tops'],
  sportswear: ['sportswear', 'mens_sportswear', 'womens_sportswear', 'youth_sportswear', 'performance_shirts'],
  polos: ['polo_shirts', 'mens_polo_shirts', 'womens_polo_shirts', 'youth_polo_shirts'],
  pants: ['pants', 'mens_pants', 'womens_pants', 'youth_pants', 'joggers', 'leggings'],
  shorts: ['shorts', 'mens_shorts', 'womens_shorts', 'youth_shorts'],
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
  { category: 'hats', brand: 'dri duck', styles: ['3458'] },
  { category: 'outerwear', brand: 'dri duck', styles: ['5020', '9416'] },
  { category: 'hoodies', brand: 'dri duck', styles: ['7035'] },
  { category: 'outerwear', brand: 'dri duck', styles: ['9340'] },
  { category: 'hats', brand: 'oakley', styles: ['fos900833'] },
  { category: 'bags', brand: 'oakley', styles: ['fos901100'] },
  { category: 'polos', brand: 'oakley', styles: ['foa402993'] },
  { category: 'hoodies', brand: 'oakley', styles: ['foa402994'] },
  { category: 'hoodies', brand: 'gildan', styles: ['18500', '22060'] },
  { category: 'hoodies', brand: 'champion', styles: ['s700'] },
  { category: 'outerwear', brand: 'champion', styles: ['co100', 'co125', 'co126'] },
  { category: 'quarter_zips', brand: 'champion', styles: ['s450'] },
  { category: 'pants', brand: 'champion', styles: ['p930', 'chp120', 'chp200'] },
  { category: 'long_sleeve', brand: 'champion', styles: ['chp140'] },
  { category: 't_shirts', brand: 'champion', styles: ['co200', 't425', '63284', '00784'] },
  { category: 'hoodies', brand: 'lane seven', styles: ['ls14001', 'ls14003', '487c9'] },
  { category: 'hoodies', brand: 'independent trading co', styles: ['ss4500', 'ss4500z', 'ind4000', 'ind4000z', 'ind5000p'] },
  { category: 'crewnecks', brand: 'gildan', styles: ['18000'] },
  { category: 'crewnecks', brand: 'champion', styles: ['s600'] },
  { category: 'crewnecks', brand: 'lane seven', styles: ['ls14004', '489c9'] },
  { category: 't_shirts', brand: 'lane seven', styles: ['ls15001', 'ls16001', '492c9', '595c9'] },
  { category: 't_shirts', brand: 'gildan', styles: ['2000', '5000', '64000', '00760', '00060', '00660'] },
  { category: 't_shirts', brand: 'bella + canvas', styles: ['3001', '3001cvc', '3413', '3501', '84706', '05606', '00706', '00606'] },
  { category: 't_shirts', brand: 'comfort colors', styles: ['1717', '6030', '08508', '00708'] },
  { category: 'long_sleeve', brand: 'comfort colors', styles: ['6014', '08108'] },
  { category: 't_shirts', brand: 'next level', styles: ['3312', '6010', '3600', '6210', '55118', '84718', '00618', '20618'] },
  { category: 't_shirts', brand: 'tultex', styles: ['202'] },
  { category: 'hoodies', brand: 'hanes', styles: ['p170', '22000'] },
  { category: 't_shirts', brand: 'hanes', styles: ['4980', '5250', '5280', '00600', '00700', '00000'] },
  { category: 't_shirts', brand: 'rabbit skins', styles: ['4400', '3321', '30238', '31838'] },
  { category: 'tank_tops', brand: 'shaka wear', styles: ['shktt', 'shtank', '272c2', '296c2'] },
  { category: 'long_sleeve', brand: 'shaka wear', styles: ['shthrm', '298c2'] },
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

function vendorSpecTitle(product) {
  const specs = product?.vendor_specs;
  if (!specs || Array.isArray(specs) || typeof specs !== 'object') return '';
  return specs.product_title || specs.productTitle || specs.style_name || specs.styleName
    || specs.product_name || specs.productName || specs.title || specs.name || '';
}

function searchableProductText(product) {
  return [
    product?.name,
    product?.title,
    product?.vendor_title,
    product?.style_name,
    vendorSpecTitle(product),
    product?.description,
    product?.brand,
    product?.style_number,
    product?.vendor_style_number,
    product?.supplier_sku,
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
    vendorSpecTitle(product),
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

export function getProductVariantPrices(product, { inStockOnly = true } = {}) {
  return asArray(product?.size_prices)
    .filter(variant => variant && typeof variant === 'object')
    .filter(variant => {
      if (!inStockOnly) return true;
      const inventory = variant.inventory ?? variant.inventory_qty ?? variant.quantity;
      return inventory === undefined || inventory === null || Number(inventory) > 0;
    })
    .map(variant => Number(variant.price))
    .filter(price => Number.isFinite(price) && price > 0);
}

export function getProductPriceRange(product) {
  const variantPrices = getProductVariantPrices(product);
  if (variantPrices.length) {
    return {
      minimum: Math.min(...variantPrices),
      maximum: Math.max(...variantPrices),
      hasVariablePricing: new Set(variantPrices.map(price => price.toFixed(2))).size > 1,
      source: 'variant',
    };
  }

  const preferred = product?.sale_price ?? product?.price;
  const price = Number(preferred);
  const fallback = Number.isFinite(price) ? price : 0;
  return {
    minimum: fallback,
    maximum: fallback,
    hasVariablePricing: false,
    source: 'product',
  };
}

export function getProductPrice(product) {
  return getProductPriceRange(product).minimum;
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
    product?.supplier_sku,
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

function normalizePrimaryGarmentType(value) {
  const key = normalized(value).replace(/[\s/-]+/g, '_');
  const aliases = {
    t_shirt: 't_shirts',
    tshirt: 't_shirts',
    tshirts: 't_shirts',
    long_sleeve_t_shirt: 'long_sleeve',
    sweatshirt: 'crewnecks',
    sweatshirts: 'crewnecks',
    sweatshirt_crewneck: 'crewnecks',
    sweatshirts_crewnecks: 'crewnecks',
    polo: 'polos',
    quarter_zip: 'quarter_zips',
    jacket: 'outerwear',
    jackets_outerwear: 'outerwear',
    pants_bottoms: 'pants',
    pants_joggers_leggings: 'pants',
    headwear: 'hats',
    tank_top: 'tank_tops',
    bag: 'bags',
    uncategorized: 'other',
  };
  const normalizedKey = aliases[key] || key;
  return PRIMARY_GARMENT_CATEGORY_ORDER.includes(normalizedKey) ? normalizedKey : '';
}

function normalizedSecondaryTags(product) {
  return new Set(asArray(product?.secondary_tags).map(value => {
    const key = normalized(value).replace(/[\s/-]+/g, '_');
    const aliases = {
      women: 'womens',
      men: 'mens',
      youth_kids: 'kids',
      sports_activewear: 'sportswear',
      business: 'business_apparel',
      winter: 'winter_cold_weather',
      cold_weather: 'winter_cold_weather',
      winter_coldweather: 'winter_cold_weather',
    };
    return aliases[key] || key;
  }));
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

export function isYouthSpecific(product) {
  const text = productIdentityText(product);
  const categories = [
    ...asArray(product?.categories),
    product?.category,
  ].map(normalized).filter(Boolean);
  return hasAnyTerm(text, ['youth', 'toddler', 'infant', 'kids', 'child'])
    || categories.some(category => YOUTH_CATEGORIES.includes(category));
}

export function getSecondaryTags(product) {
  const result = normalizedSecondaryTags(product);
  const text = searchableProductText(product);
  const categories = [...asArray(product?.categories), product?.category].map(normalized).filter(Boolean);
  const explicit = value => hasExplicitStorefrontCategoryTag(product, value);

  if (isWomensSpecific(product) || explicit('womens')) result.add('womens');
  if (hasAnyTerm(text, ['winter', 'cold weather', 'fleece', 'hoodie', 'hooded sweatshirt', 'sweatshirt', 'jacket', 'outerwear', 'windbreaker', 'anorak', 'bomber', 'beanie']) || explicit('winter_cold_weather')) result.add('winter_cold_weather');
  if (isYouthSpecific(product) || explicit('kids') || normalized(getProductBrand(product)) === 'rabbit skins') result.add('kids');
  if (/(^|[^a-z])men'?s([^a-z]|$)/i.test(text) || hasAnyTerm(text, ['male fit', 'unisex']) || categories.some(value => value.startsWith('mens_')) || explicit('mens')) result.add('mens');
  if (hasAnyTerm(text, ['sport', 'athletic', 'activewear', 'training', 'teamwear', 'performance']) || categories.some(value => value.includes('sportswear')) || explicit('sportswear')) result.add('sportswear');
  if (hasAnyTerm(text, ['polo', 'quarter zip', 'quarter-zip', 'staff', 'uniform', 'corporate']) || explicit('business_apparel')) result.add('business_apparel');
  if (hasAnyTerm(text, ['workwear', 'work jacket', 'work shirt', 'work pant', 'utility']) || explicit('workwear')) result.add('workwear');
  if (hasAnyTerm(text, ['outdoor', 'rain', 'waterproof', 'weather', 'soft shell', 'softshell']) || explicit('outdoor')) result.add('outdoor');
  if (hasAnyTerm(text, ['performance', 'moisture wicking', 'moisture-wicking', 'dry fit', 'dri-fit']) || explicit('performance')) result.add('performance');

  return SECONDARY_TAG_OPTIONS.map(option => option.value).filter(value => result.has(value));
}

export function getStorefrontCategory(product) {
  const savedPrimaryType = normalizePrimaryGarmentType(product?.primary_garment_type || product?.display_category);
  if (savedPrimaryType) return savedPrimaryType;

  const text = productIdentityText(product);
  const brand = normalized(getProductBrand(product));
  const styleTokens = getStyleTokens(product);
  const categories = [
    ...asArray(product?.categories),
    product?.category,
  ].map(normalized).filter(Boolean);
  const subtype = normalized(product?.product_subtype);

  if (subtype === 'custom_printed' || subtype === 'print_support') return 'other';

  const styleRule = STYLE_CATEGORY_RULES.find(rule => (
    (brand === rule.brand || text.includes(rule.brand)) && rule.styles.some(style => styleTokens.has(style))
  ));
  if (styleRule) return styleRule.category;

  // Strong garment terms take precedence over loose or incorrect vendor labels.
  if (hasAnyTerm(text, ['hoodie', 'hooded', 'pullover hood', 'hooded sweatshirt', 'fleece hood'])) return 'hoodies';
  if (hasAnyTerm(text, ['quarter zip', 'quarter-zip', '1/4 zip', '1/4-zip'])) return 'quarter_zips';
  if (
    hasAnyTerm(text, ['jacket', 'outerwear', 'coat', 'soft shell', 'softshell', 'shell jacket', 'vest'])
  ) return 'outerwear';
  if (hasAnyTerm(text, ['jogger', 'sweatpant', 'sweat pant', 'track pant', 'athletic pant', 'legging', 'pants'])) return 'pants';
  if (hasAnyTerm(text, ['gym shorts', 'athletic shorts', 'performance shorts', 'shorts'])) return 'shorts';
  if (hasAnyTerm(text, ['fleece quarter zip', 'fleece 1/4 zip'])) return 'quarter_zips';
  if (hasAnyTerm(text, ['fleece jacket', 'fleece vest', 'fleece full zip'])
    || (brand === 'columbia' && hasAnyTerm(text, ['fleece', 'pullover', 'half zip', 'full zip']))) return 'outerwear';
  if (hasAnyTerm(text, ['crewneck', 'crew neck', 'fleece crew', 'sweatshirt', 'sweater'])) return 'crewnecks';
  if (hasAnyTerm(text, ['tank top', 'tank', 'sleeveless', 'muscle tee', 'muscle shirt'])) return 'tank_tops';
  if (hasAnyTerm(text, ['backpack', 'tote', 'duffel', 'duffle', 'bag'])) return 'bags';
  if (hasAnyTerm(text, ['beanie', 'headwear', 'baseball cap', 'trucker cap', 'snapback', 'cap', 'hat'])) return 'hats';
  if (hasAnyTerm(text, ['long sleeve tee', 'long sleeve t-shirt', 'long sleeve shirt', 'long-sleeve tee'])) return 'long_sleeve';
  if (hasAnyTerm(text, ['polo', 'golf shirt'])) return 'polos';
  if (hasAnyTerm(text, ['t-shirt', 't shirt', 'tee', 'short sleeve', 'pocket tee', 'softstyle', 'jersey tee'])) return 't_shirts';
  if (hasAnyTerm(text, ['performance shirt', 'sport shirt', 'athletic shirt', 'training top'])) return 't_shirts';
  if (hasAnyTerm(text, ['fleece', 'pullover'])) return 'crewnecks';

  // Vendor categories are fallback signals only after stronger title/style rules.
  if (hasAnyVendorCategory(categories, 'hoodies')) return 'hoodies';
  if (hasAnyVendorCategory(categories, 'fleece')) return 'crewnecks';
  if (hasAnyVendorCategory(categories, 'outerwear')) return 'outerwear';
  if (hasAnyVendorCategory(categories, 'crewnecks')) return 'crewnecks';
  if (hasAnyVendorCategory(categories, 'tank_tops')) return 'tank_tops';
  if (hasAnyVendorCategory(categories, 'bags')) return 'bags';
  if (hasAnyVendorCategory(categories, 'hats')) return 'hats';
  if (hasAnyVendorCategory(categories, 'long_sleeve')) return 'long_sleeve';
  if (hasAnyVendorCategory(categories, 'polos')) return 'polos';
  if (hasAnyVendorCategory(categories, 'pants')) return 'pants';
  if (hasAnyVendorCategory(categories, 'shorts')) return 'shorts';
  if (hasAnyVendorCategory(categories, 'sportswear')) return 't_shirts';
  if (hasAnyVendorCategory(categories, 't_shirts')) return 't_shirts';
  return 'other';
}

export function getStorefrontCategoryLabel(product) {
  return STOREFRONT_CATEGORY_LABELS[getStorefrontCategory(product)] || STOREFRONT_CATEGORY_LABELS.uncategorized;
}

export function matchesCategory(product, categoryValue) {
  if (!categoryValue || categoryValue === 'all') return true;
  if (categoryValue === 'custom_printed' || categoryValue === 'print_support') {
    return normalized(product?.product_subtype) === categoryValue;
  }
  if (SECONDARY_TAG_OPTIONS.some(option => option.value === categoryValue)) return getSecondaryTags(product).includes(categoryValue);
  const normalizedCategory = getStorefrontCategory(product);
  if (categoryValue === 'quarter_zips') return normalizedCategory === 'quarter_zips'
    || hasExplicitStorefrontCategoryTag(product, categoryValue);
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
    if (sort === 'featured') {
      const featuredDifference = Number(Boolean(b.is_featured)) - Number(Boolean(a.is_featured));
      if (featuredDifference) return featuredDifference;
    }
    if (sort === 'best_sellers') {
      const sellerDifference = Number(Boolean(b.is_best_seller)) - Number(Boolean(a.is_best_seller));
      if (sellerDifference) return sellerDifference;
    }
    const dateDifference = (Date.parse(b.created_date) || 0) - (Date.parse(a.created_date) || 0);
    return dateDifference || String(a.name || '').localeCompare(String(b.name || '')) || String(a.id || '').localeCompare(String(b.id || ''));
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
