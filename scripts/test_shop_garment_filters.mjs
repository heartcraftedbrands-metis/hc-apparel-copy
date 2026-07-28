import assert from 'node:assert/strict';

import {
  filterAndSortGarments,
  getProductColors,
  getProductSizes,
  getStorefrontCategory,
  getStorefrontCategoryLabel,
  matchesCategory,
} from '../src/lib/shopGarmentFilters.js';

const products = [
  {
    id: 'gildan-red',
    name: 'Gildan 5000 Heavy Cotton T-Shirt',
    price: 8.99,
    available_sizes: ['S', 'M', 'XL'],
    available_colors: [{ name: 'Red', hex: '#ff0000' }, { name: 'Black', hex: '#000000' }],
    categories: ['short_sleeve_shirts'],
    is_featured: true,
    is_best_seller: false,
    created_date: '2026-07-20T12:00:00Z',
  },
  {
    id: 'bella-blue',
    name: 'Bella + Canvas 3001 Jersey Tee',
    sale_price: 9.25,
    price: 10.25,
    available_sizes: ['XS', 'M', 'L'],
    available_colors: [{ name: 'Blue', hex: '#0000ff' }],
    categories: ['short_sleeve_shirts'],
    is_featured: false,
    is_best_seller: true,
    created_date: '2026-07-22T12:00:00Z',
  },
  {
    id: 'gildan-blue',
    name: 'Gildan 2400 Long Sleeve T-Shirt',
    price: 14.5,
    available_sizes: ['M', 'L', '2XL'],
    available_colors: [{ name: 'Blue', hex: '#0000ff' }],
    categories: ['long_sleeve_shirts'],
    is_featured: false,
    is_best_seller: false,
    created_date: '2026-07-24T12:00:00Z',
  },
  {
    id: 'champion-black',
    name: 'Champion S700 Hoodie',
    price: 27.99,
    available_sizes: [{ name: 'XL', inventory_qty: 4 }, { name: '3XL', inventory_qty: 0 }],
    available_colors: [{ name: 'Black', inventory_qty: 4 }, { name: 'Red', inventory_qty: 0 }],
    categories: ['hoodies'],
    is_featured: false,
    is_best_seller: false,
    created_date: '2026-07-21T12:00:00Z',
  },
];

const originalSnapshot = structuredClone(products);
const ids = result => result.map(product => product.id);
const run = filters => filterAndSortGarments(products, filters);

assert.deepEqual(ids(run({ brand: 'gildan' })), ['gildan-blue', 'gildan-red'], 'one brand filters immediately');
assert.deepEqual(ids(run({ sizes: ['XL'] })), ['champion-black', 'gildan-red'], 'one available size filters correctly');
assert.deepEqual(ids(run({ colors: ['blue'] })), ['gildan-blue', 'bella-blue'], 'one available color filters correctly');
assert.deepEqual(ids(run({ brand: 'gildan', sizes: ['M'] })), ['gildan-blue', 'gildan-red'], 'brand + size combines correctly');
assert.deepEqual(ids(run({ colors: ['blue'], sizes: ['L'] })), ['gildan-blue', 'bella-blue'], 'color + size combines correctly');
assert.equal(run({ brand: 'oakley' }).length, 0, 'no-match combination returns a clean zero count');

const resetResult = run({
  category: 'all',
  brand: 'all',
  search: '',
  minPrice: '',
  maxPrice: '',
  sizes: [],
  colors: [],
  featuredOnly: false,
  bestSellersOnly: false,
  sort: 'newest',
});
assert.deepEqual(ids(resetResult), ['gildan-blue', 'bella-blue', 'champion-black', 'gildan-red'], 'reset restores every product');
assert.deepEqual(ids(run({ sort: 'newest' })), ['gildan-blue', 'bella-blue', 'champion-black', 'gildan-red'], 'newest sort works');
assert.deepEqual(ids(run({ sort: 'price_asc' })), ['gildan-red', 'bella-blue', 'gildan-blue', 'champion-black'], 'low-to-high sort works');
assert.deepEqual(ids(run({ sort: 'price_desc' })), ['champion-black', 'gildan-blue', 'bella-blue', 'gildan-red'], 'high-to-low sort works');
assert.deepEqual(ids(run({ featuredOnly: true })), ['gildan-red'], 'featured filter uses only the featured flag');
assert.deepEqual(ids(run({ bestSellersOnly: true })), ['bella-blue'], 'best-seller filter uses only the best-seller flag');
assert.deepEqual(getProductSizes(products[3]), ['XL'], 'out-of-stock size values are excluded');
assert.deepEqual(getProductColors(products[3]), ['black'], 'out-of-stock color values are excluded');
assert.deepEqual(products, originalSnapshot, 'filtering and sorting do not mutate product data');

