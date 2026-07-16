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
        await sleep(delayMs * attempt);
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
    const { import_session_id, chunk_size = 10 } = body;

    if (!import_session_id) {
      return Response.json({ error: 'Missing import_session_id' }, { status: 400 });
    }

    // Find error rows for this session that mention rate limit
    const errorRows = await withRetry(() =>
      base44.asServiceRole.entities.SSImportStaging.filter(
        { import_session_id, row_status: 'error' },
        'row_number',
        500
      )
    );

    const rateLimitRows = (errorRows || []).filter(r =>
      r.error_message && r.error_message.toLowerCase().includes('rate limit')
    );

    if (rateLimitRows.length === 0) {
      return Response.json({
        success: true,
        import_session_id,
        rate_limited_rows_found: 0,
        rows_retried: 0,
        rows_recovered: 0,
        rows_still_failed: 0,
        message: 'No rate-limited rows found',
      });
    }

    // Reset rate-limited rows to pending
    for (const row of rateLimitRows) {
      await sleep(150);
      await withRetry(() =>
        base44.asServiceRole.entities.SSImportStaging.update(row.id, {
          row_status: 'pending',
          error_message: '',
        })
      );
    }

    // Build catalog lookup
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

    // Process in chunks of chunk_size with extra delays
    let recovered = 0;
    let stillFailed = 0;
    const errors = [];
    let rateLimitHits = 0;

    const toProcess = rateLimitRows.slice(0, chunk_size);

    for (const stagingRow of toProcess) {
      await sleep(250); // longer delay for retry

      try {
        if (!stagingRow.sku) {
          await withRetry(() =>
            base44.asServiceRole.entities.SSImportStaging.update(stagingRow.id, {
              row_status: 'skipped',
              error_message: 'Missing SKU',
            })
          );
          recovered++;
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
          await withRetry(() =>
            base44.asServiceRole.entities.SSCatalogItem.update(existing.id, catalogData)
          );
          await withRetry(() =>
            base44.asServiceRole.entities.SSImportStaging.update(stagingRow.id, {
              row_status: 'updated',
              error_message: '',
            })
          );
        } else {
          const created = await withRetry(() =>
            base44.asServiceRole.entities.SSCatalogItem.create(catalogData)
          );
          existingByKey[key] = created;
          await withRetry(() =>
            base44.asServiceRole.entities.SSImportStaging.update(stagingRow.id, {
              row_status: 'imported',
              error_message: '',
            })
          );
        }
        recovered++;
      } catch (err) {
        const isRateLimit = err.message && (
          err.message.toLowerCase().includes('rate limit') ||
          err.message.toLowerCase().includes('too many requests')
        );
        if (isRateLimit) {
          rateLimitHits++;
          await sleep(3000);
        }
        try {
          await base44.asServiceRole.entities.SSImportStaging.update(stagingRow.id, {
            row_status: 'error',
            error_message: err.message,
          });
        } catch (_) { /* ignore */ }
        stillFailed++;
        errors.push(`Row ${stagingRow.row_number} (SKU: ${stagingRow.sku || 'missing'}): ${err.message}`);
      }
    }

    // Get session stats
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
      rate_limited_rows_found: rateLimitRows.length,
      rows_retried: toProcess.length,
      rows_recovered: recovered,
      rows_still_failed: stillFailed,
      rate_limit_hits: rateLimitHits,
      remaining_rate_limited: rateLimitRows.length - chunk_size > 0 ? rateLimitRows.length - chunk_size : 0,
      error_log: errors,
      session_total_rows: sessionStats.total,
      session_pending_rows: sessionStats.pending,
      session_imported_rows: sessionStats.imported,
      session_updated_rows: sessionStats.updated,
      session_skipped_rows: sessionStats.skipped,
      session_error_rows: sessionStats.error,
      rows_deleted: 0,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});