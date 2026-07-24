import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const APPROVED_BRANDS = [
  'gildan', 'bella + canvas', 'comfort colors', 'shaka wear',
  'next level', 'jerzees', 'hanes', 'port & company', 'port and company',
  'sport-tek', 'sport tek', 'rabbit skins', 'adidas',
];

function normalizeBrand(raw) {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();
  if (lower.includes('bella') && lower.includes('canvas')) return 'Bella + Canvas';
  if (lower === 'gildan') return 'Gildan';
  if (lower.includes('comfort color')) return 'Comfort Colors';
  if (lower.includes('next level')) return 'Next Level';
  if (lower === 'jerzees') return 'Jerzees';
  if (lower === 'hanes') return 'Hanes';
  if (lower === 'port & company' || lower === 'port and company') return 'Port & Company';
  if (lower === 'sport-tek' || lower === 'sport tek') return 'Sport-Tek';
  if (lower.includes('rabbit skins') || lower.includes('rabbitskins')) return 'Rabbit Skins';
  if (lower.includes('shaka wear') || lower === 'shakawear') return 'Shaka Wear';
  if (lower === 'adidas') return 'Adidas';
  return null;
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim().toLowerCase());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = [];
    let inQuote = false;
    let cur = '';
    for (const ch of lines[i]) {
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === ',' && !inQuote) { vals.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    vals.push(cur.trim());
    const row = {};
    headers.forEach((h, idx) => { row[h] = (vals[idx] || '').replace(/^"|"$/g, '').trim(); });
    rows.push(row);
  }
  return { headers, rows };
}

function getField(row, ...keys) {
  for (const k of keys) {
    const v = row[k.toLowerCase()];
    if (v !== undefined && v !== '') return v;
  }
  return '';
}

// Map curated_status CSV value to entity enum value
function parseCuratedStatus(val) {
  if (!val) return null;
  const v = val.toLowerCase().replace(/[\s_-]+/g, '_');
  if (v.includes('approved') || v.includes('approve_to_sell') || v.includes('approved_to_sell')) return 'approved_to_sell';
  if (v.includes('not_selling') || v.includes('not selling')) return 'not_selling';
  if (v.includes('maybe') || v.includes('maybe_later')) return 'maybe_later';
  if (v.includes('pending') || v.includes('pending_review')) return 'pending_review';
  return null;
}

// Map catalog_status CSV value to entity enum value
function parseCatalogStatus(val) {
  if (!val) return null;
  const v = val.toLowerCase().replace(/[\s_-]+/g, '_');
  if (v.includes('added_to_shop') || v.includes('added to shop')) return 'added_to_shop';
  if (v.includes('archived')) return 'archived';
  if (v.includes('hidden')) return 'hidden';
  if (v.includes('vendor_catalog_only') || v.includes('vendor catalog only')) return 'vendor_catalog_only';
  return null;
}

const VALID_LANES = new Set([
  'Cotton', 'Organic Cotton', 'Ring-Spun Cotton', 'Cotton Blend', 'CVC',
  'Linen', 'Wool', 'Bamboo', 'Bamboo Blend', 'Sports / Activewear',
  'Hoodie / Fleece', 'Youth', 'Other',
]);

