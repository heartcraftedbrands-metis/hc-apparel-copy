import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  BULK_QUOTE_MESSAGE,
  buildCustomizedCartItem,
  findCustomizationVariant,
  getCartItemKey,
  getCustomizationColors,
  getCustomizationSizes,
  getCustomizedCartQuantity,
  getSmallOrderCartQuantity,
  isAcceptedArtworkFile,
  isBlankFirstProduct,
  validateCustomization,
} from '../src/lib/productCustomization.js';

const product = {
  id: 'product-1',
  name: 'Bella + Canvas 3001',
  price: 9.25,
  product_type: 'physical',
  image_url: 'https://example.test/product.jpg',
  size_prices: [
    { size: 'Black / S', sku: 'BC3001-BLK-S', price: 9.25, inventory: 10 },
    { size: 'Black / M', sku: 'BC3001-BLK-M', price: 9.75, inventory: 8 },
    { size: 'White / S', sku: 'BC3001-WHT-S', price: 9.25, inventory: 0 },
  ],
};

const complete = {
  selectedColor: 'Black',
  selectedSize: 'S',
  quantity: 1,
  artwork_file_url: 'supabase://customer-files/uploads/user-id/artwork.png',
  artwork_file_name: 'artwork.png',
  decoration_method: 'DTF',
  print_placement: 'front_center',
  print_size_option: 'standard_front',
  print_notes: 'Print two inches below collar.',
};

assert.deepEqual(getCustomizationColors(product), ['Black'], 'only in-stock colors are offered');
assert.deepEqual(getCustomizationSizes(product, 'Black'), ['S', 'M'], 'sizes follow the selected color');
assert.equal(findCustomizationVariant(product, 'Black', 'M')?.sku, 'BC3001-BLK-M', 'selected SKU resolves');
assert.equal(isAcceptedArtworkFile({ name: 'logo.PSD' }), true, 'PSD artwork is accepted');
assert.equal(isAcceptedArtworkFile({ name: 'notes.txt' }), false, 'unsupported artwork is rejected');

assert.ok(
  validateCustomization({ ...complete, artwork_file_url: '' }).includes('Upload artwork before adding this item to cart.'),
  'missing artwork blocks cart',
);
assert.ok(
  validateCustomization({ ...complete, decoration_method: '' }).includes('Select a decoration method.'),
  'missing decoration method blocks cart',
);
assert.ok(
  validateCustomization({ ...complete, print_placement: '' }).includes('Select a print placement.'),
  'missing placement blocks cart',
);
assert.deepEqual(validateCustomization(complete), [], 'quantity 1 with complete customization can add');
assert.deepEqual(validateCustomization({ ...complete, quantity: 49 }), [], 'quantity 49 can add');
assert.ok(
  validateCustomization({ ...complete, quantity: 50 }).includes(BULK_QUOTE_MESSAGE),
  'quantity 50 is blocked for Bulk Quote 50+',
);
assert.ok(
  validateCustomization(complete, { existingCartQuantity: 49 }).includes(BULK_QUOTE_MESSAGE),
  'combined customized cart quantity 50 is blocked',
);

const item = buildCustomizedCartItem(product, complete);
assert.equal(item.product_id, product.id, 'cart saves product ID');
assert.equal(item.product_name, product.name, 'cart saves product name');
assert.equal(item.sku, 'BC3001-BLK-S', 'cart saves selected SKU');
assert.equal(item.color, 'Black', 'cart saves color');
assert.equal(item.size, 'S', 'cart saves size');
assert.equal(item.quantity, 1, 'cart saves quantity');
assert.equal(item.artwork_file_url, complete.artwork_file_url, 'cart saves private artwork reference');
assert.equal(item.artwork_file_name, complete.artwork_file_name, 'cart saves safe artwork display name');
assert.equal(item.decoration_method, 'DTF', 'cart saves decoration method');
assert.equal(item.print_placement, 'front_center', 'cart saves placement');
assert.equal(item.print_size_option, 'standard_front', 'cart saves print size');
assert.equal(item.print_notes, complete.print_notes, 'cart saves print notes');
assert.equal(getCustomizedCartQuantity([item, { quantity: 20 }]), 1, 'only customized garments count toward bulk threshold');
assert.equal(getSmallOrderCartQuantity([item, { quantity: 20 }]), 21, 'all physical garments count toward the small-order threshold');
assert.notEqual(
  getCartItemKey(item),
  getCartItemKey({ ...item, customization_id: 'different-artwork' }),
  'different customization setups remain separate cart lines',
);

const blankForm = {
  selectedColor: 'Black',
  selectedSize: 'M',
  quantity: 1,
  customization_requested: false,
};
assert.deepEqual(validateCustomization(blankForm), [], 'blank garment does not require artwork or decoration');
const blankItem = buildCustomizedCartItem(product, blankForm);
assert.equal(blankItem.is_customized, false, 'blank cart line is not marked customized');
assert.equal(blankItem.purchase_mode, 'blank', 'blank cart line records blank purchase mode');
assert.equal(blankItem.artwork_file_url, '', 'blank cart line has no artwork requirement');
assert.equal(blankItem.price, 9.25, 'blank cart line uses storefront product price');
assert.equal(isBlankFirstProduct(product), true, 'physical blank apparel is blank-first');
assert.equal(
  isBlankFirstProduct({ ...product, product_subtype: 'custom_printed' }),
  false,
  'custom-print products retain customization-first flow',
);

const dialogSource = fs.readFileSync(
  new URL('../src/components/shop/ProductCustomizationDialog.jsx', import.meta.url),
  'utf8',
);
const cardSource = fs.readFileSync(
  new URL('../src/components/shop/GarmentProductCard.jsx', import.meta.url),
  'utf8',
);
assert.match(dialogSource, /bucket:\s*'customer-files'/, 'artwork uses the private customer-files bucket');
assert.match(dialogSource, /Upload your print-ready artwork\. PNG with transparent background is preferred\./);
assert.match(cardSource, /ProductCustomizationDialog/, 'product-card CTA opens the customization dialog');
assert.doesNotMatch(cardSource, /Request Order Help/, 'product cards do not show Request Order Help');
assert.match(cardSource, /Add Blank to Cart/, 'blank product cards use blank-first wording');

console.log('Product customization and blank-cart tests passed.');
