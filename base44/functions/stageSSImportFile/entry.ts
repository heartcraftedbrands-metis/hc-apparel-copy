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
    sku,
    brand,
    style_number: style,
    product_name: productName,
    product_category: findField(row, 'category', 'product_category') || 'Apparel Blanks',
    color: findField(row, 'color') || 'Default',
    size: findField(row, 'size') || 'OS',
    blank_cost: blankCost,
    inventory_qty: parseInt(findField(row, 'inventory', 'inventory_qty', 'qty', 'quantity') || 0),
    image_url: findField(row, 'image url', 'image_url', 'image') || '',
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
    const { file_content, file_name } = body;

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

    // Create import session ID
    const importSessionId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    // Stage all rows
    const stagingRows = [];
    for (const rawRow of rows) {
      try {
        const normalized = normalizeSSRow(rawRow);
        
        stagingRows.push({
          import_session_id: importSessionId,
          file_name,
          total_staged_rows: rows.length,
          row_number: rawRow.__row_number,
          raw_row_data: JSON.stringify(rawRow),
          sku: normalized.sku,
          brand: normalized.brand,
          style_number: normalized.style_number,
          product_name: normalized.product_name,
          product_category: normalized.product_category,
          color: normalized.color,
          size: normalized.size,
          blank_cost: normalized.blank_cost,
          inventory_qty: normalized.inventory_qty,
          image_url: normalized.image_url,
          row_status: 'pending',
          error_message: '',
        });
      } catch (err) {
        stagingRows.push({
          import_session_id: importSessionId,
          file_name,
          total_staged_rows: rows.length,
          row_number: rawRow.__row_number,
          raw_row_data: JSON.stringify(rawRow),
          sku: '',
          brand: '',
          style_number: '',
          product_name: '',
          row_status: 'error',
          error_message: `Parse error: ${err.message}`,
        });
      }
    }

    // Bulk create staging rows
    if (stagingRows.length > 0) {
      try {
        await base44.asServiceRole.entities.SSImportStaging.bulkCreate(stagingRows);
      } catch (err) {
        return Response.json({ 
          error: `Failed to stage rows: ${err.message}` 
        }, { status: 500 });
      }
    }

    return Response.json({
      success: true,
      import_session_id: importSessionId,
      file_name,
      total_staged_rows: rows.length,
      pending_rows: rows.length,
      imported_rows: 0,
      updated_rows: 0,
      skipped_rows: 0,
      error_rows: stagingRows.filter(r => r.row_status === 'error').length,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});