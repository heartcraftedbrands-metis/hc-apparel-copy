/**
 * Normalizes inventory from any possible imported field name to a number.
 * Handles "Inventory Qty" (space), "100+", stock status fallback.
 * Returns 0 if the value is blank, null, or non-numeric.
 */
export function normalizeInventory(item) {
  // inventory_qty is the canonical DB field — always prefer it if it's a positive number
  if (typeof item.inventory_qty === 'number' && item.inventory_qty > 0) return item.inventory_qty;

  // Try all known field name variants (for DB records that may have been imported with different names)
  const candidates = [
    item.inventory_qty,          // numeric 0 stored in DB (stale)
    item['inventory qty'],       // CSV header with space
    item.inventory,              // alternate field name
    item.qty,
    item.quantity,
    item.stock_qty,
    item['stock qty'],
    item.stock,
    item.available_quantity,
    item['available qty'],
  ];

  for (const raw of candidates) {
    if (raw === undefined || raw === null || raw === '') continue;
    const n = parseInt(String(raw).replace(/[^0-9]/g, ''), 10);
    if (!isNaN(n) && n > 0) return n;
  }

  return 0;
}

/**
 * Normalizes blank cost from any possible imported field name to a number.
 * Returns 0 if blank, null, or non-numeric.
 */
export function normalizeCost(item) {
  const raw = item.blank_cost ?? item['blank cost'] ?? item.cost ?? item.price ?? null;
  if (raw === null || raw === undefined || raw === '') return 0;
  const n = parseFloat(String(raw).replace(/[^0-9\-\.]/g, ''));
  return isNaN(n) ? 0 : n;
}

/**
 * Suggests a Product Lane based on keyword matching.
 * Checks product_lane field first (already classified), then falls back to keyword matching.
 * Does NOT auto-approve — only returns a suggestion string.
 */

const VALID_LANES = new Set([
  'Cotton', 'Organic Cotton', 'Ring-Spun Cotton', 'Cotton Blend', 'CVC',
  'Linen', 'Wool', 'Bamboo', 'Bamboo Blend', 'Sports / Activewear',
  'Hoodie / Fleece', 'Youth', 'Other',
]);

export function suggestLane(item) {
  // Already classified with a valid lane — use it directly
  if (item.product_lane && VALID_LANES.has(item.product_lane)) return item.product_lane;

  // Check legacy field names that may have been imported differently
  const legacyLane = item.lane || item.suggested_lane || item.suggested_product_lane || item.material_lane || item.curated_lane;
  if (legacyLane && VALID_LANES.has(legacyLane)) return legacyLane;

  // Build searchable text from all relevant fields
  const text = [
    item.product_name,
    item.description,
    item.style_number,
    item.material,
    item.fabric_details,
    item.product_category,
    item.review_notes,
    item.fit,
    item.care_notes,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (!text) return '';

  // Youth — check early
  if (/\byouth\b|\bkids\b|\btoddler\b|\binfant\b|\bbaby\b/.test(text)) return 'Youth';

  // Hoodie / Fleece
  if (/\bhoodie\b|\bhooded\b|\bfleece\b|\bsweatshirt\b|\bcrewneck\b|\bcrew\s+neck\b|\bpullover\b|\bsweatpant\b|\bjogger\b/.test(text)) return 'Hoodie / Fleece';

  // CVC — must come before Cotton checks
  if (/\bcvc\b/.test(text)) return 'CVC';

  // Organic Cotton
  if (/organic\s+cotton|\borganic\b/.test(text)) return 'Organic Cotton';

  // Ring-Spun Cotton
  if (/ring[\s-]?spun|ringspun|combed\s+ring|airlume/.test(text)) return 'Ring-Spun Cotton';

  // Bamboo Blend — before generic Bamboo
  if (/bamboo[\s-]+(blend|cotton)|bamboo\s+cotton/.test(text)) return 'Bamboo Blend';

  // Cotton Blend — before generic Cotton
  if (/cotton[\s-]blend|cotton[\s-\/]poly|poly[\s-\/]cotton|polyester[\s-]cotton|cotton\s+polyester/.test(text)) return 'Cotton Blend';

  // Bamboo
  if (/\bbamboo\b/.test(text)) return 'Bamboo';

  // Linen
  if (/\blinen\b/.test(text)) return 'Linen';

  // Wool
  if (/\bwool\b|\bmerino\b/.test(text)) return 'Wool';

  // Sports / Activewear — broad net
  if (/\bsport\b|\bsports\b|\bactive\b|\bactivewear\b|\bathletic\b|\bperformance\b|\bjersey\b|\bmesh\b|\bshorts\b|\btank\b|\bpolo\b|\bracerback\b|\btraining\b|\bworkout\b|\bdri[\s-]?fit\b|\bmoisture\b|\bwicking\b/.test(text)) return 'Sports / Activewear';

  // Cotton (generic — after all sub-types)
  if (/100%\s*cotton|cotton\s+tee|cotton\s+t[\s-]?shirt|cotton\s+shirt|cotton\s+jersey|\bcotton\b/.test(text)) return 'Cotton';

  return '';
}

/**
 * For a given item, returns the best lane: product_lane if valid, else computed suggestion.
 */
export function getEffectiveLane(item) {
  if (item.product_lane && VALID_LANES.has(item.product_lane)) return item.product_lane;
  return suggestLane(item);
}

export { VALID_LANES };