function mapRow(row) {
  const sku = getField(row, 'sku', 'supplier sku');
  const rawBrand = getField(row, 'brand');
  const brand = normalizeBrand(rawBrand);
  const styleNumber = getField(row, 'style number', 'style_number', 'style id', 'style');
  const productName = getField(row, 'product name', 'title') ||
    (brand && styleNumber ? `${brand} ${styleNumber}` : '');
  const color = getField(row, 'color') || 'Default';
  const size = getField(row, 'size') || 'OS';

  // Cost
  const rawCost = getField(row, 'blank cost', 'blank_cost', 'cost', 'price');
  const blankCost = rawCost ? parseFloat(rawCost) : 0;

  // Inventory
  const rawInv = getField(row, 'inventory qty', 'inventory_qty', 'inventory', 'qty', 'quantity', 'stock qty', 'stock_qty', 'stock', 'available_quantity', 'available qty');
  const stockStatus = getField(row, 'stock status', 'stock_status', 'availability', 'available').toLowerCase();
  let inventoryQty = 0;
  if (rawInv) {
    const n = parseInt(String(rawInv).replace(/[^0-9]/g, ''), 10);
    inventoryQty = isNaN(n) ? 0 : n;
  }
  if (inventoryQty === 0 && rawInv === '') {
    if (/in.?stock|available now|available/i.test(stockStatus)) inventoryQty = 1;
  }
  if (/out.?of.?stock|discontinued|unavailable/i.test(stockStatus)) inventoryQty = 0;

  const imageUrl = getField(row, 'image url', 'image_url', 'image');
  const category = getField(row, 'category', 'product category') || 'Apparel Blanks';

  // --- Curated fields (trust if present in CSV) ---
  const rawCuratedStatus = getField(row, 'curated status', 'curated_status');
  const curatedStatus = parseCuratedStatus(rawCuratedStatus);

  const rawCatalogStatus = getField(row, 'catalog status', 'catalog_status', 'public visibility', 'visibility');
  const catalogStatus = parseCatalogStatus(rawCatalogStatus);

  const rawLane = getField(row, 'product lane', 'product_lane', 'lane');
  const productLane = (rawLane && VALID_LANES.has(rawLane)) ? rawLane : '';

  const rawCustomerPrice = getField(row, 'customer price', 'customer_price');
  const customerPrice = rawCustomerPrice ? parseFloat(rawCustomerPrice) : null;

  const reviewNotes = getField(row, 'review notes', 'review_notes', 'notes');

  return {
    sku, brand, rawBrand, styleNumber, productName, color, size,
    blankCost, inventoryQty, imageUrl, category,
    needsPriceReview: !rawCost,
    curatedStatus,
    catalogStatus,
    productLane,
    customerPrice,
    reviewNotes,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { csv_content, file_name, preview_only = false } = body;

    if (!csv_content) return Response.json({ error: 'Missing csv_content' }, { status: 400 });

    const { rows } = parseCSV(csv_content);
    if (rows.length === 0) return Response.json({ error: 'No data rows found in CSV' }, { status: 400 });
    if (rows.length > 500) return Response.json({ error: `File has ${rows.length} rows. Maximum 500 per upload.` }, { status: 400 });

    const mapped = [];
    const skipped = [];
    const seenSkus = new Set();
    const duplicatesInFile = [];

    for (let i = 0; i < rows.length; i++) {
      const m = mapRow(rows[i]);
      if (!m.sku) { skipped.push({ row: i + 2, reason: 'Missing SKU' }); continue; }
      if (!m.brand) { skipped.push({ row: i + 2, sku: m.sku, reason: `Unapproved brand: "${m.rawBrand}"` }); continue; }
      if (seenSkus.has(m.sku)) { duplicatesInFile.push(m.sku); }
      seenSkus.add(m.sku);
      mapped.push(m);
    }

    const previewRows = mapped.slice(0, 10).map(m => ({
      sku: m.sku, brand: m.brand, style_number: m.styleNumber,
      product_name: m.productName, color: m.color, size: m.size,
      blank_cost: m.blankCost,
      public_price: m.customerPrice ?? parseFloat((m.blankCost + 2).toFixed(2)),
      inventory: m.inventoryQty,
      product_lane: m.productLane,
      curated_status: m.curatedStatus,
    }));

    if (preview_only) {
      return Response.json({
        success: true,
        preview_only: true,
        total_rows_in_file: rows.length,
        approved_brand_rows: mapped.length,
        skipped_rows: skipped.length,
        duplicates_in_file: [...new Set(duplicatesInFile)],
        skipped_detail: skipped,
        preview: previewRows,
        has_curated_fields: mapped.some(m => m.curatedStatus || m.productLane || m.customerPrice !== null),
        approved_to_sell_count: mapped.filter(m => m.curatedStatus === 'approved_to_sell').length,
      });
    }

    // --- Load existing catalog rows ---
    let catalogBefore = 0;
    let hasMore = true;
    let offset = 0;
    const existingByKey = {};
    while (hasMore) {
      const page = await base44.asServiceRole.entities.SSCatalogItem.filter({}, '-created_date', 500, offset);
      if (!page || page.length === 0) { hasMore = false; }
      else {
        page.forEach(item => {
          if (item.sku) existingByKey[`SS|||${item.sku}`] = item;
        });
        catalogBefore += page.length;
        if (page.length < 500) hasMore = false;
        else offset += page.length;
      }
    }

    // --- Import ---
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    let newAdded = 0;
    let updated = 0;
    let approvedToSellCount = 0;
    const errors = [];

    for (const m of mapped) {
      await sleep(150);
      const key = `SS|||${m.sku}`;

      // Build catalog data — trust curated fields from CSV when present
      const publicPrice = m.customerPrice ?? parseFloat((m.blankCost + 2).toFixed(2));

      const catalogData = {
        vendor: 'S&S Activewear',
        brand: m.brand,
        style_number: m.styleNumber,
        product_name: m.productName,
        product_category: m.category,
        color: m.color,
        size: m.size,
        sku: m.sku,
        blank_cost: m.blankCost,
        public_price: publicPrice,
        inventory_qty: m.inventoryQty,
        image_url: m.imageUrl,
        source_file_name: file_name || 'unknown',
        import_batch: new Date().toISOString().split('T')[0],
        // Always default to safe values
        catalog_status: 'vendor_catalog_only',
        curated_status: m.curatedStatus || 'pending_review',
      };

      // Trust curated fields from CSV when present
      if (m.curatedStatus) catalogData.curated_status = m.curatedStatus;
      if (m.catalogStatus) catalogData.catalog_status = m.catalogStatus;
      if (m.productLane) catalogData.product_lane = m.productLane;
      if (m.customerPrice !== null) catalogData.customer_price = m.customerPrice;
      if (m.reviewNotes) catalogData.review_notes = m.reviewNotes;

      // If approved_to_sell in CSV — keep catalog_status = vendor_catalog_only, never publish
      if (m.curatedStatus === 'approved_to_sell') {
        catalogData.catalog_status = 'vendor_catalog_only';
        approvedToSellCount++;
      }

      try {
        const existing = existingByKey[key];
        if (existing) {
          // On update: always overwrite inventory_qty from CSV — never keep stale 0
          await base44.asServiceRole.entities.SSCatalogItem.update(existing.id, catalogData);
          updated++;
        } else {
          await base44.asServiceRole.entities.SSCatalogItem.create(catalogData);
          newAdded++;
        }
      } catch (err) {
        errors.push(`SKU ${m.sku}: ${err.message}`);
      }
    }

    // --- Count rows after ---
    let catalogAfter = 0;
    hasMore = true;
    offset = 0;
    while (hasMore) {
      const page = await base44.asServiceRole.entities.SSCatalogItem.filter({}, '-created_date', 500, offset);
      if (!page || page.length === 0) { hasMore = false; }
      else {
        catalogAfter += page.length;
        if (page.length < 500) hasMore = false;
        else offset += page.length;
      }
    }

    // Save ImportBatch record
    await base44.asServiceRole.entities.ImportBatch.create({
      batch_id: `batch_${Date.now()}`,
      file_name: file_name || 'unknown',
      uploaded_date: new Date().toISOString(),
      rows_in_file: rows.length,
      new_skus_added: newAdded,
      existing_skus_updated: updated,
      total_catalog_rows_after: catalogAfter,
      rows_deleted: 0,
      import_status: errors.length === 0 ? 'success' : 'partial',
      errors: errors,
    });

    return Response.json({
      success: true,
      file_name: file_name,
      rows_in_file: rows.length,
      rows_imported: newAdded + updated,
      new_skus_added: newAdded,
      existing_skus_updated: updated,
      rows_skipped: skipped.length,
      approved_to_sell_count: approvedToSellCount,
      errors: errors,
      catalog_rows_before: catalogBefore,
      catalog_rows_after: catalogAfter,
      rows_deleted: 0,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
