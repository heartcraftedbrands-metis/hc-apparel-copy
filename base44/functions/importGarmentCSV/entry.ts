import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Map common header aliases to canonical field names
const HEADER_ALIASES = {
  'product name': 'product_name',
  'productname': 'product_name',
  'title': 'product_name',
  'brand': 'brand',
  'style number': 'style_number',
  'style_number': 'style_number',
  'style': 'style_number',
  'stylenumber': 'style_number',
  'color': 'color',
  'colour': 'color',
  'size': 'size',
  'sku': 'sku',
  'blank cost': 'blank_cost',
  'blank_cost': 'blank_cost',
  'cost': 'blank_cost',
  'price': 'price',
  'customer price': 'price',
  'customer_price': 'price',
  'inventory': 'inventory',
  'inventory qty': 'inventory',
  'inventory_qty': 'inventory',
  'stock': 'inventory',
  'qty': 'inventory',
  'quantity': 'inventory',
  'image url': 'image_url',
  'image_url': 'image_url',
  'image': 'image_url',
  'material': 'material',
  'product type': 'product_type',
  'product_type': 'product_type',
  'category': 'product_type',
  'status': 'status',
};

function normalizeHeader(h) {
  return (h || '').replace(/^"|"$/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseCSV(text) {
  // Detect delimiter: if more tabs than commas on header line, use tab
  const firstLine = text.split(/\r?\n/)[0] || '';
  const delimiter = (firstLine.split('\t').length > firstLine.split(',').length) ? '\t' : ',';

  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 1) return { headers: [], rows: [], rawHeaders: [], delimiter };

  const rawHeaders = lines[0].split(delimiter).map(h => h.replace(/^"|"$/g, '').trim());
  const normalizedHeaders = rawHeaders.map(normalizeHeader);
  const canonicalHeaders = normalizedHeaders.map(h => HEADER_ALIASES[h] || h);

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = [];
    let inQuote = false;
    let cur = '';
    for (const ch of lines[i]) {
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === delimiter && !inQuote) { vals.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    vals.push(cur.trim());
    const row = {};
    canonicalHeaders.forEach((h, idx) => {
      row[h] = (vals[idx] || '').replace(/^"|"$/g, '').trim();
    });
    rows.push({ data: row, lineNum: i + 1 });
  }
  return { headers: canonicalHeaders, rawHeaders, rows, delimiter };
}

function toNum(val, fieldName, lineNum, errors) {
  if (val === undefined || val === null || val === '') return null;
  const n = parseFloat(String(val).replace(/[^0-9.\-]/g, ''));
  if (isNaN(n)) {
    errors.push({ row: lineNum, field: fieldName, reason: `Invalid number "${val}" in column "${fieldName}"` });
    return null;
  }
  return n;
}

const VALID_MATERIALS = new Set([
  '100% Cotton', 'Organic Cotton', 'Ring-Spun Cotton', 'Cotton Blend',
  'CVC Cotton Blend', 'Linen', 'Wool', 'Bamboo', 'Bamboo Blend',
  'Sports / Activewear', 'Other',
]);

const VALID_TYPES = new Set([
  'T-Shirt', 'Hoodie', 'Sweatshirt', 'Tank Top', 'Polo',
  'Shorts', 'Joggers', 'Youth', 'Sportswear', 'Other',
]);

function parseStatus(val) {
  if (!val) return 'approved_to_sell';
  const v = val.toLowerCase();
  if (v.includes('not_selling') || v.includes('not selling')) return 'not_selling';
  if (v.includes('maybe')) return 'maybe_later';
  return 'approved_to_sell';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { file_url, csv_content, file_name, preview_only = false } = body;

    // Accept either file_url (fetched here) or raw csv_content
    let rawCSV = csv_content || '';
    if (!rawCSV && file_url) {
      const fetchRes = await fetch(file_url);
      if (!fetchRes.ok) {
        return Response.json({
          error: `Could not fetch uploaded file (HTTP ${fetchRes.status}). Please re-upload.`,
          detail: 'file_fetch_failed'
        }, { status: 400 });
      }
      rawCSV = await fetchRes.text();
    }

    if (!rawCSV || !rawCSV.trim()) {
      return Response.json({ error: 'CSV file is empty or could not be read.' }, { status: 400 });
    }

    // Check for obvious binary/non-text content
    if (rawCSV.includes('\u0000')) {
      return Response.json({ error: 'File appears to be binary or has invalid encoding. Please save as UTF-8 CSV.' }, { status: 400 });
    }

    const { headers, rawHeaders, rows, delimiter } = parseCSV(rawCSV);

    if (rows.length === 0) {
      return Response.json({
        error: 'No data rows found in CSV. Check that the file has a header row and at least one data row.',
        detected_delimiter: delimiter,
        detected_headers: rawHeaders,
      }, { status: 400 });
    }

    // Validate required columns are present
    const required = ['product_name', 'sku'];
    const missingCols = required.filter(col => !headers.includes(col));
    if (missingCols.length > 0) {
      return Response.json({
        error: `Missing required column(s): ${missingCols.join(', ')}`,
        detail: 'missing_columns',
        detected_headers: rawHeaders,
        mapped_to: headers,
        accepted_aliases: {
          product_name: ['Product Name', 'productname', 'title'],
          sku: ['SKU', 'sku'],
        },
        fix: `Rename your columns to match. Detected delimiter: "${delimiter === '\t' ? 'TAB' : ','}"`,
      }, { status: 400 });
    }

    if (rows.length > 500) {
      return Response.json({ error: `File has ${rows.length} rows. Maximum 500 per upload. Split into smaller files.` }, { status: 400 });
    }

    const mapped = [];
    const skipped = [];
    const rowErrors = [];
    const seenSkus = new Set();

    for (const { data: row, lineNum } of rows) {
      const sku = (row.sku || '').trim();
      const productName = (row.product_name || '').trim();
      const brand = (row.brand || '').trim();
      const styleNumber = (row.style_number || '').trim();

      if (!sku) {
        skipped.push({ row: lineNum, reason: 'Missing SKU — this row was skipped' });
        continue;
      }
      if (!productName) {
        skipped.push({ row: lineNum, sku, reason: 'Missing product_name — this row was skipped' });
        continue;
      }
      if (seenSkus.has(sku)) {
        skipped.push({ row: lineNum, sku, reason: `Duplicate SKU "${sku}" in file — only first occurrence kept` });
        continue;
      }
      seenSkus.add(sku);

      // Parse numbers — collect errors but don't skip the row (use 0 fallback)
      const blankCost = toNum(row.blank_cost, 'blank_cost', lineNum, rowErrors) ?? 0;
      let price = toNum(row.price, 'price', lineNum, rowErrors);
      if (price === null) {
        // Calculate from blank_cost if price missing
        price = parseFloat((blankCost + 2).toFixed(2));
      }

      const rawInv = row.inventory;
      let inventoryQty = 0;
      if (rawInv && rawInv !== '') {
        const n = parseInt(String(rawInv).replace(/[^0-9]/g, ''), 10);
        inventoryQty = isNaN(n) ? 0 : n;
      }

      const imageUrl = (row.image_url || '').trim();

      const rawMaterial = (row.material || '').trim();
      const material = VALID_MATERIALS.has(rawMaterial) ? rawMaterial : (rawMaterial ? 'Other' : '');

      const rawType = (row.product_type || '').trim();
      const product_type = VALID_TYPES.has(rawType) ? rawType : (rawType ? 'Other' : '');

      const status = parseStatus(row.status);

      mapped.push({ sku, brand, styleNumber, productName, color: row.color || '', size: row.size || '', material, product_type, blankCost, customerPrice: price, inventoryQty, imageUrl, status });
    }

    if (mapped.length === 0) {
      return Response.json({
        error: 'No valid rows to import after validation.',
        skipped_detail: skipped,
        row_errors: rowErrors,
        fix: 'All rows were missing SKU or Product Name. Check your column names and data.',
      }, { status: 400 });
    }

    if (preview_only) {
      return Response.json({
        success: true, preview_only: true,
        total_rows_in_file: rows.length,
        valid_rows: mapped.length,
        skipped_rows: skipped.length,
        skipped_detail: skipped,
        row_errors: rowErrors,
        detected_headers: rawHeaders,
        mapped_headers: headers,
        preview: mapped.slice(0, 10).map(m => ({
          sku: m.sku, brand: m.brand, style_number: m.styleNumber,
          product_name: m.productName, color: m.color, size: m.size,
          blank_cost: m.blankCost, price: m.customerPrice,
          inventory_qty: m.inventoryQty, image_url: m.imageUrl || '(blank)', status: m.status,
        })),
      });
    }

    // Load existing garments by SKU
    const existingBySku = {};
    let offset = 0;
    while (true) {
      const page = await base44.asServiceRole.entities.GarmentCatalog.filter({}, '-created_date', 500, offset);
      if (!page || page.length === 0) break;
      page.forEach(item => { if (item.sku) existingBySku[item.sku] = item; });
      if (page.length < 500) break;
      offset += page.length;
    }

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    let newAdded = 0, updated = 0;
    const importErrors = [];
    const importDate = new Date().toISOString().split('T')[0];

    for (const m of mapped) {
      await sleep(80);
      const data = {
        brand: m.brand,
        style_number: m.styleNumber,
        product_name: m.productName,
        material: m.material,
        product_type: m.product_type,
        color: m.color,
        size: m.size,
        sku: m.sku,
        blank_cost: m.blankCost,
        customer_price: m.customerPrice,
        inventory_qty: m.inventoryQty,
        image_url: m.imageUrl || '',
        status: m.status,
        source_file: file_name || 'unknown',
        import_date: importDate,
      };
      try {
        if (existingBySku[m.sku]) {
          await base44.asServiceRole.entities.GarmentCatalog.update(existingBySku[m.sku].id, data);
          updated++;
        } else {
          await base44.asServiceRole.entities.GarmentCatalog.create(data);
          newAdded++;
        }
      } catch (err) {
        importErrors.push({ sku: m.sku, reason: err.message });
      }
    }

    return Response.json({
      success: true,
      file_name: file_name || 'unknown',
      rows_in_file: rows.length,
      rows_processed: mapped.length,
      new_garments_added: newAdded,
      existing_garments_updated: updated,
      skipped_rows: skipped.length,
      skipped_detail: skipped,
      row_errors: rowErrors,
      import_errors: importErrors,
      rows_deleted: 0,
      products_published: 0,
      note: 'All records imported as GarmentCatalog entries (draft). No products published.',
    });

  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack?.split('\n').slice(0, 5) }, { status: 500 });
  }
});