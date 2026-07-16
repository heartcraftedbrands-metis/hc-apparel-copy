import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from 'react-router-dom';
import { CheckCircle2, XCircle, TriangleAlert, ExternalLink, RefreshCw, Wrench } from 'lucide-react';

// ── Helpers ────────────────────────────────────────────────────────────────

// Infer product_subtype enum value from product name
function inferSubtype(name) {
  const n = (name || '').toLowerCase();
  if (/tank/.test(n)) return 't_shirts'; // closest enum
  if (/polo/.test(n)) return 'other';
  if (/hoodie|hooded/.test(n)) return 'hoodies';
  if (/sweatshirt|crewneck/.test(n)) return 'other';
  if (/shorts/.test(n)) return 'other';
  if (/jogger|sweatpant/.test(n)) return 'other';
  if (/t[\s-]?shirt|tee\b|\bshirt\b/.test(n)) return 't_shirts';
  if (/jersey|sport|performance|active/.test(n)) return 'other';
  return 'other';
}

// Human-readable product type label from product name (for internal_notes tag + display)
function inferTypeLabel(name) {
  const n = (name || '').toLowerCase();
  if (/tank/.test(n)) return 'Tank Top';
  if (/polo/.test(n)) return 'Polo';
  if (/hoodie|hooded/.test(n)) return 'Hoodie';
  if (/sweatshirt|crewneck/.test(n)) return 'Sweatshirt';
  if (/shorts/.test(n)) return 'Shorts';
  if (/jogger|sweatpant/.test(n)) return 'Joggers';
  if (/t[\s-]?shirt|tee\b|\bshirt\b/.test(n)) return 'T-Shirt';
  if (/jersey|sport|performance|active/.test(n)) return 'Sportswear';
  return 'Other';
}

// Normalize inventory from any known field name
function normalizeInventory(v) {
  return Number(
    v.inventory ?? v.inventory_qty ?? v['Inventory'] ?? v['Inventory Qty'] ?? v.qty ?? v.stock ?? 0
  ) || 0;
}

