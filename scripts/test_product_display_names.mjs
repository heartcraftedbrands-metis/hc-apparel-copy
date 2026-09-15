import assert from 'node:assert/strict';

import {
  getProductBrand,
  getProductStyleLabel,
  getPublicProductName,
} from '../src/lib/productDisplayName.js';

const shaka = {
  name: 'Shaka Wear 012C2 SHGMT',
  brand: 'Shaka Wear',
  style_number: '012C2',
  category: 'short_sleeve_shirts',
  product_subtype: 't_shirts',
  description: 'Unisex Garment-Dyed Muscle Tee Heavyweight Shaka Wear blank apparel. Custom decoration is optional and priced separately.',
};
assert.equal(getPublicProductName(shaka), 'Shaka Wear Unisex Garment-Dyed Muscle Tee');
assert.equal(getProductStyleLabel(shaka), '012C2 / SHGMT');

const gildan5000 = {
  name: 'Gildan 5000',
  brand: 'Gildan',
  style_number: '00060',
  category: 'short_sleeve_shirts',
  product_subtype: 't_shirts',
  description: 'Private S&S Activewear catalog-batch product. Not approved for the public storefront.',
};
assert.equal(getPublicProductName(gildan5000), 'Gildan Heavy Cotton T-Shirt');
assert.equal(getProductStyleLabel(gildan5000), '00060 / 5000');

const gildan18500 = { ...gildan5000, name: 'Gildan 18500', style_number: '22060' };
assert.equal(getPublicProductName(gildan18500), 'Gildan Heavy Blend Hooded Sweatshirt');

const columbia = {
  name: 'Columbia 22124 213684',
  brand: 'Columbia',
  style_number: '22124',
  category: 'outerwear',
  description: "Men's Essential Hike™ Grid Fleece Full-Zip Premium Columbia blank apparel. Custom decoration is priced separately.",
};
assert.equal(getPublicProductName(columbia), "Columbia Men's Essential Hike™ Grid Fleece Full-Zip");
assert.equal(getProductStyleLabel(columbia), '22124 / 213684');

const champion = {
  name: "Champion T453W — Champion T453W - Women's Heritage Jersey Crop T-Shirt",
  tags: ['Champion', 'Sports / Activewear', 'T-Shirt'],
  category: 'short_sleeve_shirts',
  product_subtype: 't_shirts',
};
assert.equal(getProductBrand(champion), 'Champion');
assert.equal(getPublicProductName(champion), "Champion Women's Heritage Jersey Crop T-Shirt");
assert.equal(getProductStyleLabel(champion), 'T453W');

const fallback = { name: 'Oakley FOA402993', brand: 'Oakley', product_subtype: 'sportswear' };
assert.equal(getPublicProductName(fallback), 'Oakley Performance Apparel');

console.log('Product display name checks passed.');
