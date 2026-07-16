import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

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

function findField(row, ...aliases) {
  for (const alias of aliases) {
    if (row[alias.toLowerCase()]) return row[alias.toLowerCase()];
  }
  return '';
}

function normalizeSSRow(row) {
  const sku = (findField(row, 'sku', 'item #', 'item_number', 'supplier_sku') || '').trim();
  const brand = (findField(row, 'brand', 'brand name') || '').trim();
  const style = (findField(row, 'style number', 'style_number', 'style #', 'style', 'style id') || '').trim();
  const productName = findField(row, 'product name', 'product_name', 'title', 'description') || 
    (brand && style ? `${brand} ${style}` : '') || 'Unknown Product';
  
  let blankCost = 0;
  const costStr = findField(row, 'blank cost', 'blank_cost', 'cost', 'unit cost', 'price');
  if (costStr) {
    const parsed = parseFloat(costStr);
    blankCost = isNaN(parsed) ? 0 : parsed;
  }

  return {
    vendor: 'S&S Activewear',
    brand,
    style_number: style,
    product_name: productName,
    product_category: findField(row, 'category', 'product_category') || 'Apparel Blanks',
    description: findField(row, 'description', 'desc') || '',
    color: findField(row, 'color') || 'Default',
    size: findField(row, 'size') || 'OS',
    sku,
    image_url: findField(row, 'image url', 'image_url', 'image') || '',
    blank_cost: blankCost,
    msrp: parseFloat(findField(row, 'msrp', 'price') || 0),
    inventory_qty: parseInt(findField(row, 'inventory', 'inventory_qty', 'qty', 'quantity') || 0),
    warehouse_location: findField(row, 'warehouse', 'warehouse_location') || '',
    weight: findField(row, 'weight') || '',
    case_quantity: parseInt(findField(row, 'case qty', 'case_quantity') || 0),
    item_status: 'active',
    catalog_status: 'vendor_catalog_only',
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
    const { file_content, file_name, start_row = 0, end_row = 250 } = body;

    if (!file_content || !file_name) {
      return Response.json({ error: 'Missing file_content or file_name' }, { status: 400 });
    }

    let rows = [];
    try {
      rows = parseCSV(file_content);
    } catch (err) {
      return Response.json({ error: `Parse error: ${err.message}` }, { status: 400 });
    }

    if (rows.length === 0) {
      return Response.json({ error: 'File contains no data rows' }, { status: 400 });
    }

    const chunkRows = rows.slice(start_row, end_row);
    const results = {
      success: true,
      file_name,
      chunk_start: start_row,
      chunk_end: Math.min(end_row, rows.length),
      total_rows_in_file: rows.length,
      chunk_rows_processed: 0,
      rows_before_import: 0,
      rows_after_import: 0,
      new_skus_added: 0,
      existing_skus_updated: 0,
      rows_skipped: 0,
      rows_deleted: 0,
      errors: [],
      error_log: [],
    };

    // Count BEFORE
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

    // Process chunk
    const toCreate = [];
    const toUpdate = [];

    for (const rawRow of chunkRows) {
      try {
        const normalized = normalizeSSRow(rawRow);

        if (!normalized.sku) {
          results.rows_skipped++;
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
        results.chunk_rows_processed++;
      } catch (err) {
        results.rows_skipped++;
        results.error_log.push(`Row ${rawRow.__row_number}: ${err.message}`);
      }
    }

    // Execute creates
    if (toCreate.length > 0) {
      try {
        await base44.asServiceRole.entities.SSCatalogItem.bulkCreate(toCreate);
      } catch (err) {
        results.success = false;
        results.error_log.push(`Bulk create failed: ${err.message}`);
        return Response.json(results, { status: 500 });
      }
    }

    // Execute updates
    if (toUpdate.length > 0) {
      try {
        for (const { id, data } of toUpdate) {
          await base44.asServiceRole.entities.SSCatalogItem.update(id, data);
        }
      } catch (err) {
        results.success = false;
        results.error_log.push(`Update failed: ${err.message}`);
        return Response.json(results, { status: 500 });
      }
    }

    // Count AFTER
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
    if (countAfter < countBefore) {
      results.success = false;
      results.error_log.push(`SAFETY: rows would reduce from ${countBefore} to ${countAfter}`);
      return Response.json(results, { status: 400 });
    }

    // Return progress with next chunk info
    results.rows_remaining = Math.max(0, results.total_rows_in_file - results.chunk_end);
    results.next_chunk_start = results.chunk_end;
    results.next_chunk_end = Math.min(results.chunk_end + 250, results.total_rows_in_file);

    return Response.json(results);

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});