export const createOrderHelpUrl = ({
  product,
  quantity = 1,
  color,
  size,
  sku,
} = {}) => {
  const params = new URLSearchParams({ mode: 'order-help' });
  if (product) params.set('product', product);
  if (quantity) params.set('quantity', String(quantity));
  if (color) params.set('color', color);
  if (size) params.set('size', size);
  if (sku) params.set('sku', sku);
  return `/Contact?${params.toString()}`;
};
