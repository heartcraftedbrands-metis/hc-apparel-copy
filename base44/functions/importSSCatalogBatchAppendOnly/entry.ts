import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Parse CSV text
function parseCSV(text) {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length === 0) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i] || ''; });
    return obj;
  });
}

// Normalize S&S field names to standard schema
function normalizeSSRow(row) {
  const normalized = {
    vendor: 'S&S Activewear',
    brand: row.brand || row['brand name'] || '',
    style_number: row['style #'] || row['style_number'] || row['style'] || '',
    product_name: row['product name'] || row['product_name'] || row['description'] || '',
    product_category: row['category'] || row['product_category'] || '',
    description: row['description'] || row['desc'] || '',
    color: row['color'] || '',
    size: row['size'] || '',
    sku: row['sku'] || row['item #'] || row['item_number'] || '',
    image_url: row['image url'] || row['image_url'] || '',
    blank_cost: parseFloat(row['cost'] || row['blank_cost'] || row['unit cost'] || 0),
    msrp: parseFloat(row['msrp'] || row['price'] || 0),
    inventory_qty: parseInt(row['qty'] || row['inventory_qty'] || row['quantity'] || 0),
    warehouse_location: row['warehouse'] || row['warehouse_location'] || '',
    weight: row['weight'] || '',
    case_quantity: parseInt(row['case qty'] || row['case_quantity'] || 0),
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

    const results = {
      success: false,
      file_name,
      rows_in_file: 0,
      rows_before_import: 0,
      rows_after_import: 0,
      new_skus_added: 0,
      existing_skus_updated: 0,
      rows_deleted: 0,
      errors: [],
      error_log: [],
      batch_id: `batch-${Date.now()}`,
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

    // Count catalog rows BEFORE import (paginate for true count)
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

    for (const rawRow of rows) {
      try {
        const normalized = normalizeSSRow(rawRow);

        if (!normalized.sku) {
          results.error_log.push(`Row skipped: missing SKU`);
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
        results.error_log.push(`Row error: ${err.message}`);
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
          error: 'Failed to create new rows',
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
          error: 'Failed to update existing rows',
          results
        }, { status: 500 });
      }
    }

    // Count catalog rows AFTER import (paginate for true count)
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

    // Safety check: never allow row reduction
    if (results.rows_after_import < results.rows_before_import) {
      results.error_log.push(`SAFETY BLOCKED: rows would reduce from ${results.rows_before_import} to ${results.rows_after_import}`);
      return Response.json({
        success: false,
        error: 'Import blocked because it would reduce catalog rows.',
        details: `Before: ${results.rows_before_import} | After: ${results.rows_after_import}`,
        results
      }, { status: 400 });
    }

    // Create ImportBatchHistory record
    try {
      await base44.asServiceRole.entities.ImportBatch.create({
        batch_id: results.batch_id,
        file_name: results.file_name,
        uploaded_date: new Date().toISOString(),
        rows_in_file: results.rows_in_file,
        new_skus_added: results.new_skus_added,
        existing_skus_updated: results.existing_skus_updated,
        total_catalog_rows_after: results.rows_after_import,
        rows_deleted: 0,
        errors: results.error_log,
        import_status: results.error_log.length === 0 ? 'success' : 'partial',
      });
    } catch (err) {
      results.error_log.push(`Failed to create batch history: ${err.message}`);
    }

    return Response.json({
      success: true,
      message: `Import complete. Added ${results.new_skus_added} new SKUs, updated ${results.existing_skus_updated} existing SKUs.`,
      results
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});