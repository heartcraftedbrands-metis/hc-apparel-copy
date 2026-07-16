import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Count catalog rows BEFORE test (paginate to get true count)
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

    // Create 2 unique test SKUs with special marker
    const testBatch = new Date().toISOString();
    const uniqueId = Date.now();
    const testRows = [
      {
        vendor: 'S&S Activewear',
        brand: 'Gildan',
        style_number: 'TEST-APPEND-001',
        product_name: '[TEST APPEND] Gildan Test Item 001',
        sku: `TEST-APPEND-${uniqueId}-001`,
        color: 'White',
        size: 'M',
        blank_cost: 5.00,
        msrp: 10.00,
        inventory_qty: 100,
        catalog_status: 'hidden',
        import_batch: testBatch,
        source_file_name: 'test-append.csv'
      },
      {
        vendor: 'S&S Activewear',
        brand: 'Bella + Canvas',
        style_number: 'TEST-APPEND-002',
        product_name: '[TEST APPEND] Bella Canvas Test Item 002',
        sku: `TEST-APPEND-${uniqueId}-002`,
        color: 'Black',
        size: 'L',
        blank_cost: 6.00,
        msrp: 12.00,
        inventory_qty: 50,
        catalog_status: 'hidden',
        import_batch: testBatch,
        source_file_name: 'test-append.csv'
      }
    ];

    // Create test rows
    const createdIds = [];
    for (const row of testRows) {
      const item = await base44.asServiceRole.entities.SSCatalogItem.create(row);
      createdIds.push(item.id);
    }

    // Count catalog rows AFTER test (paginate to get true count)
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

    // Verify the expected result
    const expectedAfter = countBefore + 2;
    const testPassed = countAfter === expectedAfter && createdIds.length === 2;

    return Response.json({
      success: true,
      test_result: testPassed ? 'PASS' : 'FAIL',
      rows_before: countBefore,
      rows_added: 2,
      rows_after: countAfter,
      expected_rows_after: expectedAfter,
      test_item_ids: createdIds,
      message: testPassed
        ? `✓ Test PASSED. Catalog grew from ${countBefore} to ${countAfter} rows (+2).`
        : `✗ Test FAILED. Expected ${expectedAfter} rows but got ${countAfter}.`
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});