const categoryProducts = [
  {
    id: 'gildan-18500',
    name: 'Gildan 18500',
    style_number: '18500',
    product_subtype: 'apparel_blanks',
    categories: ['short_sleeve_shirts'],
    created_date: '2026-07-24T12:00:00Z',
  },
  {
    id: 'gildan-18000',
    name: 'Gildan 18000',
    style_number: '18000',
    product_subtype: 'apparel_blanks',
    categories: ['short_sleeve_shirts'],
    created_date: '2026-07-23T12:00:00Z',
  },
  {
    id: 'gildan-5000',
    name: 'Gildan 5000',
    style_number: '5000',
    product_subtype: 'apparel_blanks',
    categories: ['hoodies'],
    created_date: '2026-07-22T12:00:00Z',
  },
  {
    id: 'gildan-long-sleeve',
    name: 'Gildan Ultra Cotton Long Sleeve T-Shirt',
    categories: ['hoodies'],
    created_date: '2026-07-21T12:00:00Z',
  },
  {
    id: 'champion-s700',
    name: 'Champion S700',
    style_number: 'S700',
    categories: ['short_sleeve_shirts'],
    created_date: '2026-07-20T12:00:00Z',
  },
  {
    id: 'champion-crew',
    name: 'Champion Powerblend Crewneck Sweatshirt',
    categories: ['short_sleeve_shirts'],
    created_date: '2026-07-19T12:00:00Z',
  },
  {
    id: 'bella-tank',
    name: 'Bella + Canvas Women’s Flowy Racerback Tank',
    categories: ['short_sleeve_shirts'],
    created_date: '2026-07-18T12:00:00Z',
  },
];

const categoryIds = category => ids(filterAndSortGarments(categoryProducts, { category }));

