import { hasInternalProductCopy } from './publicProductCopy.js';

const KNOWN_BRANDS = [
  'American Apparel', 'Bella + Canvas', 'Comfort Colors', 'Independent Trading Co.',
  'Independent Trading Co', 'Lane Seven', 'Next Level', 'Rabbit Skins', 'Shaka Wear',
  'Champion', 'Columbia', 'Gildan', 'Hanes', 'Jerzees', 'Oakley', 'Tultex', 'Yupoong',
  'Flexfit', 'adidas',
];

const KNOWN_STYLE_NAMES = {
  'Gildan 18000': 'Heavy Blend Crewneck Sweatshirt',
  'Gildan 18500': 'Heavy Blend Hooded Sweatshirt',
  'Gildan 2000': 'Unisex Ultra Cotton T-Shirt',
  'Gildan 2400': 'Ultra Cotton Long Sleeve T-Shirt',
  'Gildan 5000': 'Heavy Cotton T-Shirt',
  'Gildan 64000': 'Softstyle T-Shirt',
  'Champion T453W': "Women's Heritage Jersey Crop T-Shirt",
  'Champion P800': 'Unisex Powerblend Open-Bottom Sweatpants with Pockets',
};

const TYPE_LABELS = {
  bags: 'Bag', fleece: 'Fleece', hats: 'Hat', headwear: 'Hat',
  hoodies: 'Hooded Sweatshirt', jackets: 'Jacket', outerwear: 'Jacket',
  polo_shirts: 'Polo', polos: 'Polo', sportswear: 'Performance Apparel',
  activewear: 'Performance Apparel', sweatshirts: 'Crewneck Sweatshirt',
  crewnecks: 'Crewneck Sweatshirt', tank_tops: 'Tank Top', tanks: 'Tank Top',
  t_shirts: 'T-Shirt', short_sleeve_shirts: 'T-Shirt',
  long_sleeve_shirts: 'Long Sleeve Shirt', vests: 'Vest',
  womens_styles: "Women's Style", youth_shirts: 'Youth Shirt', kids_apparel: 'Youth Apparel',
};

const cleanWhitespace = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const titleField = (product) => {
  const specs = product?.vendor_specs;
  if (!specs || Array.isArray(specs) || typeof specs !== 'object') return '';
  return cleanWhitespace(
    specs.product_title || specs.productTitle || specs.style_name || specs.styleName
    || specs.product_name || specs.productName || specs.title || specs.name,
  );
};

export function getProductBrand(product) {
  const explicit = cleanWhitespace(product?.brand);
  if (explicit) return explicit;
  const raw = cleanWhitespace(product?.name);
  const tagged = (product?.tags || []).find((tag) => (
    KNOWN_BRANDS.some((brand) => brand.toLowerCase() === cleanWhitespace(tag).toLowerCase())
  ));
  if (tagged) return cleanWhitespace(tagged);
  return KNOWN_BRANDS.find((brand) => (
    raw.toLowerCase().startsWith(`${brand.toLowerCase()} `)
    || raw.toLowerCase() === brand.toLowerCase()
  )) || '';
}

const stripLeadingVendorReference = (value, brand) => {
  let result = cleanWhitespace(value);
  if (brand) result = result.replace(new RegExp(`^${escapeRegex(brand)}\\s+`, 'i'), '');
  result = result.replace(/^[A-Z0-9][A-Z0-9.+/-]*(?:\s+[A-Z0-9][A-Z0-9.+/-]*)?\s+[-–—:]\s+/i, '');
  return cleanWhitespace(result);
};

const descriptiveNameTitle = (product, brand) => {
  const raw = cleanWhitespace(product?.name);
  if (!raw) return '';
  const afterDash = raw.includes(' — ')
    ? raw.split(' — ').pop()
    : (/\s[-–]\s/.test(raw) ? raw.split(/\s[-–]\s/).slice(1).join(' - ') : '');
  return afterDash ? stripLeadingVendorReference(afterDash, brand) : '';
};

const cleanStoredNameTitle = (product, brand) => {
  const raw = cleanWhitespace(product?.name);
  if (!raw || hasInternalProductCopy(raw)) return '';
  const title = stripLeadingVendorReference(raw, brand);
  if (!title || /^[-_./\d\s]+$/.test(title)) return '';
  return /\b(?:t-?shirt|tee|hoodie|hooded|sweatshirt|fleece|jacket|anorak|shirt|vest|tank|hat|cap|beanie|bag|long sleeve|crewneck|polo|shorts|pants|joggers|leggings|pullover|quarter-?zip|windbreaker|thermal)\b/i.test(title)
    ? title
    : '';
};

