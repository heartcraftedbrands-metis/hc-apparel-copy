import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function withRetry(fn, maxRetries = 3, delayMs = 1500) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRateLimit = err.message && (
        err.message.toLowerCase().includes('rate limit') ||
        err.message.toLowerCase().includes('too many requests') ||
        err.status === 429
      );
      if (isRateLimit && attempt < maxRetries) {
        await sleep(delayMs * attempt); // back-off: 1.5s, 3s, 4.5s
        continue;
      }
      throw err;
    }
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { import_session_id, chunk_size = 25 } = body;

    if (!import_session_id) {
      return Response.json({ error: 'Missing import_session_id' }, { status: 400 });
    }

    // Get pending staging rows for this session
    const pendingRows = await withRetry(() =>
      base44.asServiceRole.entities.SSImportStaging.filter(
        { import_session_id, row_status: 'pending' },
        'row_number',
        chunk_size
      )
    );

    if (!pendingRows || pendingRows.length === 0) {
      return Response.json({
        success: true,
        import_session_id,
        chunk_size,
        rows_processed_this_chunk: 0,
        new_skus_added: 0,
        existing_skus_updated: 0,
        rows_skipped: 0,
        rows_deleted: 0,
        error_log: [],
        rate_limit_hits: 0,
      });
    }

    // Count BEFORE and build lookup map
    let countBefore = 0;
    let hasMore = true;
    let offset = 0;
    const existingByKey = {};
    while (hasMore) {
      const page = await withRetry(() =>
        base44.asServiceRole.entities.SSCatalogItem.filter({}, '-created_date', 500, offset)
      );
      if (!page || page.length === 0) {
        hasMore = false;
      } else {
        countBefore += page.length;
        page.forEach(item => {
          if (item.sku) {
            const key = `${item.vendor || 'S&S Activewear'}|||${item.sku}`;
            if (!existingByKey[key]) existingByKey[key] = item;
          }
        });
        if (page.length < 500) hasMore = false;
        else offset += page.length;
      }
    }

    // Process each row sequentially with delays
    let newSkus = 0;
    let updatedSkus = 0;
    let skipped = 0;
    let rateLimitHits = 0;
    const errors = [];

    for (const stagingRow of pendingRows) {
      // Small delay between every row to avoid rate limits
      await sleep(150);

      try {
        if (!stagingRow.sku) {
          await withRetry(() =>
            base44.asServiceRole.entities.SSImportStaging.update(stagingRow.id, {
              row_status: 'skipped',
              error_message: 'Missing SKU',
            })
          );
          skipped++;
          continue;
        }

        const key = `S&S Activewear|||${stagingRow.sku}`;
        const existing = existingByKey[key];

        const catalogData = {
          vendor: 'S&S Activewear',
          brand: stagingRow.brand,
          style_number: stagingRow.style_number,
          product_name: stagingRow.product_name,
          product_category: stagingRow.product_category,
          color: stagingRow.color,
          size: stagingRow.size,
          sku: stagingRow.sku,
          image_url: stagingRow.image_url,
          blank_cost: stagingRow.blank_cost || 0,
          inventory_qty: stagingRow.inventory_qty || 0,
          item_status: 'active',
          catalog_status: 'vendor_catalog_only',
        };

        if (existing) {
          // Update catalog row
          await withRetry(() =>
            base44.asServiceRole.entities.SSCatalogItem.update(existing.id, catalogData)
          );
          // Update staging row status
          await withRetry(() =>
            base44.asServiceRole.entities.SSImportStaging.update(stagingRow.id, {
              row_status: 'updated',
              error_message: '',
            })
          );
          updatedSkus++;
        } else {
          // Create new catalog row
          const created = await withRetry(() =>
            base44.asServiceRole.entities.SSCatalogItem.create(catalogData)
          );
          // Add to local map to prevent duplicates within same chunk
          existingByKey[key] = created;
          // Update staging row status
          await withRetry(() =>
            base44.asServiceRole.entities.SSImportStaging.update(stagingRow.id, {
              row_status: 'imported',
              error_message: '',
            })
          );
          newSkus++;
        }
      } catch (err) {
        const isRateLimit = err.message && (
          err.message.toLowerCase().includes('rate limit') ||
          err.message.toLowerCase().includes('too many requests')
        );
        if (isRateLimit) {
          rateLimitHits++;
          await sleep(2000); // extra pause on rate limit
        }
        // Mark staging row as error but continue processing remaining rows
        try {
          await base44.asServiceRole.entities.SSImportStaging.update(stagingRow.id, {
            row_status: 'error',
            error_message: err.message,
          });
        } catch (_) { /* ignore staging update failure */ }
        errors.push(`Row ${stagingRow.row_number} (SKU: ${stagingRow.sku || 'missing'}): ${err.message}`);
      }
    }

    // Count AFTER
    let countAfter = 0;
    hasMore = true;
    offset = 0;
    while (hasMore) {
      const page = await withRetry(() =>
        base44.asServiceRole.entities.SSCatalogItem.filter({}, '-created_date', 500, offset)
      );
      if (!page || page.length === 0) {
        hasMore = false;
      } else {
        countAfter += page.length;
        if (page.length < 500) hasMore = false;
        else offset += page.length;
      }
    }

    // Safety check — never allow catalog to shrink
    if (countAfter < countBefore) {
      errors.push(`SAFETY: rows reduced from ${countBefore} to ${countAfter}`);
      return Response.json({
        success: false,
        import_session_id,
        error: 'Safety check failed: catalog rows decreased',
        error_log: errors,
      }, { status: 400 });
    }

    // Get updated session stats
    const allStaging = await withRetry(() =>
      base44.asServiceRole.entities.SSImportStaging.filter({ import_session_id })
    );
    const sessionStats = { total: 0, pending: 0, imported: 0, updated: 0, skipped: 0, error: 0 };
    if (allStaging) {
      allStaging.forEach(row => {
        sessionStats.total++;
        if (sessionStats[row.row_status] !== undefined) sessionStats[row.row_status]++;
      });
    }

    return Response.json({
      success: true,
      import_session_id,
      chunk_size,
      rows_processed_this_chunk: pendingRows.length,
      new_skus_added: newSkus,
      existing_skus_updated: updatedSkus,
      rows_skipped: skipped,
      rows_deleted: 0,
      catalog_rows_before: countBefore,
      catalog_rows_after: countAfter,
      session_total_rows: sessionStats.total,
      session_pending_rows: sessionStats.pending,
      session_imported_rows: sessionStats.imported,
      session_updated_rows: sessionStats.updated,
      session_skipped_rows: sessionStats.skipped,
      session_error_rows: sessionStats.error,
      error_log: errors,
      rate_limit_hits: rateLimitHits,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});