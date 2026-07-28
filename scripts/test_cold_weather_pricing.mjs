import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const migration = [
  read('supabase/migrations/202607280001_columbia_cold_weather_pricing_buffer.sql'),
  read('supabase/migrations/202607280002_basic_tee_buffer_cap.sql'),
].join('\n');
const edgeFunction = read('supabase/functions/ss-activewear/index.ts');
const shopPage = read('src/pages/ShopGarments.jsx');
const filterLibrary = read('src/lib/shopGarmentFilters.js');

let assertions = 0;
const check = (condition, message) => {
  assert.ok(condition, message);
  assertions += 1;
};

check(
  migration.includes('storefront_margin_buffer = 3.00'),
  'the $3 storefront buffer must be configured through pricing rules',
);
check(
  migration.includes("rule_key = 'basic_tshirt'") && migration.includes('storefront.price > 9.99'),
  'basic tees must retain a customer-friendly $9.99 cap after the buffer',
);
check(
  migration.includes('storefront_price_before_buffer'),
  'the pre-buffer price must remain auditable for administrators',
);
check(
  migration.includes("'outerwear'") && migration.includes("'Premium outerwear'"),
  'outerwear must have a dedicated pricing rule',
);
check(
  migration.includes('controlled_cold_weather_batch_allowed'),
  'the one controlled private cold-weather batch must be explicitly gated',
);
check(
  migration.includes("'private_draft'") && migration.includes("'cold_weather_private_only', true"),
  'the batch and pricing rule must remain private-only',
);
check(
  migration.includes('public.run_ss_private_launch_qa'),
  'private QA must be required before any later approval',
);
check(
  migration.includes("lower(item.brand) = 'columbia'"),
  'private QA must verify Columbia coverage',
);
check(
  migration.includes("product.category = 'hoodies'"),
  'private QA must verify hoodie coverage',
);
check(
  migration.includes('not approved.marketplace_restricted'),
  'restricted S&S SKUs must be excluded',
);
check(
  migration.includes('staged.inventory_qty > 0'),
  'only in-stock private SKU variants may be staged',
);
check(
  migration.includes('storefront_image_approved'),
  'private products must carry an approved real image',
);
check(
  migration.includes('storefront_premium'),
  'premium Columbia/Oakley/Adidas products must be marked',
);
check(
  !/\bdelete\s+from\s+public\.products\b/i.test(migration),
  'the migration must not delete products',
);
check(
  !/\binventory_qty\s*=\s*/i.test(migration),
  'the migration must not change S&S SKU inventory',
);
check(
  !/submitted\s*:\s*true|live_submission_enabled['"]?\s*[:,]\s*true/i.test(
    `${migration}\n${edgeFunction}`,
  ),
  'the cold-weather workflow must not enable live S&S or ZeroTouch submission',
);
check(
  edgeFunction.includes("'stage_cold_weather_styles'"),
  'the backend must expose a dedicated private cold-weather staging action',
);
check(
  edgeFunction.includes("'Columbia'") && edgeFunction.includes("'Independent Trading Co'"),
  'the approved backend brand list must include Columbia and Independent Trading Co',
);
check(
  filterLibrary.includes("{ value: 'outerwear', label: 'Outerwear' }"),
  'the shared category configuration must expose Outerwear',
);
check(
  shopPage.includes("'outerwear'"),
  'the public shop top tabs must include Outerwear',
);
check(
  migration.includes("from public.storefront_products) <> 57"),
  'the setup migration must fail if it changes the current public product count',
);

console.log(`Cold-weather/private pricing checks passed: ${assertions} assertions.`);
