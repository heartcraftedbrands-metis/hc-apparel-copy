import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  calculateStudioPricing, createStudioDocument, effectiveDpi, historyReducer,
  isRestrictedCustomizationProduct, makeElement, normalizedFileKind,
  validateDesign, validatePlacement,
} from '../src/lib/designStudio.js';
import {
  buildMockupViews, getStudioGarmentType, isStudioEligibleProduct,
  placementAvailability, previewSurface,
} from '../src/lib/designStudioCatalog.js';

const document = createStudioDocument({
  productId: 'gildan-5000', color: 'Black', size: 'L', quantity: 2,
  placements: { front: [makeElement('image', { pixelWidth: 1800, width: 50, height: 40 })] },
});
const area = { placement: 'front', verified: true, enabled: true, width_in: 12, height_in: 14, min_dpi: 150 };
assert.equal(effectiveDpi(document.placements.front[0], area), 300, 'effective DPI uses physical artwork width');
assert.deepEqual(validatePlacement(document.placements.front, area), [], 'valid placement passes');
assert.ok(validatePlacement([{ ...document.placements.front[0], x: 80 }], area).some(item => item.code === 'outside_print_area'), 'out-of-bounds artwork blocks production');
assert.ok(validatePlacement(document.placements.front, { ...area, verified: false }).some(item => item.code === 'print_area_unverified'), 'unverified physical area blocks production');
assert.deepEqual(validateDesign(document, [area]), [], 'complete design passes configured checks');

const hc = calculateStudioPricing({ route: 'hc_transfer_press', garmentRetail: 8, printingCharge: 12, quantity: 2, supplierProductionCost: 8, packaging: 1, fees: 2 });
assert.equal(hc.customerMerchandise, 40, 'HC route shows garment and printing separately');
const printify = calculateStudioPricing({ route: 'printify', garmentRetail: 36.99, printingCharge: 12, quantity: 1, supplierProductionCost: 12.65, supplierShipping: 3.99, supplierTax: 1.33, fees: 0 });
assert.equal(printify.customerMerchandise, 36.99, 'Printify route does not double-count HC printing');
assert.equal(Number(printify.estimatedContribution.toFixed(2)), 19.02, 'known Printify costs stay separate from customer retail');
assert.equal(calculateStudioPricing({ route: 'printify', garmentRetail: 30, supplierProductionCost: 12 }).estimatedContribution, null, 'incomplete costs do not claim profit');

assert.equal(isRestrictedCustomizationProduct({ brand: 'Columbia' }), true, 'Columbia customization restriction is preserved');
assert.equal(isRestrictedCustomizationProduct({ name: 'Champion Hoodie' }), true, 'Champion customization restriction is preserved');
assert.equal(isRestrictedCustomizationProduct({ name: 'Gildan 5000' }), false, 'eligible Gildan product is allowed');
const baseProduct = { product_type: 'physical', visibility: 'public', is_active: true, stock: 12, brand: 'Gildan', name: 'Gildan 5000 Heavy Cotton T-Shirt', primary_garment_type: 't_shirts', image_url: 'https://www.ssactivewear.com/Images/Color/33476_f_fm.jpg', size_prices: [{ size: 'Black / L', sku: 'TEST-L', inventory: 12, price: 8, image_url: 'https://www.ssactivewear.com/Images/Color/33476_f_fm.jpg' }] };
assert.equal(isStudioEligibleProduct(baseProduct), true, 'live in-stock T-shirts are studio eligible');
assert.equal(getStudioGarmentType({ ...baseProduct, name: 'Gildan 18500 Hoodie', primary_garment_type: 'hoodies' }), 'hoodies', 'hoodies are included');
assert.equal(getStudioGarmentType({ ...baseProduct, name: 'Gildan 18000 Crewneck', primary_garment_type: 'crewnecks' }), 'crewnecks', 'crewnecks are included');
assert.equal(isStudioEligibleProduct({ ...baseProduct, brand: 'Champion' }), false, 'restricted brands remain excluded');
const views = buildMockupViews(baseProduct, 'Black', 'L');
assert.equal(views.front.url, baseProduct.size_prices[0].image_url, 'selected color/size uses its real catalog photograph');
assert.equal(placementAvailability(baseProduct, views).back.enabled, false, 'missing back photos are not fabricated');
assert.equal(previewSurface({ ...baseProduct, primary_garment_type: 'hoodies' }, 'front').height < previewSurface(baseProduct, 'front').height, true, 'hoodie front surface leaves room for the pouch pocket');

