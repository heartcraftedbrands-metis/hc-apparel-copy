export const SS_ACTIVEWEAR_BRANDS = [
  'Gildan',
  'Bella + Canvas',
  'Comfort Colors',
  'DRI DUCK',
  'Shaka Wear',
  'Next Level',
  'Jerzees',
  'Hanes',
  'Rabbit Skins',
  'Adidas',
  'Oakley',
  'Champion',
  'Lane Seven',
  'American Apparel',
  'Tultex',
  'Columbia',
  'Independent Trading Co',
  'Port & Company',
];

export function brandFilterValue(brand) {
  return brand.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}
