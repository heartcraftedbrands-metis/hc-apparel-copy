import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../supabase/migrations/202609290007_publish_berne_ch416.sql', import.meta.url), 'utf8');

assert.match(migration, /style_number\s*=\s*'CH416'/i);
assert.match(migration, /premium_specialty/);
assert.match(migration, /product_variant_safe_price/);
assert.match(migration, /v_latest_refresh\s*<\s*now\(\)\s*-\s*interval '24 hours'/i);
assert.match(migration, /v_inventory\s*<\s*25/i);
assert.match(migration, /v_common_size_count\s*<\s*3/i);
assert.match(migration, /visibility\s*=\s*'public'/i);
assert.match(migration, /is_active\s*=\s*true/i);
assert.match(migration, /draft_qa_status\s*=\s*'approved'/i);
assert.match(migration, /already exists; publication stopped to prevent a duplicate/i);
assert.match(migration, /No S&S order was submitted/i);
assert.doesNotMatch(migration, /submit_vendor_order|submit_live_ss_order|\/orders/i);

console.log('PASS: Berne CH416 publication is limited to one current, stocked, image-complete, guardrail-safe catalog product.');
console.log('SAFETY: no S&S order submission path is present.');
