import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const APPROVED_BRANDS_NORMALIZED = [
  'Gildan',
  'Bella + Canvas',
  'Comfort Colors',
  'Shaka Wear',
  'Next Level',
  'Jerzees',
  'Hanes',
  'Port & Company',
  'Sport-Tek',
  'Rabbit Skins',
  'Adidas'
];

const normalizeBrand = (brand) => {
  if (!brand) return '';
  const normalized = brand.trim().toLowerCase().replace(/\s+/g, ' ');
  const aliases = {
    'gildan': 'Gildan',
    'bella + canvas': 'Bella + Canvas',
    'bella and canvas': 'Bella + Canvas',
    'comfort colors': 'Comfort Colors',
    'shaka wear': 'Shaka Wear',
    'shakawear': 'Shaka Wear',
    'next level': 'Next Level',
    'jerzees': 'Jerzees',
    'hanes': 'Hanes',
    'port & company': 'Port & Company',
    'port and company': 'Port & Company',
    'sport-tek': 'Sport-Tek',
    'sport tek': 'Sport-Tek',
    'rabbit skins': 'Rabbit Skins',
    'rabbitskins': 'Rabbit Skins',
    'adidas': 'Adidas',
  };
  return aliases[normalized] || brand.trim();
};

const isApprovedBrand = (brand) => {
  const normalized = normalizeBrand(brand);
  return APPROVED_BRANDS_NORMALIZED.includes(normalized);
};