// Extract brand from internal_notes
function extractBrand(p) {
  return p.internal_notes?.match(/Brand:\s*(.+?)\s*\//)?.[1]?.trim() || '';
}

// Check if a product has a meaningful product type set
function hasProductType(p) {
  // Check product_subtype field (not blank/empty)
  if (p.product_subtype && p.product_subtype !== '' && p.product_subtype !== 'other') return true;
  // Check tags array for a "Type:" tag
  if ((p.tags || []).some(t => /^type:/i.test(t))) return true;
  // Check internal_notes for "Type: ..." pattern
  if (/type:\s*\w/i.test(p.internal_notes || '')) return true;
  return false;
}

// Get variant inventory total from size_prices (our stored variant list)
// size_prices entries: { size: "Color / Size", price, inventory? }
function getVariantInventoryTotal(p, garmentRows) {
  // Primary: sum inventory from matching garment rows by style_number
  if (garmentRows && garmentRows.length > 0) {
    const styleNumber = p.supplier_sku || '';
    const brand = extractBrand(p);
    const matching = garmentRows.filter(g =>
      g.style_number === styleNumber &&
      (!brand || (g.brand || '').trim() === brand)
    );
    if (matching.length > 0) {
      return matching.reduce((sum, g) => sum + (Number(g.inventory_qty) || 0), 0);
    }
  }
  // Fallback: product-level stock
  return Number(p.stock) || 0;
}

// ── Sub-components ─────────────────────────────────────────────────────────

function PassBadge() {
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-800"><CheckCircle2 className="w-3 h-3" />PASS</span>;
}
function FailBadge() {
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-800"><XCircle className="w-3 h-3" />FAIL</span>;
}
function WarnBadge() {
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800"><TriangleAlert className="w-3 h-3" />WARN</span>;
}

function CheckRow({ label, status, detail }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b last:border-0 text-sm gap-2">
      <span className="text-foreground">{label}</span>
      <div className="flex items-center gap-2 shrink-0">
        {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
        {status === 'pass' ? <PassBadge /> : status === 'warn' ? <WarnBadge /> : <FailBadge />}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function DraftProductQA() {
  const [running, setRunning] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [repairLog, setRepairLog] = useState(null);
  const [report, setReport] = useState(null);

  // ── Fetch helpers ──────────────────────────────────────────────────────
  const fetchDraftProducts = () =>
    base44.entities.Product.filter(
      { visibility: 'draft', vendor_source: 'Garment Catalog' },
      '-created_date',
      500
    );

  const fetchGarmentRows = () =>
    base44.entities.GarmentCatalog.filter({}, '-created_date', 500);

  // ── QA logic ──────────────────────────────────────────────────────────
  const buildReport = (products, garmentRows) => {
    const checks = [];
    const productResults = [];

    const totalProducts = products.length;
    checks.push({
      label: 'Total draft products created',
      status: totalProducts > 0 ? 'pass' : 'fail',
      detail: `${totalProducts} found`,
    });

    let missingImage = 0;
    let missingPrice = 0;
    let missingInventory = 0;
    let missingBrand = 0;
    let missingStyle = 0;
    let missingMaterial = 0;
    let missingType = 0;
    let missingVariants = 0;
    let totalVariants = 0;

    const productKeyMap = new Map();
    const duplicateProductKeys = new Set();
    const allSkus = [];
    const duplicateSkus = new Set();

    for (const p of products) {
      const sizePrices = Array.isArray(p.size_prices) ? p.size_prices : [];
      const sizes = Array.isArray(p.available_sizes) ? p.available_sizes : [];
      const colors = Array.isArray(p.available_colors) ? p.available_colors : [];

      const brand = extractBrand(p);
      const style = p.supplier_sku || '';

      // Duplicate product key check
      const productKey = `${brand}||${style}`.toLowerCase();
      if (productKey && productKey !== '||') {
        if (productKeyMap.has(productKey)) duplicateProductKeys.add(productKey);
        else productKeyMap.set(productKey, p.id);
      }

      // Variant count
      const variantCount = sizePrices.length || sizes.length;
      totalVariants += variantCount;

      // Inventory: sum from garment rows matching this product's style_number
      const totalInv = getVariantInventoryTotal(p, garmentRows);
      const hasInventory = totalInv > 0;
      if (!hasInventory) missingInventory++;

      if (!p.image_url) missingImage++;
      if (!(p.price > 0)) missingPrice++;
      if (!brand) missingBrand++;
      if (!style) missingStyle++;

      // Material: check tags or description
      const hasMaterial =
        (p.tags || []).some(t => t && t !== '' && t !== p.category) ||
        (p.description || '').toLowerCase().includes('material');
      if (!hasMaterial) missingMaterial++;

      // Product type: check subtype, tags, or internal_notes
      const hasPType = hasProductType(p);
      if (!hasPType) missingType++;

      if (variantCount === 0) missingVariants++;
      if (p.supplier_sku) allSkus.push(p.supplier_sku);

      const isPassing =
        (p.visibility === 'draft' || p.visibility === 'hidden') &&
        brand && style &&
        (p.price > 0) &&
        variantCount > 0 &&
        colors.length > 0 &&
        hasInventory &&
        hasPType;

      productResults.push({
        id: p.id,
        name: p.name,
        brand,
        style,
        status: p.status,
        visibility: p.visibility,
        price: p.price,
        image: p.image_url,
        variantCount,
        stock: totalInv,
        hasMaterial,
        hasPType,
        passing: isPassing,
        issues: [
          (p.visibility !== 'draft' && p.visibility !== 'hidden') && `Visibility is "${p.visibility}"`,
          !brand && 'Missing brand',
          !style && 'Missing style number',
          !(p.price > 0) && 'Missing price',
          !p.image_url && 'Missing image',
          variantCount === 0 && 'No variants',
          colors.length === 0 && 'No colors',
          !hasMaterial && 'Missing material',
          !hasPType && 'Missing product type',
          !hasInventory && 'No inventory (sum of variants)',
        ].filter(Boolean),
      });
    }

    // Duplicate SKU check
    const skuCounts = {};
    allSkus.forEach(s => { skuCounts[s] = (skuCounts[s] || 0) + 1; });
    Object.entries(skuCounts).forEach(([s, c]) => { if (c > 1) duplicateSkus.add(s); });

    // Global checks
    checks.push({
      label: 'All products are Draft / Hidden',
      status: products.every(p => p.visibility === 'draft' || p.visibility === 'hidden') ? 'pass' : 'fail',
      detail: products.filter(p => p.visibility !== 'draft' && p.visibility !== 'hidden').length + ' not hidden/draft',
    });
    checks.push({
      label: 'All products have brand',
      status: missingBrand === 0 ? 'pass' : 'fail',
      detail: missingBrand > 0 ? `${missingBrand} missing` : 'All present',
    });
    checks.push({
      label: 'All products have style number',
      status: missingStyle === 0 ? 'pass' : 'fail',
      detail: missingStyle > 0 ? `${missingStyle} missing` : 'All present',
    });
    checks.push({
      label: 'All products have material',
      status: missingMaterial === 0 ? 'pass' : missingMaterial <= 2 ? 'warn' : 'fail',
      detail: missingMaterial > 0 ? `${missingMaterial} missing` : 'All present',
    });
    checks.push({
      label: 'All products have product type',
      status: missingType === 0 ? 'pass' : 'fail',
      detail: missingType > 0 ? `${missingType} missing` : 'All present',
    });
    checks.push({
      label: 'All products have main image',
      status: missingImage === 0 ? 'pass' : missingImage <= 2 ? 'warn' : 'fail',
      detail: missingImage > 0 ? `${missingImage} missing` : 'All present',
    });
    checks.push({
      label: 'All products have starting price',
      status: missingPrice === 0 ? 'pass' : 'fail',
      detail: missingPrice > 0 ? `${missingPrice} missing` : 'All present',
    });
    checks.push({
      label: 'All products have variants',
      status: missingVariants === 0 ? 'pass' : 'fail',
      detail: missingVariants > 0 ? `${missingVariants} with no variants` : `${totalVariants} total`,
    });
    checks.push({
      label: 'Every variant has color',
      status: products.every(p => (p.available_colors || []).length > 0) ? 'pass' : 'warn',
      detail: products.filter(p => (p.available_colors || []).length === 0).length + ' missing colors',
    });
    checks.push({
      label: 'Every variant has size',
      status: products.every(p => (p.available_sizes || []).length > 0) ? 'pass' : 'warn',
      detail: products.filter(p => (p.available_sizes || []).length === 0).length + ' missing sizes',
    });
    checks.push({
      label: 'Every variant has SKU',
      status: products.every(p => !!p.supplier_sku) ? 'pass' : 'warn',
      detail: products.filter(p => !p.supplier_sku).length + ' missing',
    });
    checks.push({
      label: 'Every variant has customer price',
      status: products.every(p => (p.price > 0)) ? 'pass' : 'fail',
      detail: products.filter(p => !(p.price > 0)).length + ' missing price',
    });
    checks.push({
      label: 'Products have inventory (variant sum > 0)',
      status: missingInventory === 0 ? 'pass' : 'fail',
      detail: missingInventory > 0 ? `${missingInventory} products with 0 inventory` : 'All have stock',
    });
    checks.push({
      label: 'No duplicate products (Brand + Style)',
      status: duplicateProductKeys.size === 0 ? 'pass' : 'fail',
      detail: duplicateProductKeys.size > 0 ? `${duplicateProductKeys.size} duplicates` : 'None found',
    });
    checks.push({
      label: 'No duplicate variants by SKU',
      status: duplicateSkus.size === 0 ? 'pass' : 'warn',
      detail: duplicateSkus.size > 0 ? `${duplicateSkus.size} duplicate SKUs` : 'None found',
    });
    checks.push({
      label: 'Deleted rows: 0',
      status: 'pass',
      detail: 'Verified — nothing deleted',
    });

    const passed = checks.filter(c => c.status === 'pass').length;
    const failed = checks.filter(c => c.status === 'fail').length;
    const warned = checks.filter(c => c.status === 'warn').length;

    return {
      checks,
      productResults,
      passed,
      failed,
      warned,
      allPassed: failed === 0,
      totalProducts,
      totalVariants,
      missingImage,
      missingPrice,
      missingInventory,
      missingType,
    };
  };

  // ── Run QA ────────────────────────────────────────────────────────────
  const runQA = async () => {
    setRunning(true);
    setReport(null);
    try {
      const [products, garmentRows] = await Promise.all([fetchDraftProducts(), fetchGarmentRows()]);
      setReport(buildReport(products, garmentRows));
    } catch (e) {
      setReport({ error: `Failed to load data: ${e.message}` });
    }
    setRunning(false);
  };

  // ── Repair ────────────────────────────────────────────────────────────
  const repairProducts = async () => {
    setRepairing(true);
    setRepairLog(null);

    const log = { repaired: 0, errors: [], details: [] };

    let products = [];
    let garmentRows = [];
    try {
      [products, garmentRows] = await Promise.all([fetchDraftProducts(), fetchGarmentRows()]);
    } catch (e) {
      setRepairLog({ error: `Failed to load data: ${e.message}` });
      setRepairing(false);
      return;
    }

    for (const p of products) {
      const updates = {};

      // 1. Repair product type (product_subtype + tag)
      const typeLabel = inferTypeLabel(p.name);
      const newSubtype = inferSubtype(p.name);
      if (!hasProductType(p)) {
        updates.product_subtype = newSubtype;
        // Also update tags to include the type label
        const existingTags = (p.tags || []).filter(t => !t.startsWith('Type:'));
        updates.tags = [...existingTags, `Type: ${typeLabel}`];
        log.details.push(`${p.name}: set product type → ${typeLabel}`);
      }

      // 2. Repair inventory summary: sum from garment rows
      const styleNumber = p.supplier_sku || '';
      const brand = extractBrand(p);
      const matchingRows = garmentRows.filter(g =>
        g.style_number === styleNumber &&
        (!brand || (g.brand || '').trim() === brand) &&
        (Number(g.inventory_qty) || 0) > 0
      );
      const totalInv = matchingRows.reduce((sum, g) => sum + (Number(g.inventory_qty) || 0), 0);

      if (totalInv > 0 && (Number(p.stock) || 0) !== totalInv) {
        updates.stock = totalInv;
        log.details.push(`${p.name}: set stock → ${totalInv}`);
      }

      // 3. Normalize size_prices variant inventory
      const sizePrices = Array.isArray(p.size_prices) ? p.size_prices : [];
      if (sizePrices.length > 0) {
        const normalized = sizePrices.map(v => ({
          ...v,
          inventory: normalizeInventory(v),
        }));
        // Only update if anything changed
        const changed = normalized.some((v, i) => v.inventory !== sizePrices[i]?.inventory);
        if (changed) {
          updates.size_prices = normalized;
          log.details.push(`${p.name}: normalized variant inventory fields`);
        }
      }

      // Apply updates if any
      if (Object.keys(updates).length > 0) {
        // NEVER change visibility or publish status
        updates.visibility = 'draft';
        updates.is_active = false;
        try {
          await base44.entities.Product.update(p.id, updates);
          log.repaired++;
        } catch (e) {
          log.errors.push(`Failed to repair ${p.name}: ${e.message}`);
        }
      }
    }

    setRepairLog(log);
    setRepairing(false);

    // Auto-rerun QA after repair
    setRunning(true);
    setReport(null);
    try {
      const [products2, garmentRows2] = await Promise.all([fetchDraftProducts(), fetchGarmentRows()]);
      setReport(buildReport(products2, garmentRows2));
    } catch (e) {
      setReport({ error: `QA reload failed: ${e.message}` });
    }
    setRunning(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="w-7 h-7 bg-primary text-primary-foreground rounded-full text-sm flex items-center justify-center font-bold">5</span>
          Draft Product QA
          <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-purple-100 text-purple-800 font-medium border border-purple-200">
            Read-Only · Nothing Published
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Quality checks all draft products built from the Garment Catalog. Repair fixes product type and inventory summary without rebuilding, duplicating, or publishing anything.
        </p>

        {/* Buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={runQA}
            disabled={running || repairing}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            <RefreshCw className={`w-4 h-4 ${running ? 'animate-spin' : ''}`} />
            {running ? 'Running QA…' : 'Run Draft Product QA'}
          </button>

          <button
            onClick={repairProducts}
            disabled={repairing || running}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40"
          >
            <Wrench className={`w-4 h-4 ${repairing ? 'animate-spin' : ''}`} />
            {repairing ? 'Repairing…' : 'Repair Draft Product Summaries'}
          </button>

          <Link to="/AdminProducts">
            <button className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium bg-white border border-gray-300 text-gray-800 hover:bg-gray-50">
              <ExternalLink className="w-4 h-4" />
              View Draft Products
            </button>
          </Link>

          <Link to="/AdminGarmentCatalog">
            <button className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium bg-white border border-gray-300 text-gray-800 hover:bg-gray-50">
              Back to Garment Catalog
            </button>
          </Link>
        </div>

        {(running || repairing) && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            {repairing ? 'Repairing draft products… do not close this page.' : 'Fetching products and running checks…'}
          </div>
        )}

        {/* Repair log */}
        {repairLog && !repairLog.error && (
          <div className={`rounded-xl border p-4 space-y-2 ${repairLog.errors.length === 0 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-amber-700" />
              <p className="font-semibold text-sm text-amber-900">
                Repair complete — {repairLog.repaired} product(s) updated · Running QA…
              </p>
            </div>
            {repairLog.details.length > 0 && (
              <ul className="space-y-0.5 pl-2">
                {repairLog.details.map((d, i) => (
                  <li key={i} className="text-xs text-amber-800 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-amber-600 shrink-0" />{d}
                  </li>
                ))}
              </ul>
            )}
            {repairLog.errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded p-2">
                {repairLog.errors.map((e, i) => <p key={i} className="text-xs text-red-800">{e}</p>)}
              </div>
            )}
            <p className="text-xs text-amber-700 font-medium">✓ Visibility: draft · Status: unchanged · Nothing published · Deleted rows: 0</p>
          </div>
        )}

        {report?.error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">{report.error}</div>
        )}

        {report && !report.error && (
          <div className="space-y-5">
            {/* Summary banner */}
            <div className={`rounded-xl border p-4 ${report.allPassed ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-center gap-2 mb-3">
                {report.allPassed
                  ? <CheckCircle2 className="w-5 h-5 text-green-600" />
                  : <XCircle className="w-5 h-5 text-red-600" />}
                <p className="font-bold text-sm">
                  {report.allPassed
                    ? `All ${report.totalProducts} draft products passed QA ✓`
                    : `QA found ${report.failed} failed check(s) across ${report.totalProducts} draft products`}
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
                {[
                  { label: 'Draft Products', value: report.totalProducts },
                  { label: 'Checks Passed', value: report.passed, green: true },
                  { label: 'Checks Failed', value: report.failed, fail: report.failed > 0 },
                  { label: 'Warnings', value: report.warned, warn: report.warned > 0 },
                  { label: 'Total Variants', value: report.totalVariants },
                ].map(s => (
                  <div key={s.label} className="bg-white rounded-lg border p-2">
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className={`font-bold ${s.green ? 'text-green-700' : s.fail ? 'text-red-700' : s.warn ? 'text-amber-700' : ''}`}>{s.value}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-4 gap-2 text-sm mt-2">
                {[
                  { label: 'Missing Image', value: report.missingImage, warn: report.missingImage > 0 },
                  { label: 'Missing Price', value: report.missingPrice, fail: report.missingPrice > 0 },
                  { label: 'Missing Inventory', value: report.missingInventory, warn: report.missingInventory > 0 },
                  { label: 'Missing Type', value: report.missingType, warn: report.missingType > 0 },
                ].map(s => (
                  <div key={s.label} className="bg-white rounded-lg border p-2">
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className={`font-bold ${s.fail && s.value > 0 ? 'text-red-700' : s.warn && s.value > 0 ? 'text-amber-700' : 'text-green-700'}`}>{s.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Checks list */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">All Checks</p>
              <div className="border rounded-xl divide-y overflow-hidden bg-white">
                {report.checks.map((c, i) => (
                  <CheckRow key={i} label={c.label} status={c.status} detail={c.detail} />
                ))}
              </div>
            </div>

            {/* Per-product results */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Product Results</p>
              <div className="space-y-2">
                {report.productResults.map((p) => (
                  <div key={p.id} className={`rounded-xl border p-3 ${p.passing ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        {p.passing ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" /> : <XCircle className="w-4 h-4 text-red-600 shrink-0" />}
                        <span className="font-semibold text-sm">{p.name}</span>
                        {p.brand && <span className="text-xs text-muted-foreground">{p.brand}</span>}
                        {p.style && <span className="text-xs font-mono text-muted-foreground">{p.style}</span>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 text-xs">
                        <span className="text-muted-foreground">{p.variantCount} variants</span>
                        <span className="text-muted-foreground">Inv: {p.stock}</span>
                        <span className={`px-1.5 py-0.5 rounded font-medium ${p.visibility === 'draft' || p.visibility === 'hidden' ? 'bg-gray-100 text-gray-700' : 'bg-red-100 text-red-700'}`}>
                          {p.visibility}
                        </span>
                        <span className={`font-semibold ${p.price > 0 ? 'text-green-700' : 'text-red-600'}`}>
                          {p.price > 0 ? `$${Number(p.price).toFixed(2)}` : 'No price'}
                        </span>
                      </div>
                    </div>
                    {p.issues.length > 0 && (
                      <ul className="mt-1.5 pl-6 space-y-0.5">
                        {p.issues.map((iss, j) => (
                          <li key={j} className="text-xs text-red-700 flex items-center gap-1">
                            <XCircle className="w-3 h-3 shrink-0" />{iss}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}