assert.equal(normalizedFileKind(new Uint8Array([137,80,78,71,13,10,26,10]), 'image/png'), 'png', 'PNG signature is recognized');
assert.equal(normalizedFileKind(new TextEncoder().encode('<svg width="10" height="10"></svg>'), 'image/svg+xml'), 'svg', 'SVG is recognized');
assert.equal(normalizedFileKind(new TextEncoder().encode('not an image'), 'image/png'), null, 'extension/MIME alone cannot bypass validation');

let history = { past: [], present: createStudioDocument(), future: [] };
history = historyReducer(history, { type: 'set', value: { ...history.present, name: 'Changed' } });
history = historyReducer(history, { type: 'undo' });
assert.equal(history.present.name, 'Untitled design', 'undo restores prior document');
history = historyReducer(history, { type: 'redo' });
assert.equal(history.present.name, 'Changed', 'redo restores changed document');

const migration = fs.readFileSync(new URL('../supabase/migrations/202610030006_build_design_studio_printify_backup.sql', import.meta.url), 'utf8');
const repairMigration = fs.readFileSync(new URL('../supabase/migrations/202610030007_finish_design_studio_mobile.sql', import.meta.url), 'utf8');
const edge = fs.readFileSync(new URL('../supabase/functions/design-studio/index.ts', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const flags = fs.readFileSync(new URL('../src/config/storefrontFeatures.js', import.meta.url), 'utf8');
assert.match(migration, /design_versions_immutable/, 'saved versions are database-immutable');
assert.match(repairMigration, /design_mockup_mappings/, 'real product view mappings are persisted securely');
assert.match(migration, /order_design_snapshots_immutable/, 'ordered snapshots are database-immutable');
assert.match(migration, /public_studio_enabled boolean not null default false/, 'public studio starts disabled');
assert.match(migration, /live_vendor_submission_enabled boolean not null default false/, 'vendor submission starts disabled');
assert.match(edge, /payment_verified_at.*artwork_approved_at.*confirm_submission/s, 'submission has payment, artwork, and explicit confirmation gates');
assert.match(edge, /PRINTIFY_API_TOKEN/, 'Printify credential remains server-side');
assert.doesNotMatch(edge, /Deno\.env\.get\([^)]*\).*console\.log/s, 'server secrets are not logged');
assert.match(app, /ProtectedRoute requiredRole="admin"[\s\S]*AdminDesignStudio/, 'preview route is admin protected');
assert.match(flags, /customPrinting:\s*false/, 'hidden custom-printing page remains hidden');
assert.match(flags, /designStudioPublic:\s*false/, 'public studio flag remains off');
assert.match(app, /path="\/DesignStudio"[\s\S]*STOREFRONT_FEATURES\.designStudioPublic[\s\S]*Navigate to="\/ShopGarments"/, 'customer studio route safely redirects while the public flag is off');

const page = fs.readFileSync(new URL('../src/pages/AdminDesignStudio.jsx', import.meta.url), 'utf8');
assert.match(page, /Choose Garment/, 'garment selection is visible before the canvas');
assert.match(page, /isStudioEligibleProduct/, 'catalog selection uses the shared T-shirt, hoodie, and crewneck eligibility rules');
assert.doesNotMatch(page, /Choose an eligible T-shirt/, 'selector is no longer limited to T-shirts');
assert.match(page, /admin_preview_only:\s*true/, 'cart attachment stays isolated from public checkout');

console.log('Design Studio safety, validation, pricing, and persistence tests passed.');
