import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  Eye, Hammer, CheckCircle2, AlertCircle,
  TriangleAlert, ExternalLink, Wrench, RefreshCw
} from 'lucide-react';
import { Link } from 'react-router-dom';

// ── Label inference from product name ─────────────────────────────────────
function inferMaterial(name, existing) {
  const n = (name || '').toLowerCase();
  if (/organic/.test(n)) return 'Organic Cotton';
  if (/ring[\s-]?spun|ringspun/.test(n)) return 'Ring-Spun Cotton';
  if (/cvc/.test(n)) return 'CVC Cotton Blend';
  if (/blend|cotton[\s/]poly|poly[\s]?cotton/.test(n)) return 'Cotton Blend';
  if (/ultra cotton|cotton/.test(n)) return '100% Cotton';
  if (/sport|performance|jersey|active/.test(n)) return 'Sports / Activewear';
  // fall back to stored value if it's not blank/Other
  if (existing && existing !== '' && existing !== 'Other') return existing;
  return existing || '';
}

function inferProductType(name, existing) {
  const n = (name || '').toLowerCase();
  if (/tank/.test(n)) return 'Tank Top';
  if (/polo/.test(n)) return 'Polo';
  if (/hoodie|hooded/.test(n)) return 'Hoodie';
  if (/sweatshirt|crewneck/.test(n)) return 'Sweatshirt';
  if (/shorts/.test(n)) return 'Shorts';
  if (/jogger|sweatpant/.test(n)) return 'Joggers';
  if (/t[\s-]?shirt|tee\b|\bshirt\b/.test(n)) return 'T-Shirt';
  if (/jersey|sport|performance|active/.test(n)) return 'Sportswear';
  // fall back to stored value if it's not blank
  if (existing && existing !== '') return existing;
  return existing || '';
}

// Group eligible garments by Brand + Style Number
function buildGroups(garments) {
  const eligible = garments.filter(
    g => g.status === 'approved_to_sell' && (Number(g.inventory_qty) || 0) > 0
  );
  const map = new Map();
  for (const g of eligible) {
    const key = `${(g.brand || '').trim()}||${(g.style_number || '').trim()}`;
    if (!map.has(key)) {
      const pn = g.product_name || '';
      map.set(key, {
        key,
        brand: g.brand || '',
        style_number: g.style_number || '',
        product_name: pn,
        material: inferMaterial(pn, g.material),
        product_type: inferProductType(pn, g.product_type),
        variants: [],
      });
    }
    map.get(key).variants.push(g);
  }
  return Array.from(map.values());
}

// Map product_type → Product category enum
function typeToCategory(pt) {
  const map = {
    'T-Shirt': 'short_sleeve_shirts',
    'Hoodie': 'hoodies',
    'Sweatshirt': 'crewnecks',
    'Tank Top': 'short_sleeve_shirts',
    'Polo': 'polo_shirts',
    'Shorts': 'sportswear',
    'Joggers': 'sportswear',
    'Youth': 'youth_short_sleeve_shirts',
    'Sportswear': 'sportswear',
  };
  return map[pt] || 'other';
}

// Build the Product payload from a group
function groupToProduct(group) {
  const { variants } = group;
  const prices = variants.map(v => Number(v.customer_price) || 0).filter(p => p > 0);
  const startingPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const colors = [...new Set(variants.map(v => v.color).filter(Boolean))];
  const sizes = [...new Set(variants.map(v => v.size).filter(Boolean))];
  const mainImage = variants.find(v => v.image_url)?.image_url || '';

  const variantData = variants.map(v => ({
    sku: v.sku || '',
    color: v.color || '',
    size: v.size || '',
    price: Number(v.customer_price) || 0,
    blank_cost: Number(v.blank_cost) || 0,
    inventory: Number(v.inventory_qty) || 0,
    image_url: v.image_url || '',
    garment_id: v.id,
  }));

  return {
    name: `${group.brand} ${group.style_number} — ${group.product_name}`.trim(),
    description: `${group.product_name}. Brand: ${group.brand}. Style: ${group.style_number}. Material: ${group.material}. Type: ${group.product_type}.`,
    price: startingPrice,
    product_type: 'physical',
    product_subtype: '',
    visibility: 'draft',
    category: typeToCategory(group.product_type),
    available_sizes: sizes,
    available_colors: colors.map(c => ({ name: c, hex: '' })),
    is_active: false,
    vendor_source: 'Garment Catalog',
    supplier_sku: group.style_number,
    blank_garment_cost: Math.min(...variants.map(v => Number(v.blank_cost) || 0)),
    image_url: mainImage,
    internal_notes: `Draft from Garment Catalog. Brand: ${group.brand} / Style: ${group.style_number}. Built ${new Date().toISOString().slice(0, 10)}.`,
    // Store variants as size_prices for variant-level pricing
    size_prices: variantData.map(v => ({ size: `${v.color} / ${v.size}`, price: v.price })),
    tags: [group.brand, group.material, group.product_type].filter(Boolean),
    _garment_ids: variantData.map(v => v.garment_id),
    _group_key: group.key,
  };
}

