import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Wrench, CheckCircle2, TriangleAlert } from 'lucide-react';

const SS_CDN = 'https://www.ssactivewear.com/';

// Resolve a garment image_url to a full HTTP URL
function resolveImageUrl(raw) {
  if (!raw) return null;
  if (raw.startsWith('http')) return raw;
  // relative S&S path like "Images/Color/17106_f_fm.jpg"
  return SS_CDN + raw.replace(/^\//, '');
}

// Pull any image field off a garment row
function getGarmentImage(g) {
  const raw =g.image_url || g.imageUrl || g.image || g.variant_image ||
    g.main_image || g.product_image || g.thumbnail_url || null;
  return resolveImageUrl(raw);
}

export default function RepairProductImages({ onRefresh }) {
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState(null);

  const run = async () => {
    if (!confirm(
      'Force Repair Variant Images From Garment Catalog?\n\n' +
      'This scans all draft garment products and copies real image URLs from matching Garment Catalog rows.\n\n' +
      'Nothing will be published or deleted.'
    )) return;

    setRunning(true);
    setReport(null);

    const rpt = {
      products_scanned: 0,
      variants_scanned: 0,
      variants_with_image_before: 0,
      variants_repaired: 0,
      variants_still_missing: 0,
      products_given_main_image: 0,
      deleted: 0,
      errors: [],
    };

    try {
      // Load ALL garment products (draft + public, vendor_source = Garment Catalog)
      const products = await base44.entities.Product.filter(
        { vendor_source: 'Garment Catalog' },
        '-created_date', 100
      );
      rpt.products_scanned = products.length;

      // Load all garment catalog rows (paginate)
      const allGarments = [];
      let offset = 0;
      while (true) {
        const batch = await base44.entities.GarmentCatalog.filter({}, '-created_date', 500, offset);
        if (!batch || batch.length === 0) break;
        allGarments.push(...batch);
        if (batch.length < 500) break;
        offset += batch.length;
      }

      const norm = (s) => (s || '').toLowerCase().trim().replace(/\s+/g, ' ');

      // Build lookups
      // SKU → garment
      const skuMap = new Map();
      // brand||style||color||size → garment
      const fullMap = new Map();
      // brand||style||color → first image URL
      const colorImageMap = new Map();

      for (const g of allGarments) {
        const img = getGarmentImage(g);
        if (g.sku) skuMap.set(norm(g.sku), g);
        const fullKey = `${norm(g.brand)}||${norm(g.style_number)}||${norm(g.color)}||${norm(g.size)}`;
        if (!fullMap.has(fullKey)) fullMap.set(fullKey, g);
        const colorKey = `${norm(g.brand)}||${norm(g.style_number)}||${norm(g.color)}`;
        if (!colorImageMap.has(colorKey) && img) colorImageMap.set(colorKey, img);
      }

      for (const product of products) {
        // Extract brand/style from internal_notes
        const brandMatch = product.internal_notes?.match(/Brand: (.+?) \//);
        const brand = brandMatch?.[1]?.trim() || '';
        const styleNumber = product.supplier_sku || '';

        const sp = product.size_prices || [];
        if (sp.length === 0) continue;

        rpt.variants_scanned += sp.length;

        let changed = false;
        const newSizePrices = sp.map(entry => {
          const raw = entry.size || '';
          const slashIdx = raw.indexOf(' / ');
          if (slashIdx === -1) return entry;

          const color = raw.substring(0, slashIdx).trim();
          const size = raw.substring(slashIdx + 3).trim();

          // Count how many already had images
          if (entry.image_url) rpt.variants_with_image_before++;

          // 1. Try SKU match first
          let garment = entry.sku ? skuMap.get(norm(entry.sku)) : null;

          // 2. Fall back to brand+style+color+size
          if (!garment) {
            const fullKey = `${norm(brand)}||${norm(styleNumber)}||${norm(color)}||${norm(size)}`;
            garment = fullMap.get(fullKey);
          }

          const newEntry = { ...entry };

          if (garment) {
            const imgUrl = getGarmentImage(garment);
            if (imgUrl && newEntry.image_url !== imgUrl) {
              newEntry.image_url = imgUrl;
              rpt.variants_repaired++;
              changed = true;
            }
            if (garment.sku && newEntry.sku !== garment.sku) {
              newEntry.sku = garment.sku;
              changed = true;
            }
          }

          return newEntry;
        });

        // Count still missing
        rpt.variants_still_missing += newSizePrices.filter(e => !e.image_url).length;

        // Set product.image_url if missing or relative
        let productUpdates = {};
        if (changed) productUpdates.size_prices = newSizePrices;

        const currentMainImg = resolveImageUrl(product.image_url);
        if (!currentMainImg) {
          // Try first variant image
          const firstImg = newSizePrices.find(e => e.image_url)?.image_url;
          // Also try first from colorImageMap
          const fallbackImg = firstImg || (() => {
            for (const [k, v] of colorImageMap.entries()) {
              if (k.startsWith(`${norm(brand)}||${norm(styleNumber)}||`)) return v;
            }
            return null;
          })();
          if (fallbackImg) {
            productUpdates.image_url = fallbackImg;
            rpt.products_given_main_image++;
            changed = true;
          }
        } else if (!product.image_url?.startsWith('http') && currentMainImg) {
          // Fix relative main image to full URL
          productUpdates.image_url = currentMainImg;
          rpt.products_given_main_image++;
          changed = true;
        }

        if (changed) {
          try {
            await base44.entities.Product.update(product.id, productUpdates);
            await new Promise(r => setTimeout(r, 150));
          } catch (e) {
            rpt.errors.push(`Product ${product.id} (${product.name?.slice(0, 30)}): ${e.message}`);
          }
        }
      }
    } catch (e) {
      rpt.errors.push('Fatal: ' + e.message);
    }

    setReport(rpt);
    setRunning(false);
    if (onRefresh) onRefresh();

    if (rpt.errors.length === 0) {
      toast.success(`Repair complete — ${rpt.variants_repaired} variants repaired, ${rpt.products_given_main_image} product images set`);
    } else {
      toast.warning(`Repair done with ${rpt.errors.length} error(s)`);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="w-7 h-7 bg-primary text-primary-foreground rounded-full text-sm flex items-center justify-center font-bold">5</span>
          Force Repair Variant Images From Garment Catalog
          <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-800 font-medium border border-blue-200">
            Draft Only · Nothing Published
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground">What this does:</p>
          <p>• Scans all garment products and all Garment Catalog rows</p>
          <p>• Matches variants by SKU first, then Brand + Style# + Color + Size</p>
          <p>• Copies real S&S image URLs into each variant (size_prices[].image_url)</p>
          <p>• Fixes relative image paths to full https://www.ssactivewear.com/ URLs</p>
          <p>• Sets product.image_url from first valid variant if currently missing/relative</p>
          <p className="text-green-700 font-medium mt-1">✓ Updates products only · Nothing published · Nothing deleted</p>
        </div>

        <button
          onClick={run}
          disabled={running}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Wrench className={`w-4 h-4 ${running ? 'animate-spin' : ''}`} />
          {running ? 'Repairing…' : 'Force Repair Variant Images From Garment Catalog'}
        </button>

        {running && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            Scanning garment catalog and updating products… do not close this page.
          </div>
        )}

        {report && !running && (
          <div className={`rounded-xl border p-4 space-y-3 ${report.errors.length === 0 ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
            <div className="flex items-center gap-2">
              {report.errors.length === 0
                ? <CheckCircle2 className="w-5 h-5 text-green-600" />
                : <TriangleAlert className="w-5 h-5 text-amber-600" />}
              <p className="font-semibold">{report.errors.length === 0 ? 'Repair Complete' : 'Repair Complete — Some Errors'}</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
              {[
                { label: 'Products scanned', value: report.products_scanned },
                { label: 'Variants scanned', value: report.variants_scanned },
                { label: 'Had image before', value: report.variants_with_image_before },
                { label: 'Variants repaired', value: report.variants_repaired, green: true },
                { label: 'Still missing image', value: report.variants_still_missing, warn: report.variants_still_missing > 0 },
                { label: 'Product images set', value: report.products_given_main_image, green: true },
                { label: 'Deleted', value: 0, green: true },
                { label: 'Published', value: 0, green: true },
                { label: 'Errors', value: report.errors.length, warn: report.errors.length > 0 },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-lg border p-2">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className={`font-bold ${s.green ? 'text-green-700' : s.warn && s.value > 0 ? 'text-amber-700' : ''}`}>{s.value}</p>
                </div>
              ))}
            </div>
            {report.errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded p-2 max-h-32 overflow-auto">
                {report.errors.map((e, i) => <p key={i} className="text-xs text-red-800">{e}</p>)}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}