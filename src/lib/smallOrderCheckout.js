import { BULK_QUOTE_MESSAGE } from './productCustomization.js';

const text = (value) => String(value ?? '').trim();

const addressValue = (address, ...keys) => {
  for (const key of keys) {
    const value = text(address?.[key]);
    if (value) return value;
  }
  return '';
};

export function isPrivateArtworkReference(value) {
  return /^supabase:\/\/customer-files\/uploads\/[^/]+\/.+/i.test(text(value));
}

export function validateCheckoutCart(cart) {
  const errors = [];
  const items = Array.isArray(cart) ? cart : [];
  const totalQuantity = items.reduce((sum, item) => sum + (Number(item?.quantity) || 0), 0);

  if (!items.length) errors.push('Your cart is empty.');
  if (totalQuantity >= 50) errors.push(BULK_QUOTE_MESSAGE);

  items.forEach((item, index) => {
    const label = text(item?.product_name || item?.name) || `Item ${index + 1}`;
    const isCustomized = (
      item?.is_customized === true
      || item?.purchase_mode === 'customized'
      || Boolean(
        text(item?.artwork_file_url)
        || text(item?.decoration_method)
        || text(item?.print_placement)
        || text(item?.print_size_option)
      )
    );
    if (!text(item?.product_id || item?.id)) errors.push(`${label}: product is missing.`);
    if (!text(item?.color || item?.selectedColor)) errors.push(`${label}: color is missing.`);
    if (!text(item?.size || item?.selectedSize)) errors.push(`${label}: size is missing.`);
    if (!Number.isInteger(Number(item?.quantity)) || Number(item.quantity) < 1) {
      errors.push(`${label}: quantity must be a whole number of at least 1.`);
    }
    if (isCustomized) {
      if (!isPrivateArtworkReference(item?.artwork_file_url)) {
        errors.push(`${label}: private artwork upload is missing.`);
      }
      if (!text(item?.decoration_method)) errors.push(`${label}: decoration method is missing.`);
      if (!text(item?.print_placement)) errors.push(`${label}: print placement is missing.`);
      if (!text(item?.print_size_option)) errors.push(`${label}: print size is missing.`);
    }
  });

  return [...new Set(errors)];
}

export function validateCheckoutCustomer(customer) {
  const errors = [];
  const shipping = customer?.shipping_address || {};
  const billing = customer?.billing_address || {};

  if (!text(customer?.customer_name)) errors.push('Customer name is required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(customer?.customer_email))) {
    errors.push('A valid customer email is required.');
  }
  if (
    !addressValue(shipping, 'street', 'line1', 'address1')
    || !text(shipping.city)
    || !text(shipping.state)
    || !addressValue(shipping, 'zip', 'postal_code')
  ) errors.push('A complete shipping address is required.');
  if (
    !addressValue(billing, 'street', 'line1', 'address1')
    || !text(billing.city)
    || !text(billing.state)
    || !addressValue(billing, 'zip', 'postal_code')
  ) errors.push('A complete billing address is required.');

  return errors;
}

export function buildSmallOrderCheckoutPayload(cart, customer) {
  const items = cart.map((item) => ({
    product_id: item.product_id || item.id,
    product_name: item.product_name || item.name,
    brand: item.brand || '',
    style_number: item.style_number || item.supplier_sku || '',
    sku: item.sku || null,
    color: item.color || item.selectedColor,
    size: item.size || item.selectedSize,
    quantity: Number(item.quantity),
    price: Number(item.price) || 0,
    image_url: item.image_url || '',
    product_type: item.product_type || 'physical',
    purchase_mode: item.is_customized ? 'customized' : 'blank',
    is_customized: item.is_customized === true,
    artwork_file_url: item.artwork_file_url || '',
    artwork_file_name: item.artwork_file_name || '',
    decoration_method: item.decoration_method || '',
    print_placement: item.print_placement || '',
    print_size_option: item.print_size_option || '',
    print_notes: text(item.print_notes),
  }));
  const orderTotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return {
    customer_name: text(customer.customer_name),
    customer_email: text(customer.customer_email).toLowerCase(),
    customer_phone: text(customer.customer_phone) || null,
    shipping_address: customer.shipping_address,
    billing_address: customer.billing_address,
    shipping_method: text(customer.shipping_method) || 'standard',
    delivery_notes: text(customer.delivery_notes) || null,
    order_total: Number(orderTotal.toFixed(2)),
    items,
  };
}

export function getVendorDraftWarnings(draft) {
  const warnings = [];
  const items = Array.isArray(draft?.items) ? draft.items : [];
  if (!items.length) warnings.push('No product items');
  if (items.some(item => !text(item.sku))) warnings.push('Missing SKU');
  const customizedItems = items.filter(item => (
    item?.is_customized === true
    || item?.purchase_mode === 'customized'
    || Boolean(
      text(item?.artwork_file_url)
      || text(item?.decoration_method)
      || text(item?.print_placement)
      || text(item?.print_size_option)
    )
  ));
  if (customizedItems.some(item => !text(item.artwork_file_url))) warnings.push('Missing artwork');
  if (customizedItems.some(item => !text(item.decoration_method))) warnings.push('Missing decoration method');
  if (customizedItems.some(item => !text(item.print_placement))) warnings.push('Missing print placement');
  if (items.some(item => Number(item.quantity) <= 0)) warnings.push('Missing quantity');
  const address = draft?.shipping_address || {};
  if (
    !addressValue(address, 'street', 'line1', 'address1')
    || !text(address.city)
    || !text(address.state)
    || !addressValue(address, 'zip', 'postal_code')
  ) warnings.push('Missing shipping address');
  if (draft?.payment_status !== 'paid') warnings.push('Unpaid order');
  return warnings;
}
