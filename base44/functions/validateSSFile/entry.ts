import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Parse CSV text
function parseCSV(text) {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const rows = lines.slice(1).map((line, idx) => {
    const values = line.split(',').map(v => v.trim());
    const obj = { __row_number: idx + 2 };
    headers.forEach((h, i) => { obj[h] = values[i] || ''; });
    return obj;
  });
  return { headers, rows };
}

// Find flexible field name
function findField(row, ...aliases) {
  for (const alias of aliases) {
    if (row[alias.toLowerCase()]) return row[alias.toLowerCase()];
  }
  return '';
}

// Normalize S&S field names
function normalizeSSRow(row) {
  const normalized = {
    vendor: 'S&S Activewear',
    brand: findField(row, 'brand', 'brand name') || '',
    style_number: findField(row, 'style number', 'style_number', 'style #', 'style', 'style id') || '',
    product_name: findField(row, 'product name', 'product_name', 'title', 'description') || '',
    product_category: findField(row, 'category', 'product_category') || 'Apparel Blanks',
    description: findField(row, 'description', 'desc') || '',
    color: findField(row, 'color') || 'Default',
    size: findField(row, 'size') || 'OS',
    sku: findField(row, 'sku', 'item #', 'item_number', 'supplier_sku') || '',
    image_url: findField(row, 'image url', 'image_url', 'image') || '',
    blank_cost: parseFloat(findField(row, 'blank cost', 'blank_cost', 'cost', 'unit cost', 'price') || 0),
    msrp: parseFloat(findField(row, 'msrp', 'price') || 0),
    inventory_qty: parseInt(findField(row, 'inventory', 'inventory_qty', 'qty', 'quantity') || 0),
    warehouse_location: findField(row, 'warehouse', 'warehouse_location') || '',
    weight: findField(row, 'weight') || '',
    case_quantity: parseInt(findField(row, 'case qty', 'case_quantity') || 0),
    item_status: 'active',
    catalog_status: 'vendor_catalog_only',
  };
  return normalized;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { file_content, file_name } = body;

    if (!file_content || !file_name) {
      return Response.json({ error: 'Missing file_content or file_name' }, { status: 400 });
    }

    // Parse file
    const { headers, rows } = parseCSV(file_content);

    if (rows.length === 0) {
      return Response.json({
        success: false,
        error: 'File contains no data rows',
        file_name,
        headers: [],
        row_count: 0
      }, { status: 400 });
    }

    // Detect required columns (flexible matching)
    const detectedColumns = {
      has_sku: headers.some(h => ['sku', 'item #', 'item_number', 'supplier_sku'].includes(h)),
      has_brand: headers.some(h => ['brand', 'brand name'].includes(h)),
      has_style: headers.some(h => ['style number', 'style_number', 'style #', 'style', 'style id'].includes(h)),
      has_product_name: headers.some(h => ['product name', 'product_name', 'title', 'description'].includes(h)),
    };

    const missing = [];
    if (!detectedColumns.has_sku) missing.push('SKU');
    if (!detectedColumns.has_brand) missing.push('Brand');
    if (!detectedColumns.has_style) missing.push('Style Number');

    // Parse first 5 rows and check for duplicates
    const previewRows = [];
    const skuSet = new Set();
    let duplicateSKUs = 0;
    let approvedBrandRows = 0;
    let approvedBrands = ['Adidas', 'Bella + Canvas', 'District', 'Gildan', 'Hanes', 'Nike', 'Port & Company', 'Russell'];

    for (let i = 0; i < Math.min(5, rows.length); i++) {
      const normalized = normalizeSSRow(rows[i]);
      previewRows.push({
        row_number: rows[i].__row_number,
        sku: normalized.sku,
        brand: normalized.brand,
        product_name: normalized.product_name,
        color: normalized.color,
        size: normalized.size,
      });
      if (normalized.sku) {
        if (skuSet.has(normalized.sku)) {
          duplicateSKUs++;
        }
        skuSet.add(normalized.sku);
      }
    }

    // Count rows by brand
    const brandCounts = {};
    rows.forEach(row => {
      const normalized = normalizeSSRow(row);
      if (normalized.brand) {
        brandCounts[normalized.brand] = (brandCounts[normalized.brand] || 0) + 1;
        if (approvedBrands.includes(normalized.brand)) {
          approvedBrandRows++;
        }
      }
    });

    return Response.json({
      success: true,
      file_name,
      headers: headers.slice(0, 10), // Show first 10 detected headers
      total_rows: rows.length,
      preview_rows: previewRows,
      detected_columns: detectedColumns,
      missing_required_columns: missing,
      duplicate_skus_in_file: duplicateSKUs,
      approved_brand_rows: approvedBrandRows,
      brand_distribution: brandCounts,
      warnings: missing.length > 0 ? [`Missing columns: ${missing.join(', ')}`] : [],
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});