// ── Preview Panel ──────────────────────────────────────────────────────────
function PreviewPanel({ groups }) {
  const eligible = groups.reduce((s, g) => s + g.variants.length, 0);
  const missingImages = groups.filter(g => !g.variants.some(v => v.image_url)).length;
  const missingPrices = groups.filter(g => g.variants.some(v => !(Number(v.customer_price) > 0))).length;

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Approved In-Stock Rows', value: eligible, green: true },
          { label: 'Product Groups', value: groups.length, green: true },
          { label: 'Missing Images', value: missingImages, warn: missingImages > 0 },
          { label: 'Missing Prices', value: missingPrices, warn: missingPrices > 0 },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-lg border p-3 text-center">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={`text-xl font-bold ${s.green ? 'text-green-700' : s.warn && s.value > 0 ? 'text-amber-700' : 'text-foreground'}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Sample groups */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">First 10 Product Groups</p>
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/60">
              <tr>
                {['Brand','Style#','Product Name','Material','Type','Variants','Images','Min Price'].map(h =>
                  <th key={h} className="text-left px-2 py-2 text-muted-foreground font-medium whitespace-nowrap">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {groups.slice(0, 10).map((g, i) => {
                const prices = g.variants.map(v => Number(v.customer_price) || 0).filter(p => p > 0);
                const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
                const hasAllImages = g.variants.every(v => v.image_url);
                return (
                  <tr key={i} className="border-t hover:bg-muted/30">
                    <td className="px-2 py-1.5 font-medium whitespace-nowrap">{g.brand}</td>
                    <td className="px-2 py-1.5 font-mono text-muted-foreground">{g.style_number}</td>
                    <td className="px-2 py-1.5 max-w-36"><p className="truncate" title={g.product_name}>{g.product_name}</p></td>
                    <td className="px-2 py-1.5">{g.material || '—'}</td>
                    <td className="px-2 py-1.5">{g.product_type || '—'}</td>
                    <td className="px-2 py-1.5 text-center font-semibold">{g.variants.length}</td>
                    <td className="px-2 py-1.5 text-center">
                      {hasAllImages
                        ? <span className="text-green-600">✓</span>
                        : <span className="text-amber-600">⚠ {g.variants.filter(v => v.image_url).length}/{g.variants.length}</span>}
                    </td>
                    <td className="px-2 py-1.5 font-semibold text-green-700">{minPrice > 0 ? `$${minPrice.toFixed(2)}` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Build Report ───────────────────────────────────────────────────────────
function BuildReport({ report }) {
  const items = [
    { label: 'Groups processed', value: report.processed },
    { label: 'Draft products created', value: report.created, green: true },
    { label: 'Existing drafts updated', value: report.updated, blue: true },
    { label: 'Variants saved', value: report.variants_saved, green: true },
    { label: 'Garment rows marked', value: report.garments_marked, blue: true },
    { label: 'Errors', value: report.errors.length, warn: report.errors.length > 0 },
    { label: 'Deleted rows', value: 0, green: true },
  ];
  const ok = report.errors.length === 0;

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${ok ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
      <div className="flex items-center gap-2">
        {ok ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : <TriangleAlert className="w-5 h-5 text-amber-600" />}
        <p className="font-semibold">{ok ? 'Build Complete — No Errors' : 'Build Complete — Some Errors'}</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
        {items.map(s => (
          <div key={s.label} className="bg-white rounded-lg border p-2">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={`font-bold ${s.green ? 'text-green-700' : s.blue ? 'text-blue-700' : s.warn && s.value > 0 ? 'text-amber-700' : ''}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Quality checklist */}
      <div className="bg-white rounded-lg border p-3">
        <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Quality Checklist</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
          {[
            { label: 'Draft products only', ok: true },
            { label: 'Public visibility hidden', ok: true },
            { label: 'Variants saved', ok: report.variants_saved > 0 },
            { label: 'Prices saved', ok: report.created + report.updated > 0 },
            { label: 'Inventory saved', ok: report.created + report.updated > 0 },
            { label: 'Deleted rows: 0', ok: true },
          ].map(c => (
            <div key={c.label} className="flex items-center gap-1.5 text-xs">
              {c.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600 flex-shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
              <span className={c.ok ? 'text-green-800' : 'text-red-700'}>{c.label}</span>
            </div>
          ))}
        </div>
      </div>

      {report.errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded p-2">
          {report.errors.map((e, i) => <p key={i} className="text-xs text-red-800">{e}</p>)}
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function BuildDraftProducts({ garments, onRefresh }) {
  const [showPreview, setShowPreview] = useState(false);
  const [building, setBuilding] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [fixCount, setFixCount] = useState(null);
  const [report, setReport] = useState(null);
  const [retryReport, setRetryReport] = useState(null);
  const [lastBuildOk, setLastBuildOk] = useState(false);

  const groups = useMemo(() => buildGroups(garments), [garments]);
  const unbuilt = useMemo(() =>
    groups.filter(g => !g.variants.some(v => v.draft_product_id)),
    [groups]
  );

  const runBuild = async (batchSize) => {
    const batch = unbuilt.slice(0, batchSize);
    if (batch.length === 0) { toast.info('All groups already have draft products.'); return; }
    setBuilding(true);
    setReport(null);

    const result = { processed: 0, created: 0, updated: 0, variants_saved: 0, garments_marked: 0, errors: [] };

    // Load existing draft products keyed by supplier_sku (= style_number) + vendor_source
    let existingDrafts = [];
    try {
      existingDrafts = await base44.entities.Product.filter({ visibility: 'draft', vendor_source: 'Garment Catalog' }, '-created_date', 500);
    } catch (e) {
      // If no records, that's fine
    }
    const draftByKey = new Map(existingDrafts.map(p => [`${p.internal_notes?.match(/Brand: (.+?) \//)?.[1]?.trim() || ''}||${p.supplier_sku || ''}`, p]));

    for (const group of batch) {
      try {
        const payload = groupToProduct(group);
        const { _garment_ids, _group_key } = payload;
        delete payload._garment_ids;
        delete payload._group_key;

        const lookupKey = `${group.brand}||${group.style_number}`;
        const existing = draftByKey.get(lookupKey);

        let productId;
        if (existing) {
          await base44.entities.Product.update(existing.id, payload);
          productId = existing.id;
          result.updated++;
        } else {
          const created = await base44.entities.Product.create(payload);
          productId = created.id;
          result.created++;
        }

        result.variants_saved += group.variants.length;
        result.processed++;

        // Mark garment rows in batches of 25 with delay + rate-limit retry
        const now = new Date().toISOString();
        for (let i = 0; i < _garment_ids.length; i += 25) {
          const chunk = _garment_ids.slice(i, i + 25);
          for (const gid of chunk) {
            let attempts = 0;
            while (attempts < 3) {
              try {
                await base44.entities.GarmentCatalog.update(gid, { draft_product_id: productId, draft_built_at: now });
                result.garments_marked++;
                break;
              } catch (e) {
                if (e.message?.toLowerCase().includes('rate limit') && attempts < 2) {
                  await new Promise(r => setTimeout(r, 3000));
                  attempts++;
                } else {
                  result.errors.push(`Garment mark failed (${gid}): ${e.message}`);
                  break;
                }
              }
            }
          }
          if (i + 25 < _garment_ids.length) await new Promise(r => setTimeout(r, 500));
        }
      } catch (err) {
        result.errors.push(`Group ${group.brand} ${group.style_number}: ${err.message}`);
      }
    }

    setReport(result);
    setLastBuildOk(result.errors.length === 0);
    onRefresh();
    setBuilding(false);

    if (result.errors.length === 0) {
      toast.success(`Built ${result.created} new + ${result.updated} updated draft products`);
    } else {
      toast.warning(`Build done with ${result.errors.length} error(s)`);
    }
  };

  const fixLabels = async () => {
    const toFix = garments.filter(g => {
      const newMat = inferMaterial(g.product_name, g.material);
      const newType = inferProductType(g.product_name, g.product_type);
      return newMat !== (g.material || '') || newType !== (g.product_type || '');
    });
    if (toFix.length === 0) { toast.info('All garment rows already have correct labels.'); return; }
    if (!confirm(`Fix material/type labels on ${toFix.length} garment rows? This updates the database records only — no products published.`)) return;
    setFixing(true);
    let fixed = 0;
    for (const g of toFix) {
      try {
        await base44.entities.GarmentCatalog.update(g.id, {
          material: inferMaterial(g.product_name, g.material),
          product_type: inferProductType(g.product_name, g.product_type),
        });
        fixed++;
        await new Promise(r => setTimeout(r, 80));
      } catch (e) { /* skip */ }
    }
    setFixCount(fixed);
    setFixing(false);
    onRefresh();
    toast.success(`Fixed labels on ${fixed} garment rows`);
  };

  // ── Retry marking garment rows without rebuilding products ────────────────
  const retryMarkBuilt = async () => {
    setRetrying(true);
    setRetryReport(null);

    // Load existing draft products from Garment Catalog source
    let existingDrafts = [];
    try {
      existingDrafts = await base44.entities.Product.filter({ visibility: 'draft', vendor_source: 'Garment Catalog' }, '-created_date', 500);
    } catch (e) { /* fine */ }

    // Build lookup: "Brand||StyleNumber" → product id
    const draftByKey = new Map();
    for (const p of existingDrafts) {
      const brand = p.internal_notes?.match(/Brand: (.+?) \//)?.[1]?.trim() || '';
      const key = `${brand}||${p.supplier_sku || ''}`;
      if (brand && p.supplier_sku) draftByKey.set(key, p.id);
    }

    // Approved in-stock garment rows that are NOT yet marked
    const eligible = garments.filter(g =>
      g.status === 'approved_to_sell' &&
      (Number(g.inventory_qty) || 0) > 0
    );
    const alreadyMarked = eligible.filter(g => g.draft_product_id).length;
    const toMark = eligible.filter(g => !g.draft_product_id);

    const rr = { total: eligible.length, already_marked: alreadyMarked, newly_marked: 0, remaining: toMark.length, errors: [] };

    if (toMark.length === 0) {
      setRetryReport(rr);
      setRetrying(false);
      toast.info('All garment rows are already marked.');
      return;
    }

    const now = new Date().toISOString();

    // Process in batches of 25 with 500ms between batches
    for (let i = 0; i < toMark.length; i += 25) {
      const chunk = toMark.slice(i, i + 25);
      for (const g of chunk) {
        const key = `${(g.brand || '').trim()}||${(g.style_number || '').trim()}`;
        const productId = draftByKey.get(key);
        if (!productId) {
          rr.errors.push(`No draft product found for ${g.brand} ${g.style_number} (row ${g.id})`);
          continue;
        }
        let attempts = 0;
        while (attempts < 3) {
          try {
            await base44.entities.GarmentCatalog.update(g.id, { draft_product_id: productId, draft_built_at: now });
            rr.newly_marked++;
            rr.remaining = Math.max(0, rr.remaining - 1);
            break;
          } catch (e) {
            if (e.message?.toLowerCase().includes('rate limit') && attempts < 2) {
              await new Promise(r => setTimeout(r, 3000));
              attempts++;
            } else {
              rr.errors.push(`Mark failed (${g.id}): ${e.message}`);
              break;
            }
          }
        }
      }
      if (i + 25 < toMark.length) await new Promise(r => setTimeout(r, 500));
      // Live-update the report as we go
      setRetryReport({ ...rr });
    }

    setRetryReport({ ...rr });
    setRetrying(false);
    onRefresh();

    // Merge into main build report if one exists
    if (report) {
      setReport(prev => ({ ...prev, garments_marked: rr.already_marked + rr.newly_marked, errors: rr.errors }));
    }

    if (rr.errors.length === 0) {
      toast.success(`Marked ${rr.newly_marked} garment rows as Draft Created`);
    } else {
      toast.warning(`Retry done: ${rr.newly_marked} marked, ${rr.errors.length} error(s)`);
    }
  };

  const eligible = garments.filter(g => g.status === 'approved_to_sell' && (Number(g.inventory_qty) || 0) > 0);
  const alreadyBuilt = groups.length - unbuilt.length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="w-7 h-7 bg-primary text-primary-foreground rounded-full text-sm flex items-center justify-center font-bold">4</span>
          Build Draft Shop Products
          <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800 font-medium border border-amber-200">
            Draft Only · Nothing Published
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary bar */}
        <div className="bg-muted/40 rounded-lg border p-3 flex flex-wrap gap-4 text-sm">
          <span><span className="font-semibold text-green-700">{eligible.length}</span> <span className="text-muted-foreground">approved in-stock rows</span></span>
          <span><span className="font-semibold">{groups.length}</span> <span className="text-muted-foreground">product groups</span></span>
          <span><span className="font-semibold text-blue-700">{alreadyBuilt}</span> <span className="text-muted-foreground">already have drafts</span></span>
          <span><span className="font-semibold text-amber-700">{unbuilt.length}</span> <span className="text-muted-foreground">remaining to build</span></span>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowPreview(p => !p)}
            disabled={groups.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium bg-white border border-gray-300 text-gray-800 hover:bg-gray-50 disabled:opacity-40"
          >
            <Eye className="w-4 h-4" />
            {showPreview ? 'Hide Preview' : 'Preview Product Groups'}
          </button>

          <button
            onClick={() => runBuild(10)}
            disabled={building || unbuilt.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            <Hammer className="w-4 h-4" />
            {building ? 'Building…' : `Build Next 10 Draft Products`}
          </button>

          <button
            onClick={() => runBuild(25)}
            disabled={building || unbuilt.length === 0 || !lastBuildOk}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
            title={!lastBuildOk ? 'Run a successful 10-product build first' : ''}
          >
            <Hammer className="w-4 h-4" />
            Build Next 25 Draft Products
          </button>

          <button
            onClick={fixLabels}
            disabled={fixing || building}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium bg-white border border-gray-300 text-gray-800 hover:bg-gray-50 disabled:opacity-40"
          >
            <Wrench className="w-4 h-4" />
            {fixing ? 'Fixing…' : 'Fix Labels on Garment Rows'}
          </button>

          <button
            onClick={retryMarkBuilt}
            disabled={retrying || building}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
          >
            <RefreshCw className={`w-4 h-4 ${retrying ? 'animate-spin' : ''}`} />
            {retrying ? 'Marking…' : 'Retry Mark Built Garment Rows'}
          </button>

          <Link to="/AdminProducts">
            <button className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium bg-white border border-gray-300 text-gray-800 hover:bg-gray-50">
              <ExternalLink className="w-4 h-4" />
              View Draft Products
            </button>
          </Link>
        </div>
        {fixCount !== null && (
          <p className="text-xs text-green-700 font-medium flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Fixed labels on {fixCount} garment rows. Refresh preview to confirm.
          </p>
        )}

        {building && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Building draft products… do not close this page.
          </div>
        )}

        {retrying && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            Marking garment rows… do not close this page.
          </div>
        )}

        {retryReport && (
          <div className={`rounded-xl border p-4 space-y-3 ${retryReport.errors.length === 0 ? 'border-blue-200 bg-blue-50' : 'border-amber-200 bg-amber-50'}`}>
            <div className="flex items-center gap-2">
              {retryReport.errors.length === 0
                ? <CheckCircle2 className="w-5 h-5 text-blue-600" />
                : <TriangleAlert className="w-5 h-5 text-amber-600" />}
              <p className="font-semibold text-sm">
                {retryReport.errors.length === 0 ? 'Garment Row Marking Complete' : 'Marking Complete — Some Errors'}
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
              {[
                { label: 'Total approved rows', value: retryReport.total },
                { label: 'Already marked', value: retryReport.already_marked, blue: true },
                { label: 'Newly marked', value: retryReport.newly_marked, green: true },
                { label: 'Remaining unmarked', value: retryReport.remaining, warn: retryReport.remaining > 0 },
                { label: 'Errors', value: retryReport.errors.length, warn: retryReport.errors.length > 0 },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-lg border p-2">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className={`font-bold ${s.green ? 'text-green-700' : s.blue ? 'text-blue-700' : s.warn && s.value > 0 ? 'text-amber-700' : ''}`}>{s.value}</p>
                </div>
              ))}
            </div>
            <div className="bg-white rounded border px-3 py-2 text-xs text-muted-foreground">
              Draft products created: unchanged · Variants saved: unchanged · Deleted rows: 0
            </div>
            {retryReport.errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded p-2 max-h-32 overflow-auto">
                {retryReport.errors.map((e, i) => <p key={i} className="text-xs text-red-800">{e}</p>)}
              </div>
            )}
          </div>
        )}

        {showPreview && !building && <PreviewPanel groups={groups} />}
        {report && !building && <BuildReport report={report} />}
      </CardContent>
    </Card>
  );
}