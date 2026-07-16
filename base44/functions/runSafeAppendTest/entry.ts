import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Unauthorized' }, { status: 403 });

    // Step 1: Count catalog rows before test (list all in one call if possible)
    const countRows = async () => {
      let total = 0;
      let skip = 0;
      let hasMore = true;
      const batchSize = 1000; // larger batches to reduce API calls
      while (hasMore) {
        const batch = await base44.asServiceRole.entities.SSCatalogItem.list(undefined, batchSize, skip);
        if (!batch || batch.length === 0) break;
        total += batch.length;
        skip += batch.length;
        hasMore = batch.length === batchSize;
      }
      return total;
    };

    const rowsBefore = await countRows();

    // Step 2: Create 2 unique test rows with timestamp
    const timestamp = Date.now();
    const testSku1 = `TEST-APPEND-${timestamp}-001`;
    const testSku2 = `TEST-APPEND-${timestamp}-002`;

    const row1 = await base44.asServiceRole.entities.SSCatalogItem.create({
      product_name: `Test Product 1 - ${timestamp}`,
      sku: testSku1,
      style_number: testSku1,
      brand: 'TestBrand',
      vendor: 'S&S Activewear',
      catalog_status: 'vendor_catalog_only',
      item_status: 'active',
      blank_cost: 5.00,
      import_batch: `test-append-${timestamp}`
    });

    const row2 = await base44.asServiceRole.entities.SSCatalogItem.create({
      product_name: `Test Product 2 - ${timestamp}`,
      sku: testSku2,
      style_number: testSku2,
      brand: 'TestBrand',
      vendor: 'S&S Activewear',
      catalog_status: 'vendor_catalog_only',
      item_status: 'active',
      blank_cost: 5.00,
      import_batch: `test-append-${timestamp}`
    });

    // Step 3: Count rows after adding
    const rowsAfterAdd = await countRows();

    // Step 4: Verify rows were added
    const rowsAdded = rowsAfterAdd - rowsBefore;
    if (rowsAdded !== 2) {
      return Response.json({
        success: false,
        test_result: 'FAIL',
        rows_before: rowsBefore,
        rows_after_add: rowsAfterAdd,
        rows_added: rowsAdded,
        expected_rows_added: 2,
        diagnostic: `Expected +2 rows but got +${rowsAdded}. The append operation may be updating instead of creating new rows.`,
        message: `✗ Test FAILED. Expected 2 new rows but only got ${rowsAdded}.`
      });
    }

    // Step 5: Delete the test rows
    await base44.asServiceRole.entities.SSCatalogItem.delete(row1.id);
    await base44.asServiceRole.entities.SSCatalogItem.delete(row2.id);

    // Step 6: Count rows after cleanup
    const rowsAfterCleanup = await countRows();

    // Step 7: Verify cleanup worked
    const cleanupDiff = rowsAfterCleanup - rowsBefore;
    if (cleanupDiff !== 0) {
      return Response.json({
        success: false,
        test_result: 'FAIL',
        rows_before: rowsBefore,
        rows_after_add: rowsAfterAdd,
        rows_after_cleanup: rowsAfterCleanup,
        rows_added: rowsAdded,
        cleanup_remaining: cleanupDiff,
        diagnostic: `Test rows were not fully cleaned. ${cleanupDiff} rows remain from the test.`,
        message: `✗ Test FAILED. Cleanup did not remove all test rows.`
      });
    }

    // Success
    return Response.json({
      success: true,
      test_result: 'PASS',
      rows_before: rowsBefore,
      rows_after_add: rowsAfterAdd,
      rows_after_cleanup: rowsAfterCleanup,
      rows_added: rowsAdded,
      cleanup_remaining: 0,
      test_items: [testSku1, testSku2],
      message: `✓ Safe Append Test PASSED. Catalog stable: ${rowsBefore} → +2 → cleanup → ${rowsAfterCleanup}.`
    });
  } catch (error) {
    return Response.json({
      success: false,
      test_result: 'ERROR',
      diagnostic: error.message,
      message: `✗ Test ERROR: ${error.message}`
    }, { status: 500 });
  }
});