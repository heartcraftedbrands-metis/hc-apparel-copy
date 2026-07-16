import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Count before
    let countBefore = 0;
    let hasMore = true;
    let offset = 0;
    while (hasMore) {
      const page = await base44.asServiceRole.entities.SSCatalogItem.filter({}, '-created_date', 500, offset);
      if (!page || page.length === 0) {
        hasMore = false;
      } else {
        countBefore += page.length;
        if (page.length < 500) hasMore = false;
        offset += page.length;
      }
    }

    // Create 2 test rows with unique SKUs
    const uniqueId = Date.now();
    const testBatch = new Date().toISOString();
    
    const testRows = [
      {
        vendor: 'S&S Activewear',
        brand: 'Gildan',
        style_number: 'TEST-001',
        product_name: '[TEST] Gildan Test Item 001',
        product_category: 'T-Shirts',
        color: 'White',
        size: 'M',
        sku: `TEST-APPEND-${uniqueId}-001`,
        blank_cost: 5.00,
        msrp: 10.00,
        inventory_qty: 100,
        warehouse_location: 'TEST',
        item_status: 'active',
        catalog_status: 'vendor_catalog_only',
        import_batch: testBatch,
        source_file_name: 'test-append.csv'
      },
      {
        vendor: 'S&S Activewear',
        brand: 'Bella + Canvas',
        style_number: 'TEST-002',
        product_name: '[TEST] Bella Canvas Test Item 002',
        product_category: 'T-Shirts',
        color: 'Black',
        size: 'L',
        sku: `TEST-APPEND-${uniqueId}-002`,
        blank_cost: 6.00,
        msrp: 12.00,
        inventory_qty: 50,
        warehouse_location: 'TEST',
        item_status: 'active',
        catalog_status: 'vendor_catalog_only',
        import_batch: testBatch,
        source_file_name: 'test-append.csv'
      }
    ];

    // Create rows directly
    const createdIds = [];
    for (const row of testRows) {
      const item = await base44.asServiceRole.entities.SSCatalogItem.create(row);
      createdIds.push(item.id);
    }

    // Count after
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

    const testPassed = (countAfter - countBefore) === 2 && createdIds.length === 2;

    return Response.json({
      success: true,
      test_result: testPassed ? 'PASS' : 'FAIL',
      rows_before: countBefore,
      rows_added: 2,
      rows_after: countAfter,
      expected_rows_after: countBefore + 2,
      test_item_ids: createdIds,
      message: testPassed
        ? `✓ Test PASSED. Catalog grew from ${countBefore} to ${countAfter} rows (+2).`
        : `✗ Test FAILED. Expected ${countBefore + 2} rows but got ${countAfter}.`
    });
  } catch (error) {
    return Response.json({ 
      success: false,
      error: error.message,
      test_result: 'FAIL'
    }, { status: 500 });
  }
});