import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Parse CSV text
function parseCSV(text) {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length === 0) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  return lines.slice(1).map((line, idx) => {
    const values = line.split(',').map(v => v.trim());
    const obj = { __row_number: idx + 2 };
    headers.forEach((h, i) => { obj[h] = values[i] || ''; });
    return obj;
  });
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
    const { file_content, file_name, row_limit = 25 } = body;

    if (!file_content || !file_name) {
      return Response.json({ error: 'Missing file_content or file_name' }, { status: 400 });
    }

    const results = {
      success: false,
      file_name,
      row_limit,
      rows_in_file: 0,
      rows_processed: 0,
      rows_before_import: 0,
      rows_after_import: 0,
      new_skus_added: 0,
      existing_skus_updated: 0,
      rows_deleted: 0,
      errors: [],
      error_log: [],
      batch_id: `batch-limit-${Date.now()}`,
    };

    // Parse file
    let rows = [];
    try {
      rows = parseCSV(file_content);
      results.rows_in_file = rows.length;
    } catch (err) {
      results.error_log.push(`Parse error: ${err.message}`);
      return Response.json({
        success: false,
        error: 'Failed to parse file',
        results
      }, { status: 400 });
    }

    if (rows.length === 0) {
      results.error_log.push('No rows found in file');
      return Response.json({
        success: false,
        error: 'File contains no data rows',
        results
      }, { status: 400 });
    }

    // Limit to row_limit rows
    const limitedRows = rows.slice(0, row_limit);
    results.rows_processed = limitedRows.length;

    // Count catalog rows BEFORE import
    let countBefore = 0;
    let hasMore = true;
    let offset = 0;
    const existingByKey = {};
    while (hasMore) {
      const page = await base44.asServiceRole.entities.SSCatalogItem.filter({}, '-created_date', 500, offset);
      if (!page || page.length === 0) {
        hasMore = false;
      } else {
        countBefore += page.length;
        page.forEach(item => {
          const key = `${item.vendor || 'S&S Activewear'}|||${item.sku || ''}`;
          if (key && item.sku && !existingByKey[key]) {
            existingByKey[key] = item;
          }
        });
        if (page.length < 500) hasMore = false;
        offset += page.length;
      }
    }
    results.rows_before_import = countBefore;

    // Process import rows
    const toCreate = [];
    const toUpdate = [];

    for (const rawRow of limitedRows) {
      try {
        const normalized = normalizeSSRow(rawRow);

        if (!normalized.sku) {
          results.error_log.push(`Row ${rawRow.__row_number}: skipped (missing SKU)`);
          continue;
        }

        const key = `S&S Activewear|||${normalized.sku}`;
        const existing = existingByKey[key];

        if (existing) {
          toUpdate.push({ id: existing.id, data: normalized });
          results.existing_skus_updated++;
        } else {
          toCreate.push(normalized);
          results.new_skus_added++;
        }
      } catch (err) {
        results.error_log.push(`Row ${rawRow.__row_number}: ${err.message}`);
      }
    }

    // Execute creates
    if (toCreate.length > 0) {
      try {
        await base44.asServiceRole.entities.SSCatalogItem.bulkCreate(toCreate);
      } catch (err) {
        results.error_log.push(`Bulk create failed: ${err.message}`);
        return Response.json({
          success: false,
          error: `Failed to create rows: ${err.message}`,
          results
        }, { status: 500 });
      }
    }

    // Execute updates
    if (toUpdate.length > 0) {
      try {
        for (const { id, data } of toUpdate) {
          await base44.asServiceRole.entities.SSCatalogItem.update(id, data);
        }
      } catch (err) {
        results.error_log.push(`Update failed: ${err.message}`);
        return Response.json({
          success: false,
          error: `Failed to update rows: ${err.message}`,
          results
        }, { status: 500 });
      }
    }

    // Count catalog rows AFTER import
    let countAfter = 0;
    hasMore = true;
    offset = 0;
    while (hasMore) {
      const page = await base44.asServiceRole.entities.SSCatalogItem.filter({}, '-created_date', 500, offset);
      if (!page || page.length === 0) {
        hasMore = false;
      } else {
        countAfter += page.length;
        if (page.length < 500) hasMore = false;
        offset += page.length;
      }
    }
    results.rows_after_import = countAfter;

    // Safety check
    if (results.rows_after_import < results.rows_before_import) {
      results.error_log.push(`SAFETY: rows would reduce from ${results.rows_before_import} to ${results.rows_after_import}`);
      return Response.json({
        success: false,
        error: 'Import blocked: catalog rows would decrease',
        results
      }, { status: 400 });
    }

    return Response.json({
      success: true,
      message: `Test import complete. Added ${results.new_skus_added} new SKUs, updated ${results.existing_skus_updated}.`,
      results
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});