const descriptionTitle = (product, brand) => {
  let value = cleanWhitespace(product?.description);
  if (!value || hasInternalProductCopy(value)) return '';
  value = value.split(/\.\s+(?:Custom decoration|Brand:|Style:)/i)[0];
  value = value.replace(/\s+(?:Heavyweight\s+Shaka Wear|Premium\s+Columbia)\s+blank apparel.*$/i, '');
  const title = stripLeadingVendorReference(value, brand);
  return /\b(?:t-?shirt|tee|hoodie|sweatshirt|fleece|jacket|shirt|vest|tank|hat|cap|beanie|bag|long sleeve|crewneck|polo|shorts|pullover|windbreaker|thermal)\b/i.test(title)
    ? title
    : '';
};

const fallbackType = (product) => {
  const candidates = [product?.product_subtype, product?.category,
    ...(Array.isArray(product?.categories) ? product.categories : [])]
    .map((value) => cleanWhitespace(value).toLowerCase());
  const category = candidates.find((candidate) => TYPE_LABELS[candidate]
    || TYPE_LABELS[candidate.replace(/^(?:mens|womens|youth)_/, '')]);
  if (!category) return product?.product_type === 'digital' ? cleanWhitespace(product?.name) : 'Apparel Blank';
  const base = TYPE_LABELS[category] || TYPE_LABELS[category.replace(/^(?:mens|womens|youth)_/, '')];
  if (candidates.some((candidate) => candidate.includes('youth')) && !base.startsWith('Youth')) return `Youth ${base}`;
  if (candidates.some((candidate) => candidate.includes('women')) && !base.startsWith("Women's")) return `Women's ${base}`;
  return base;
};

const withBrand = (title, brand) => {
  const cleanTitle = cleanWhitespace(title);
  if (!brand || cleanTitle.toLowerCase().startsWith(brand.toLowerCase())) return cleanTitle;
  return `${brand} ${cleanTitle}`;
};

export function getProductStyleReferences(product) {
  const brand = getProductBrand(product);
  const references = [];
  const add = (value) => {
    const clean = cleanWhitespace(value);
    if (clean && !references.some((entry) => entry.toLowerCase() === clean.toLowerCase())) references.push(clean);
  };
  add(product?.style_number);
  add(product?.supplier_sku);
  const rawPrefix = cleanWhitespace(product?.name).split(/\s(?:—|–|-)\s/)[0];
  const withoutBrand = brand ? rawPrefix.replace(new RegExp(`^${escapeRegex(brand)}\\s*`, 'i'), '') : rawPrefix;
  const prefixParts = cleanWhitespace(withoutBrand).split(' ').filter(Boolean);
  if (prefixParts.some((part) => /\d/.test(part))) prefixParts.forEach(add);
  add(cleanWhitespace(product?.description).match(/\bStyle:\s*([^.;]+)/i)?.[1]);
  return references;
}

export function getProductStyleLabel(product) {
  return getProductStyleReferences(product).join(' / ');
}

export function getPublicProductName(product) {
  if (!product) return '';
  if (product.product_type === 'digital') return cleanWhitespace(product.name);
  const brand = getProductBrand(product);
  const explicit = cleanWhitespace(product.public_display_name || product.display_name);
  if (explicit) return withBrand(explicit, brand);
  const importedTitle = stripLeadingVendorReference(titleField(product), brand);
  const genericImportedTitle = /^(?:apparel(?: blank)?|garment|jacket|shirt|polo|pullover|hoodie|sweatshirt|t-?shirt|tee|pants?|shorts?|hat|cap|bag)$/i.test(importedTitle);
  if (importedTitle && !genericImportedTitle) return withBrand(importedTitle, brand);
  const fromName = descriptiveNameTitle(product, brand);
  if (fromName) return withBrand(fromName, brand);
  const storedName = cleanStoredNameTitle(product, brand);
  if (storedName) return withBrand(storedName, brand);
  if (importedTitle) return withBrand(importedTitle, brand);
  const references = getProductStyleReferences(product);
  const knownName = Object.entries(KNOWN_STYLE_NAMES).find(([key]) => {
    const separator = key.lastIndexOf(' ');
    const knownBrand = key.slice(0, separator);
    const knownStyle = key.slice(separator + 1);
    return brand.toLowerCase() === knownBrand.toLowerCase()
      && references.some((reference) => reference.toLowerCase() === knownStyle.toLowerCase());
  })?.[1];
  if (knownName) return withBrand(knownName, brand);
  const fromDescription = descriptionTitle(product, brand);
  if (fromDescription) return withBrand(fromDescription, brand);
  return withBrand(fallbackType(product), brand);
}
