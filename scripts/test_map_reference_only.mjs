import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../supabase/migrations/202609250002_remove_map_pricing_policy.sql', import.meta.url), 'utf8');
const edge = await readFile(new URL('../supabase/functions/ss-activewear/index.ts', import.meta.url), 'utf8');
const preview = await readFile(new URL('../src/pages/AdminSSPricingPreview.jsx', import.meta.url), 'utf8');

assert.match(migration, /map_policy', 'reference_only'/);
assert.match(migration, /msrp_policy', 'reference_only'/);
assert.match(migration, /worst_case_enabled/);
assert.match(migration, /public\.ss_staged_safe_price\(s\.customer_price\)/);
assert.doesNotMatch(migration, /greatest\([\s\S]{0,300}map_price/);
assert.match(edge, /MAP and MSRP are retained for admin reference only/);
assert.doesNotMatch(edge, /recommended = Math\.max\(safeFloor, explicitMap\)/);
assert.match(preview, /MAP \/ MSRP policy/);

console.log('MAP and MSRP remain reference-only throughout active HC Apparel pricing paths.');
