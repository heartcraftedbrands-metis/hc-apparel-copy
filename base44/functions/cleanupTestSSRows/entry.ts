import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Unauthorized' }, { status: 403 });

    // Find all TEST rows
    const allTestRows = [];
    let skip = 0;
    let hasMore = true;

    while (hasMore) {
      const batch = await base44.asServiceRole.entities.SSCatalogItem.list(undefined, 500, skip);
      if (!batch || batch.length === 0) break;
      
      const testRows = batch.filter(row => 
        row.sku?.startsWith('TEST-') || row.style_number?.startsWith('TEST-')
      );
      allTestRows.push(...testRows);
      
      skip += batch.length;
      hasMore = batch.length === 500;
    }

    // Delete only test rows
    const deletedIds = [];
    for (const row of allTestRows) {
      await base44.asServiceRole.entities.SSCatalogItem.delete(row.id);
      deletedIds.push(row.id);
    }

    // Verify real catalog count
    const realRows = [];
    skip = 0;
    hasMore = true;
    while (hasMore) {
      const batch = await base44.asServiceRole.entities.SSCatalogItem.list(undefined, 500, skip);
      if (!batch || batch.length === 0) break;
      realRows.push(...batch);
      skip += batch.length;
      hasMore = batch.length === 500;
    }

    return Response.json({
      success: true,
      test_rows_found: allTestRows.length,
      test_rows_deleted: deletedIds.length,
      test_rows: allTestRows.map(r => ({ id: r.id, sku: r.sku, style_number: r.style_number })),
      real_catalog_rows_remaining: realRows.length,
      deleted_real_products: 0,
      message: `✓ Cleaned ${deletedIds.length} test rows. ${realRows.length} real catalog rows remain.`
    });
  } catch (error) {
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});