assert.equal(getStorefrontCategory(categoryProducts[0]), 'hoodies', 'Gildan 18500 normalizes to Hoodies despite an incorrect imported shirt category');
assert.equal(getStorefrontCategory(categoryProducts[1]), 'crewnecks', 'Gildan 18000 normalizes to Crewnecks despite an incorrect imported shirt category');
assert.equal(getStorefrontCategory(categoryProducts[2]), 't_shirts', 'Gildan 5000 normalizes to T-Shirts from style metadata');
assert.equal(getStorefrontCategory(categoryProducts[3]), 'long_sleeve', 'long sleeve tees normalize separately from hoodies and crewnecks');
assert.equal(getStorefrontCategory(categoryProducts[4]), 'hoodies', 'Champion S700 normalizes to Hoodies from style metadata');
assert.equal(getStorefrontCategory(categoryProducts[5]), 'crewnecks', 'crewneck/sweatshirt title terms override an imported T-shirt category');
assert.equal(getStorefrontCategory(categoryProducts[6]), 'tank_tops', 'tank title terms override an imported T-shirt category');
assert.deepEqual(categoryIds('hoodies'), ['gildan-18500', 'champion-s700'], 'Hoodies contains only hoodie products');
assert.deepEqual(categoryIds('crewnecks'), ['gildan-18000', 'champion-crew'], 'Crewnecks contains only crewneck/sweatshirt products');
assert.deepEqual(categoryIds('long_sleeve'), ['gildan-long-sleeve'], 'Long Sleeve contains long sleeve T-shirts only');
assert.deepEqual(categoryIds('t_shirts'), ['gildan-5000', 'gildan-long-sleeve'], 'T-Shirts contains only short- and long-sleeve T-shirts');
assert.equal(categoryIds('hoodies').length, 2, 'normalized Hoodie sidebar count matches the two visible products');
assert.equal(categoryIds('crewnecks').length, 2, 'normalized Crewneck sidebar count matches the two visible products');
assert.deepEqual(ids(filterAndSortGarments(categoryProducts, { search: '18500' })), ['gildan-18500'], 'search still works with normalized categories');
assert.equal(getStorefrontCategoryLabel(categoryProducts[0]), 'Hoodie', 'product card/detail label uses the normalized category');
assert.equal(getStorefrontCategory({ name: 'Lane Seven LS14001', style_number: 'LS14001' }), 'hoodies', 'known Lane Seven hoodie styles normalize without a descriptive imported title');
assert.equal(getStorefrontCategory({ name: 'Lane Seven LS14004', style_number: 'LS14004' }), 'crewnecks', 'known Lane Seven crewneck styles normalize without a descriptive imported title');
assert.equal(getStorefrontCategory({ name: 'Independent Trading Co SS4500', style_number: 'SS4500' }), 'hoodies', 'known Independent hoodie styles normalize from style metadata');
assert.equal(getStorefrontCategory({ name: 'Oakley 22L Sport Backpack' }), 'bags', 'backpacks normalize to Bags');
assert.equal(getStorefrontCategory({ name: 'Adidas Structured Trucker Cap' }), 'hats', 'caps normalize to Hats');
assert.equal(getStorefrontCategory({ name: 'Columbia Steens Mountain Fleece Full-Zip 2.0', brand: 'Columbia' }), 'outerwear', 'Columbia fleece normalizes to Outerwear');
assert.equal(getStorefrontCategory({ name: 'Columbia Watertight II Jacket', brand: 'Columbia' }), 'outerwear', 'Columbia jackets normalize to Outerwear');
assert.equal(getStorefrontCategory({ name: 'Columbia Hooded Fleece Hoodie', brand: 'Columbia' }), 'hoodies', 'Columbia hoodies normalize to Hoodies before the broader fleece rule');
assert.equal(getStorefrontCategory({ name: 'Rabbit Skins 3321 Fine Jersey Tee' }), 'kids', 'Rabbit Skins products normalize to Youth / Kids');
assert.equal(matchesCategory({ name: 'Bella + Canvas Women’s Relaxed Jersey Tee' }, 'womens'), true, 'women-specific titles populate the Women’s filter');

const oakleyAccessories = [
  { id: 'oakley-cap', name: 'Oakley FOS900833', brand: 'Oakley', style_number: 'FOS900833' },
  { id: 'oakley-backpack', name: 'Oakley FOS901100', brand: 'Oakley', style_number: 'FOS901100' },
  { id: 'oakley-polo', name: 'Oakley FOA402993', brand: 'Oakley', style_number: 'FOA402993' },
  { id: 'oakley-hoodie', name: 'Oakley FOA402994', brand: 'Oakley', style_number: 'FOA402994' },
  { id: 'performance-shirt', name: 'Oakley Team Issue Performance Shirt', brand: 'Oakley' },
  {
    id: 'intentional-activewear-cap',
    name: 'Oakley FOS900833',
    brand: 'Oakley',
    style_number: 'FOS900833',
    tags: ['storefront:sportswear'],
  },
];
const oakleyIds = category => ids(filterAndSortGarments(oakleyAccessories, { category }));

assert.equal(getStorefrontCategory(oakleyAccessories[0]), 'hats', 'Oakley FOS900833 style metadata normalizes to Hats');
assert.equal(getStorefrontCategory(oakleyAccessories[1]), 'bags', 'Oakley FOS901100 style metadata normalizes to Bags');
assert.equal(getStorefrontCategory(oakleyAccessories[2]), 'polos', 'Oakley FOA402993 style metadata normalizes to Polos');
assert.equal(getStorefrontCategory(oakleyAccessories[3]), 'hoodies', 'Oakley FOA402994 style metadata normalizes to Hoodies');
assert.deepEqual(oakleyIds('hats'), ['oakley-cap', 'intentional-activewear-cap'], 'Hats contains headwear products only');
assert.deepEqual(oakleyIds('bags'), ['oakley-backpack'], 'Bags contains bag products only');
assert.deepEqual(
  oakleyIds('sportswear'),
  ['performance-shirt', 'intentional-activewear-cap'],
  'Sports / Activewear excludes hats and bags unless explicitly tagged for storefront overlap',
);

console.log('Shop Garments filter/category tests passed (47 assertions).');
