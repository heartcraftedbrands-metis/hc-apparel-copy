export const createOrderHelpUrl = ({
  product,
  productId,
  brand,
  styleNumber,
  imageUrl,
  quantity = 1,
  color,
  size,
  sku,
} = {}) => {
  const params = new URLSearchParams();
  if (product) params.set('product', product);
  if (productId) params.set('product_id', productId);
  if (brand) params.set('brand', brand);
  if (styleNumber) params.set('style_number', styleNumber);
  if (imageUrl) params.set('image_url', imageUrl);
  if (quantity) params.set('quantity', String(quantity));
  if (color) params.set('color', color);
  if (size) params.set('size', size);
  if (sku) params.set('sku', sku);
  return `/RequestOrderHelp?${params.toString()}`;
};
