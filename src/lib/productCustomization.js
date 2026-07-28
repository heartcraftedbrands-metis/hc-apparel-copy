import { getProductPrice } from './shopGarmentFilters.js';

export const ARTWORK_ACCEPT = '.png,.jpg,.jpeg,.pdf,.svg,.ai,.eps,.psd';
export const ARTWORK_EXTENSIONS = ['png', 'jpg', 'jpeg', 'pdf', 'svg', 'ai', 'eps', 'psd'];
export const BULK_QUOTE_MESSAGE = 'Orders of 50 or more require a Bulk Quote 50+.';

export const DECORATION_METHODS = [
  { value: 'DTF', label: 'DTF' },
  { value: 'DTG', label: 'DTG' },
  { value: 'embroidery', label: 'Embroidery' },
  { value: 'screen_print', label: 'Screen Print' },
  { value: 'other', label: 'Other / Not Sure' },
];

export const PRINT_PLACEMENTS = [
  { value: 'front_center', label: 'Front Center' },
  { value: 'left_chest', label: 'Left Chest' },
  { value: 'back', label: 'Back' },
  { value: 'sleeve', label: 'Sleeve' },
  { value: 'custom', label: 'Custom' },
];

export const PRINT_SIZE_OPTIONS = [
  { value: 'small_chest', label: 'Small Chest' },
  { value: 'standard_front', label: 'Standard Front' },
  { value: 'oversized_front', label: 'Oversized Front' },
  { value: 'back_print', label: 'Back Print' },
  { value: 'custom_notes', label: 'Custom Notes' },
];

const optionLabel = (value) => {
  if (value && typeof value === 'object') {
    return String(value.name ?? value.color ?? value.size ?? value.value ?? value.label ?? '').trim();
  }
  return String(value ?? '').trim();
};

const normalized = (value) => optionLabel(value).toLowerCase().replace(/\s+/g, ' ').trim();

const isAvailable = (value) => {
  if (!value || typeof value !== 'object') return true;
  const key = ['inventory_qty', 'inventory', 'quantity', 'stock', 'available_quantity']
    .find(candidate => value[candidate] !== undefined && value[candidate] !== null);
  return !key || Number(value[key]) > 0;
};

const parseVariant = (entry) => {
  const raw = String(entry?.size ?? '').trim();
  const separator = raw.indexOf(' / ');
  if (separator === -1) return null;
  return {
    color: raw.slice(0, separator).trim(),
    size: raw.slice(separator + 3).trim(),
    sku: String(entry?.sku ?? '').trim(),
    price: Number.isFinite(Number(entry?.price)) ? Number(entry.price) : null,
    inventory: entry?.inventory === null || entry?.inventory === undefined
      ? null
      : Number(entry.inventory),
    image_url: entry?.image_url || '',
  };
};

export function getCustomizationVariants(product) {
  return (product?.size_prices || [])
    .map(parseVariant)
    .filter(Boolean);
}

export function getCustomizationColors(product) {
  const variants = getCustomizationVariants(product)
    .filter(variant => variant.inventory === null || variant.inventory > 0)
    .map(variant => variant.color);
  const fallback = (product?.available_colors || [])
    .filter(isAvailable)
    .map(optionLabel);
  return [...new Set((variants.length ? variants : fallback).filter(Boolean))];
}

export function getCustomizationSizes(product, selectedColor = '') {
  const normalizedColor = normalized(selectedColor);
  const variants = getCustomizationVariants(product)
    .filter(variant => (
      (!normalizedColor || normalized(variant.color) === normalizedColor)
      && (variant.inventory === null || variant.inventory > 0)
    ))
    .map(variant => variant.size);
  const fallback = (product?.available_sizes || [])
    .filter(isAvailable)
    .map(optionLabel);
  return [...new Set((variants.length ? variants : fallback).filter(Boolean))];
}

export function findCustomizationVariant(product, selectedColor, selectedSize) {
  const color = normalized(selectedColor);
  const size = normalized(selectedSize);
  return getCustomizationVariants(product).find(variant => (
    normalized(variant.color) === color && normalized(variant.size) === size
  )) || null;
}

export function isAcceptedArtworkFile(file) {
  const extension = String(file?.name || '').split('.').pop()?.toLowerCase();
  return Boolean(extension && ARTWORK_EXTENSIONS.includes(extension));
}

export function validateCustomization(customization, options = {}) {
  const errors = [];
  const quantity = Number(customization?.quantity);
  const existingCartQuantity = Number(options.existingCartQuantity) || 0;

  if (!customization?.selectedColor) errors.push('Select a color.');
  if (!customization?.selectedSize) errors.push('Select a size.');
  if (!Number.isInteger(quantity) || quantity < 1) errors.push('Enter a whole-number quantity of at least 1.');
  if (Number.isInteger(quantity) && quantity >= 50) errors.push(BULK_QUOTE_MESSAGE);
  if (
    Number.isInteger(quantity)
    && quantity > 0
    && existingCartQuantity + quantity >= 50
  ) {
    errors.push(BULK_QUOTE_MESSAGE);
  }
  if (!customization?.decoration_method) errors.push('Select a decoration method.');
  if (!customization?.print_placement) errors.push('Select a print placement.');
  if (!customization?.print_size_option) errors.push('Select a print size.');
  if (!customization?.artwork_file_url) errors.push('Upload artwork before adding this item to cart.');

  const inventory = options.inventory;
  if (
    Number.isFinite(inventory)
    && inventory >= 0
    && Number.isInteger(quantity)
    && quantity > inventory
  ) {
    errors.push(`Only ${inventory} units are available for this color and size.`);
  }

  return [...new Set(errors)];
}

export function buildCustomizedCartItem(product, customization) {
  const variant = findCustomizationVariant(
    product,
    customization.selectedColor,
    customization.selectedSize,
  );
  const price = getProductPrice(product) || variant?.price || 0;

  return {
    id: product.id,
    product_id: product.id,
    name: product.name,
    product_name: product.name,
    brand: product.brand || String(product.name || '').split(/\s+/)[0] || '',
    style_number: product.style_number || product.supplier_sku || '',
    price,
    image_url: variant?.image_url || product.image_url || '',
    selectedColor: variant?.color || customization.selectedColor,
    selectedSize: variant?.size || customization.selectedSize,
    color: variant?.color || customization.selectedColor,
    size: variant?.size || customization.selectedSize,
    sku: variant?.sku || product.sku || null,
    quantity: Number(customization.quantity),
    product_type: product.product_type || 'physical',
    stock: variant?.inventory ?? product.stock,
    is_customized: true,
    customization_id: globalThis.crypto?.randomUUID?.()
      || `custom-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    artwork_file_url: customization.artwork_file_url,
    artwork_file_name: customization.artwork_file_name,
    decoration_method: customization.decoration_method,
    print_placement: customization.print_placement,
    print_size_option: customization.print_size_option,
    print_notes: customization.print_notes?.trim() || '',
  };
}

export function getCartItemKey(item) {
  return [
    item?.id || item?.product_id || '',
    item?.selectedSize || item?.size || '',
    item?.selectedColor || item?.color || '',
    item?.customization_id || '',
  ].join('|');
}

export function getCustomizedCartQuantity(cart) {
  return (cart || []).reduce((total, item) => (
    total + (item?.is_customized ? Number(item.quantity) || 0 : 0)
  ), 0);
}
