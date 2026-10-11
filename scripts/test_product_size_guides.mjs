import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/202610100003_product_size_guides.sql', 'utf8');
const edge = readFileSync('supabase/functions/ss-activewear/index.ts', 'utf8');
const component = readFileSync('src/components/shop/SizeChart.jsx', 'utf8');
const productPage = readFileSync('src/pages/ProductDetail.jsx', 'utf8');

assert.match(migration, /create table if not exists public\.product_size_guides/i);
assert.match(migration, /source_provider text/i);
assert.match(migration, /source_retrieved_at timestamptz/i);
assert.match(migration, /source_hash text/i);
assert.match(migration, /raw_source jsonb/i);
assert.match(migration, /create or replace view public\.storefront_product_size_guides/i);
assert.doesNotMatch(
  migration.match(/create or replace view public\.storefront_product_size_guides[\s\S]*?revoke all/i)?.[0] || '',
  /source_provider|source_endpoint|source_reference|raw_source/i,
);
assert.match(migration, /product_size_guide_sync_queue/i);
assert.match(migration, /admin_product_size_guide_audit/i);
assert.match(migration, /product\.product_type = 'physical'/i);

assert.match(edge, /refresh_product_size_guides/);
assert.match(edge, /https:\/\/api\.ssactivewear\.com\/v2\/specs\//);
assert.match(edge, /StyleID,PartNumber,BrandName,StyleName,SizeName,SizeOrder,SpecName,Value/);
assert.match(edge, /styleBrand === brand && \(identifiers\.has\(styleName\) \|\| identifiers\.has\(partNumber\)\)/);
assert.match(edge, /supplier_style_id:/);
assert.match(edge, /source_hash: await sourceHash/);
assert.match(edge, /status: 'unavailable'/);
const sizeGuideAction = edge.slice(
  edge.indexOf("if (payload.action === 'refresh_product_size_guides')"),
  edge.indexOf("if (payload.action === 'refresh_public_style_content')"),
);
assert.doesNotMatch(sizeGuideAction, /inventoryQuantity\(/);

assert.match(productPage, /<SizeChart productId=\{product\.id\}/);
assert.match(component, /Size measurements unavailable/);
assert.match(component, /Finished-garment measurements/);
assert.match(component, /Centimeters/);
assert.match(component, /aria-current=\{selected/);
assert.match(component, /overflow-x-auto/);
assert.match(component, /HC Apparel Size Guide/);
assert.doesNotMatch(component, /S&S|S&amp;S|ssactivewear/i);
assert.doesNotMatch(component, /Gildan 64000|Bella|Hanes 5180|Tultex 299/i);

console.log('Product size-guide implementation checks passed.');
