import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const batchOffset = body.batchOffset || 0;
    const batchSize = body.batchSize || 25;
    const processAllRemaining = body.processAllRemaining || false;

    const APPROVED_BRANDS = [
      'Bella + Canvas',
      'Gildan',
      'Comfort Colors',
      'Next Level',
      'Independent Trading Co.',
      'Champion',
      'Hanes',
      'Rabbit Skins',
      'Shaka Wear',
      'Lane Seven',
      'adidas'
    ];

    const report = {
      timestamp: new Date().toISOString(),
      batch_offset: batchOffset,
      batch_size: batchSize,
      total_approved_groups: 0,
      groups_processed_this_batch: 0,
      draft_products_created: 0,
      existing_products_updated: 0,
      products_hidden_out_of_stock: 0,
      products_deleted: 0,
      errors: [],
      created_products: [],
      remaining_groups_after_batch: 0
    };

    // Fetch all S&S catalog items
    const allCatalogItems = await base44.asServiceRole.entities.SSCatalogItem.list('-created_date', 10000);

    if (!allCatalogItems || allCatalogItems.length === 0) {
      return Response.json({ 
        success: false, 
        error: 'No S&S catalog rows found', 
        report 
      });
    }

    // Fetch existing products to detect duplicates
    const existingProducts = await base44.asServiceRole.entities.Product.list('', 10000);
    
    // Build maps for deduplication
    const existingBySupplierSku = {};
    const existingByGroupKey = {};
    
    for (const product of existingProducts) {
      if (product.supplier_sku) {
        existingBySupplierSku[product.supplier_sku] = product;
      }
      // Also map by group key for draft detection
      if (product.vendor_source === 'S&S Activewear') {
        const match = product.name?.match(/^(.+?)\s+([\d-]+)$/);
        if (match) {
          const groupKey = `${match[1]}|||${match[2]}`;
          existingByGroupKey[groupKey] = product;
        }
      }
    }

    // Group by Brand + Style Number (only approved brands)
    const groupedByBrandStyle = {};
    for (const item of allCatalogItems) {
      const brand = item.brand || '';
      const styleNumber = item.style_number || '';

      // Only process approved brands
      if (!APPROVED_BRANDS.includes(brand)) {
        continue;
      }

      // Skip empty style numbers
      if (!styleNumber) {
        continue;
      }

      const groupKey = `${brand}|||${styleNumber}`;
      if (!groupedByBrandStyle[groupKey]) {
        groupedByBrandStyle[groupKey] = {
          brand,
          style_number: styleNumber,
          product_name: item.product_name || `${brand} ${styleNumber}`,
          category: item.product_category || 'apparel_blanks',
          description: item.description || '',
          variants: []
        };
      }

      groupedByBrandStyle[groupKey].variants.push({
        sku: item.sku || '',
        color: item.color || '',
        size: item.size || '',
        blank_cost: item.blank_cost || 0,
        inventory_qty: item.inventory_qty || 0,
        image_url: item.image_url || '',
        material: item.material || '',
        measurements: item.measurements || '',
        care_notes: item.care_notes || '',
        days_in_transit: item.days_in_transit || 0
      });
    }

    const allGroupKeys = Object.keys(groupedByBrandStyle);
    report.total_approved_groups = allGroupKeys.length;

    if (allGroupKeys.length === 0) {
      return Response.json({ 
        success: false, 
        error: 'No approved product groups found', 
        report 
      });
    }

    // Filter to only groups without existing draft products
    const groupsWithoutProducts = allGroupKeys.filter(key => !existingByGroupKey[key]);
    report.groups_without_products = groupsWithoutProducts.length;

    if (groupsWithoutProducts.length === 0) {
      return Response.json({ 
        success: true, 
        message: 'All approved product groups already have draft products', 
        report 
      });
    }

    // Determine how many batches to process
    let groupsToProcess = groupsWithoutProducts;
    if (processAllRemaining) {
      // Process all remaining groups in one request (in logical batches)
      groupsToProcess = groupsWithoutProducts;
      report.processing_all_remaining = true;
    } else {
      // Just process the next batch
      groupsToProcess = groupsWithoutProducts.slice(batchOffset, batchOffset + batchSize);
    }

    report.groups_processed_this_batch = groupsToProcess.length;
    report.remaining_groups_after_batch = Math.max(0, groupsWithoutProducts.length - (batchOffset + batchSize));

    // Process each group in this batch
    for (const groupKey of groupsToProcess) {
      const group = groupedByBrandStyle[groupKey];

      try {
        // Validate group data
        if (!group || !group.brand || !group.style_number) {
          report.errors.push({
            group: groupKey || 'Unknown',
            error: 'Missing brand or style number',
            error_type: 'ValidationError'
          });
          continue;
        }

        const productKey = `${group.brand}|||${group.style_number}`;
        const isOutOfStock = group.variants.every(v => (v.inventory_qty || 0) === 0);

        // Check for existing product with same group key
        let existingProduct = existingByGroupKey[groupKey];
        if (existingProduct) {
          // Update existing draft
          const prices = group.variants
            .map(v => (v.blank_cost || 0) + 2.0)
            .filter(p => p > 0)
            .sort((a, b) => a - b);

          const minPrice = prices[0] || 0;

          const variants = group.variants.map(v => ({
            sku: v.sku || '',
            color: v.color || '',
            size: v.size || '',
            blank_cost: v.blank_cost || 0,
            public_price: (v.blank_cost || 0) + 2.0,
            inventory: v.inventory_qty || 0
          }));

          await base44.asServiceRole.entities.Product.update(existingProduct.id, {
            price: minPrice,
            available_colors: [...new Set(group.variants.map(v => v.color).filter(Boolean))].map(c => ({ name: c, hex: '' })),
            available_sizes: [...new Set(group.variants.map(v => v.size).filter(Boolean))],
            stock: group.variants.reduce((sum, v) => sum + (v.inventory_qty || 0), 0),
            internal_notes: `S&S Activewear Updated | Variants: ${JSON.stringify(variants)}`
          });

          report.existing_products_updated++;
          continue;
        }

        // Calculate price range
        const prices = group.variants
          .map(v => (v.blank_cost || 0) + 2.0)
          .filter(p => p > 0)
          .sort((a, b) => a - b);

        const minPrice = prices[0] || 0;
        const maxPrice = prices[prices.length - 1] || minPrice;

        // Build variants structure
        const variants = group.variants.map(v => ({
          sku: v.sku || '',
          color: v.color || '',
          size: v.size || '',
          blank_cost: v.blank_cost || 0,
          public_price: (v.blank_cost || 0) + 2.0,
          inventory: v.inventory_qty || 0
        }));

        // Determine visibility based on stock
        const visibility = isOutOfStock ? 'hidden' : 'draft';

        // Create draft product
        const productData = {
          name: `${group.brand} ${group.style_number}`,
          description: group.description || group.product_name || '',
          price: minPrice,
          product_type: 'physical',
          product_subtype: 'apparel_blanks',
          visibility: visibility,
          category: 'apparel_blanks',
          available_sizes: [...new Set(group.variants.map(v => v.size).filter(Boolean))],
          available_colors: [...new Set(group.variants.map(v => v.color).filter(Boolean))].map(c => ({ name: c, hex: '' })),
          supplier_sku: productKey,
          is_active: true,
          vendor_source: 'S&S Activewear',
          stock: group.variants.reduce((sum, v) => sum + (v.inventory_qty || 0), 0),
          internal_notes: `S&S Activewear | ${group.brand} ${group.style_number} | ${group.variants.length} variants | Range: $${minPrice.toFixed(2)}${maxPrice > minPrice ? ` - $${maxPrice.toFixed(2)}` : ''} | Variants: ${JSON.stringify(variants)}`
        };

        const product = await base44.asServiceRole.entities.Product.create(productData);

        report.draft_products_created++;
        if (isOutOfStock) {
          report.products_hidden_out_of_stock++;
        }

        report.created_products.push({
          id: product.id,
          name: product.name,
          brand: group.brand,
          status: visibility,
          variants_count: group.variants.length,
          price_range: minPrice === maxPrice ? `$${minPrice.toFixed(2)}` : `$${minPrice.toFixed(2)} - $${maxPrice.toFixed(2)}`
        });
      } catch (err) {
        const errorDetail = {
          group: `${group.brand} ${group.style_number}`,
          error: err.message,
          error_type: err.name || 'Unknown'
        };
        if (err.stack) {
          errorDetail.stack = err.stack.split('\n').slice(0, 2).join(' | ');
        }
        report.errors.push(errorDetail);
      }
    }

    return Response.json({ 
      success: report.draft_products_created > 0 || report.existing_products_updated > 0, 
      report 
    });
  } catch (error) {
    return Response.json({ 
      success: false,
      error: error.message,
      error_type: error.name || 'Unknown',
      stack: error.stack ? error.stack.split('\n').slice(0, 3).join(' | ') : null
    }, { status: 500 });
  }
});