const parseImportData = (fileContent) => {
  try {
    const lines = fileContent.split('\n').filter(line => line.trim());
    const headers = lines[0].split('\t').map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'));
    
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split('\t');
      const row = {};
      headers.forEach((header, idx) => {
        row[header] = (values[idx] || '').trim();
      });
      if (Object.values(row).some(v => v)) rows.push(row);
    }
    return rows;
  } catch (err) {
    return [];
  }
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const {
      products_data,
      styles_data,
      categories_data,
      specs_data,
      days_in_transit_data,
      import_batch,
      import_batch_id,
      source_file_name
    } = body;

    const results = {
      rows_before_import: 0,
      rows_in_file: 0,
      new_skus_added: 0,
      existing_skus_updated: 0,
      rows_after_import: 0,
      rows_deleted: 0,
      errors: [],
      error_log: []
    };

    // Count rows BEFORE import (paginate to get true count)
    let countBefore = 0;
    let hasMore = true;
    let offset = 0;
    const beforeItemsForMap = {};
    while (hasMore) {
      const page = await base44.asServiceRole.entities.SSCatalogItem.filter({}, '-created_date', 500, offset);
      if (!page || page.length === 0) {
        hasMore = false;
      } else {
        countBefore += page.length;
        page.forEach(item => {
          const key = `${item.vendor || 'S&S Activewear'}|||${item.sku || ''}`;
          if (key && item.sku && !beforeItemsForMap[key]) beforeItemsForMap[key] = item;
        });
        if (page.length < 500) hasMore = false;
        offset += page.length;
      }
    }
    results.rows_before_import = countBefore;

    // Parse all files
    const productsRows = products_data ? parseImportData(products_data) : [];
    results.rows_in_file = productsRows.length;

    const stylesMap = {};
    const categoriesMap = {};
    const specsMap = {};
    const transitMap = {};

    if (styles_data) {
      const stylesRows = parseImportData(styles_data);
      stylesRows.forEach(row => {
        const key = `${row.brand || ''}${row.style_number || ''}`;
        if (key && !stylesMap[key]) stylesMap[key] = row;
      });
    }

    if (categories_data) {
      const catsRows = parseImportData(categories_data);
      catsRows.forEach(row => {
        const key = (row.style_number || '').trim();
        if (key && !categoriesMap[key]) categoriesMap[key] = row;
      });
    }

    if (specs_data) {
      const specsRows = parseImportData(specs_data);
      specsRows.forEach(row => {
        const key = (row.sku || '').trim();
        if (key && !specsMap[key]) specsMap[key] = row;
      });
    }

    if (days_in_transit_data) {
      const transitRows = parseImportData(days_in_transit_data);
      transitRows.forEach(row => {
        const key = (row.sku || '').trim();
        if (key && !transitMap[key]) transitMap[key] = row;
      });
    }

    // Use the beforeItemsForMap we already built during counting
    const existingByVendorSku = beforeItemsForMap;

    // Process products with upsert logic
    const itemsToUpsert = [];
    const skuDuplicateCheck = {};
    let approvedCount = 0;

    for (const product of productsRows) {
      const originalBrand = product.brand?.trim() || '';
      const normalizedBrand = normalizeBrand(originalBrand);
      const sku = product.sku?.trim() || '';

      // Skip unapproved brands
      if (!isApprovedBrand(originalBrand)) {
        results.error_log.push(`SKU ${sku}: Brand "${originalBrand}" not approved`);
        continue;
      }

      // Skip duplicate SKUs within this file
      if (skuDuplicateCheck[sku]) {
        results.error_log.push(`SKU ${sku}: Duplicate in file`);
        continue;
      }
      skuDuplicateCheck[sku] = true;
      approvedCount++;

      const styleNumber = product.style_number?.trim() || '';
      const color = product.color?.trim() || '';
      const size = product.size?.trim() || '';
      const groupKey = `${normalizedBrand}|||${styleNumber}`;
      
      const styleInfo = stylesMap[groupKey] || {};
      const specInfo = specsMap[sku] || {};
      const transitInfo = transitMap[sku] || {};
      const categoryInfo = categoriesMap[styleNumber] || {};

      let publicPrice = 0;
      const blankCost = parseFloat(product.blank_cost || 0);
      if (blankCost > 0) {
        publicPrice = blankCost + 2.00;
      }

      const itemData = {
        vendor: 'S&S Activewear',
        brand: normalizedBrand,
        style_number: styleNumber,
        product_name: product.product_name?.trim() || '',
        product_category: categoryInfo.category || product.product_category?.trim() || '',
        description: styleInfo.product_description || product.product_description?.trim() || '',
        color,
        size,
        sku,
        image_url: product.image_url?.trim() || '',
        blank_cost: blankCost,
        msrp: parseFloat(product.msrp || 0),
        inventory_qty: parseInt(product.inventory || 0) || 0,
        warehouse_location: product.warehouse_location?.trim() || '',
        weight: product.weight?.trim() || specInfo.weight?.trim() || '',
        case_quantity: parseInt(product.case_quantity || 0),
        item_status: parseInt(product.inventory || 0) > 0 ? 'active' : 'out_of_stock',
        catalog_status: 'vendor_catalog_only',
        import_batch: import_batch || new Date().toISOString().split('T')[0],
        import_batch_id: import_batch_id,
        source_file_name: source_file_name,
        public_price: publicPrice,
        measurements: specInfo.measurements?.trim() || '',
        fabric_details: specInfo.fabric_details?.trim() || '',
        fit: specInfo.fit?.trim() || '',
        material: specInfo.material?.trim() || '',
        care_notes: specInfo.care_notes?.trim() || '',
        days_in_transit: parseInt(transitInfo.days_in_transit || 0) || 0
      };

      // Check if exists by Vendor + SKU
      const vendorSKUKey = `S&S Activewear|||${sku}`;
      const existingItem = existingByVendorSku[vendorSKUKey];

      itemsToUpsert.push({ itemData, sku, existingItem });
    }

    // Execute upsert operations
    for (const { itemData, sku, existingItem } of itemsToUpsert) {
      try {
        if (existingItem) {
          await base44.asServiceRole.entities.SSCatalogItem.update(existingItem.id, itemData);
          results.existing_skus_updated++;
        } else {
          await base44.asServiceRole.entities.SSCatalogItem.create(itemData);
          results.new_skus_added++;
        }
      } catch (err) {
        results.errors.push(`SKU ${sku}: ${err.message}`);
        results.error_log.push(`SKU ${sku}: ${err.message}`);
      }
    }

    // Count rows AFTER import (paginate to get true count)
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

    // Safety check: ensure catalog did not shrink
    if (results.rows_after_import < results.rows_before_import) {
      results.error_log.push(`SAFETY GUARD TRIGGERED: Import would reduce rows from ${results.rows_before_import} to ${results.rows_after_import}`);
      return Response.json({
        success: false,
        error: 'Import blocked because it would reduce catalog rows.',
        details: `Before: ${results.rows_before_import} rows | After: ${results.rows_after_import} rows`,
        results
      }, { status: 400 });
    }

    // Create ImportBatch record
    try {
      const batchId = import_batch_id || `batch-${Date.now()}`;
      await base44.asServiceRole.entities.ImportBatch.create({
        batch_id: batchId,
        file_name: source_file_name || 'unknown.csv',
        uploaded_date: new Date().toISOString(),
        rows_in_file: results.rows_in_file,
        new_skus_added: results.new_skus_added,
        existing_skus_updated: results.existing_skus_updated,
        total_catalog_rows_after: results.rows_after_import,
        rows_deleted: 0,
        errors: results.errors,
        import_status: results.errors.length === 0 ? 'success' : 'partial'
      });
    } catch (err) {
      results.error_log.push(`Failed to create ImportBatch: ${err.message}`);
    }

    // Ensure SSPricingRules exist
    try {
      const existingRules = await base44.asServiceRole.entities.SSPricingRules.list('-created_date', 1);
      if (existingRules.length === 0) {
        await base44.asServiceRole.entities.SSPricingRules.create({
          flat_markup_amount: 2.00,
          rounding_mode: 'none',
          minimum_price: 0,
          category_overrides: [],
          brand_overrides: [],
          last_updated: new Date().toISOString()
        });
      }
    } catch (err) {
      // Silently skip
    }

    return Response.json({
      success: true,
      results,
      import_summary: {
        batch_timestamp: new Date().toISOString(),
        import_batch: import_batch || new Date().toISOString().split('T')[0]
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
