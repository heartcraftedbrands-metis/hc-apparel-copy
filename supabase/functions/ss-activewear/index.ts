import { createClient } from 'npm:@supabase/supabase-js@2';

const allowedOrigins = new Set([
  'http://127.0.0.1:4174',
  'http://localhost:4174',
  'https://ilovehcapparel.net',
  'https://www.ilovehcapparel.net',
]);

const approvedBrands = [
  'Gildan',
  'Bella + Canvas',
  'Comfort Colors',
  'Shaka Wear',
  'Next Level',
  'Jerzees',
  'Hanes',
  'Rabbit Skins',
  'adidas',
  'Oakley',
  'Champion',
  'Lane Seven',
  'American Apparel',
  'Tultex',
];

const normalizeBrand = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const canonicalBrands = new Map(approvedBrands.map((brand) => [normalizeBrand(brand), brand]));
const productFields = [
  'SkuID',
  'Sku',
  'Gtin',
  'YourSku',
  'StyleID',
  'BrandName',
  'StyleName',
  'ColorName',
  'ColorCode',
  'ColorPriceCodeName',
  'ColorGroup',
  'ColorGroupName',
  'ColorFamilyID',
  'ColorFamily',
  'ColorSwatchImage',
  'ColorSwatchTextColor',
  'ColorFrontImage',
  'ColorSideImage',
  'ColorBackImage',
  'ColorDirectSideImage',
  'ColorOnModelFrontImage',
  'ColorOnModelSideImage',
  'ColorOnModelBackImage',
  'Color1',
  'Color2',
  'SizeName',
  'SizeCode',
  'SizeOrder',
  'SizePriceCodeName',
  'CaseQty',
  'UnitWeight',
  'MapPrice',
  'RetailPrice',
  'PiecePrice',
  'DozenPrice',
  'CasePrice',
  'SalePrice',
  'CustomerPrice',
  'SaleExpiration',
  'NoeRetailing',
  'PolyPackQty',
  'Qty',
  'CountryOfOrigin',
  'Warehouses',
].join(',');

const canonicalApprovedBrand = (value: unknown) =>
  canonicalBrands.get(normalizeBrand(String(value || '')));

const textValue = (value: unknown) => {
  const text = String(value ?? '').trim();
  return text || null;
};

const numberValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const integerValue = (value: unknown) => {
  const parsed = numberValue(value);
  return parsed === null ? null : Math.trunc(parsed);
};

const imageUrl = (value: unknown) => {
  const path = textValue(value);
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `https://www.ssactivewear.com/${path.replace(/^\/+/, '')}`;
};

function collectApprovedStyles(result: unknown) {
  const counts = Object.fromEntries(approvedBrands.map((brand) => [brand, 0]));
  const samples: Array<Record<string, unknown>> = [];
  const styles: Array<Record<string, unknown> & { canonicalBrand: string }> = [];

  for (const style of Array.isArray(result) ? result : []) {
    const canonicalBrand = canonicalApprovedBrand(style.brandName);
    if (!canonicalBrand) continue;
    counts[canonicalBrand] += 1;
    styles.push({ ...style, canonicalBrand });
    if (samples.length < 12) {
      samples.push({
        brand: canonicalBrand,
        style_id: style.styleID,
        part_number: style.partNumber,
        style_name: style.styleName,
        title: style.title,
        category: style.baseCategory,
        image_url: imageUrl(style.styleImage),
      });
    }
  }

  return { counts, samples, styles };
}

function corsHeaders(request: Request) {
  const origin = request.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : 'https://ilovehcapparel.net',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function json(request: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(request) });
  }
  if (request.method !== 'POST') {
    return json(request, { error: 'Method not allowed' }, 405);
  }

  const authorization = request.headers.get('authorization');
  if (!authorization?.toLowerCase().startsWith('bearer ')) {
    return json(request, { error: 'Authentication required' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  let publishableKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!publishableKey) {
    try {
      const publishableKeys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}');
      publishableKey = publishableKeys.default;
    } catch {
      publishableKey = undefined;
    }
  }
  if (!supabaseUrl || !publishableKey) {
    console.error('Missing required Supabase function environment variables');
    return json(request, { error: 'Server configuration error' }, 500);
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
  const jwt = authorization.replace(/^Bearer\s+/i, '');
  const { data: authData, error: authError } = await userClient.auth.getUser(jwt);
  if (authError || !authData.user) {
    return json(request, { error: 'Invalid or expired session' }, 401);
  }

  const { data: isAdmin, error: roleError } = await userClient.rpc('is_admin');
  if (roleError) {
    console.error('Admin role check failed', roleError.message);
    return json(request, { error: 'Unable to verify administrator access' }, 500);
  }
  if (!isAdmin) {
    return json(request, { error: 'Administrator access required' }, 403);
  }

  let payload: { action?: string; brand?: string; draft_id?: string };
  try {
    payload = await request.json();
  } catch {
    return json(request, { error: 'Invalid request body' }, 400);
  }
  if (![
    'test_connection',
    'preview_catalog',
    'stage_styles',
    'sync_brand_products',
    'validate_vendor_order_draft',
  ].includes(payload.action || '')) {
    return json(request, { error: 'Unsupported action' }, 400);
  }

  const accountNumber = Deno.env.get('SS_ACCOUNT_NUMBER');
  const apiKey = Deno.env.get('SS_API_KEY');

  if (payload.action === 'validate_vendor_order_draft') {
    if (!payload.draft_id) {
      return json(request, { error: 'Vendor order draft ID is required' }, 400);
    }

    const { data: validation, error: validationError } = await userClient.rpc(
      'get_ss_vendor_order_draft_validation',
      { p_draft_id: payload.draft_id },
    );
    if (validationError || !validation) {
      console.error('Vendor order payload validation failed', validationError?.message);
      return json(request, { error: 'Unable to validate the vendor order draft' }, 500);
    }

    let apiConnected = false;
    let connectionMessage = 'S&S API not connected';
    let rateLimitRemaining: string | null = null;

    if (accountNumber && apiKey) {
      try {
        const response = await fetch('https://api.ssactivewear.com/v2/brands/?mediatype=json', {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${btoa(`${accountNumber}:${apiKey}`)}`,
            'Accept': 'application/json',
          },
          signal: AbortSignal.timeout(15000),
        });
        apiConnected = response.ok;
        rateLimitRemaining = response.headers.get('x-rate-limit-remaining');
        connectionMessage = response.ok
          ? 'S&S API connected (read-only test)'
          : 'S&S API not connected';
      } catch (error) {
        console.error('Read-only S&S vendor order connection test failed', error);
      }
    }

    const result = {
      ...validation,
      api_connected: apiConnected,
      connection_message: connectionMessage,
      test_mode: true,
      submitted: false,
      live_submission_enabled: false,
      safety_message: 'Do Not Submit Live Order Yet',
      rate_limit_remaining: rateLimitRemaining,
      checked_at: new Date().toISOString(),
    };
    const { error: recordError } = await userClient.rpc(
      'record_ss_vendor_order_test_result',
      { p_draft_id: payload.draft_id, p_result: result },
    );
    if (recordError) {
      console.error('Unable to record vendor order test result', recordError.message);
      return json(request, { error: 'Validation ran, but its audit result could not be saved' }, 500);
    }

    return json(request, result);
  }

  if (!accountNumber || !apiKey) {
    return json(request, { error: 'S&S credentials are not configured' }, 503);
  }

  if (payload.action === 'sync_brand_products') {
    const brand = canonicalApprovedBrand(payload.brand);
    if (!brand) {
      return json(request, { error: 'Select an approved S&S brand' }, 400);
    }

    const { data: latest, error: latestError } = await userClient
      .from('ss_import_staging')
      .select('import_session_id')
      .eq('row_status', 'pending')
      .order('created_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) {
      console.error('Unable to locate the current style staging session', latestError.message);
      return json(request, { error: 'Unable to locate the current style staging session' }, 500);
    }
    if (!latest) {
      return json(request, { error: 'Stage the approved styles before syncing SKU details' }, 409);
    }

    const { data: stagedStyles, error: stylesError } = await userClient
      .from('ss_import_staging')
      .select('raw_row_data,style_number')
      .eq('import_session_id', latest.import_session_id)
      .eq('brand', brand)
      .eq('row_status', 'pending');
    if (stylesError) {
      console.error('Unable to read staged S&S styles', stylesError.message);
      return json(request, { error: 'Unable to read the staged styles for this brand' }, 500);
    }

    const stylesById = new Map<number, { partNumber: string | null; styleName: string | null }>();
    for (const stagedStyle of stagedStyles || []) {
      try {
        const raw = JSON.parse(stagedStyle.raw_row_data || '{}');
        const styleId = integerValue(raw.styleID);
        if (styleId === null) continue;
        stylesById.set(styleId, {
          partNumber: textValue(raw.partNumber) || textValue(stagedStyle.style_number),
          styleName: textValue(raw.styleName),
        });
      } catch {
        // Invalid legacy staging data is skipped and reported in the run totals.
      }
    }
    const styleIds = [...stylesById.keys()];
    if (styleIds.length === 0) {
      return json(request, { error: `No valid staged style IDs were found for ${brand}` }, 409);
    }

    const runStartedAt = new Date().toISOString();
    const { data: syncRun, error: runError } = await userClient
      .from('ss_sku_sync_runs')
      .upsert({
        style_session_id: latest.import_session_id,
        brand,
        status: 'running',
        started_at: runStartedAt,
        completed_at: null,
        owner_user_id: authData.user.id,
        created_by_email: authData.user.email || '',
        total_styles: styleIds.length,
        total_skus: 0,
        skipped_rows: 0,
        api_requests: 0,
        rate_limit_remaining: null,
        error_message: null,
      }, { onConflict: 'style_session_id,brand' })
      .select('id')
      .single();
    if (runError || !syncRun) {
      console.error('Unable to start the SKU sync run', runError?.message);
      return json(request, { error: 'Unable to start the private SKU sync' }, 500);
    }

    const failRun = async (message: string, apiRequests: number, rateLimitRemaining: number | null) => {
      await userClient
        .from('ss_sku_sync_runs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          api_requests: apiRequests,
          rate_limit_remaining: rateLimitRemaining,
          error_message: message,
        })
        .eq('id', syncRun.id);
    };

    let apiRequests = 0;
    let rateLimitRemaining: number | null = null;
    let skippedRows = Math.max(0, (stagedStyles || []).length - styleIds.length);
    let upstreamProducts = 0;
    const productsBySku = new Map<string, Record<string, unknown>>();

    try {
      for (let index = 0; index < styleIds.length; index += 20) {
        const url = new URL('https://api.ssactivewear.com/v2/products/');
        url.searchParams.set('styleid', styleIds.slice(index, index + 20).join(','));
        url.searchParams.set('fields', productFields);
        url.searchParams.set('mediatype', 'json');

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${btoa(`${accountNumber}:${apiKey}`)}`,
            'Accept': 'application/json',
          },
          signal: AbortSignal.timeout(30000),
        });
        apiRequests += 1;
        rateLimitRemaining = integerValue(response.headers.get('x-rate-limit-remaining'));

        if (!response.ok) {
          const message = response.status === 429
            ? 'S&S rate limit reached. Wait one minute and retry this brand.'
            : `S&S product lookup failed for ${brand}`;
          console.error(`${message} (status ${response.status})`);
          await failRun(message, apiRequests, rateLimitRemaining);
          return json(request, { error: message, upstream_status: response.status }, 502);
        }

        const products = await response.json();
        upstreamProducts += Array.isArray(products) ? products.length : 0;
        for (const product of Array.isArray(products) ? products : []) {
          const sku = textValue(product.sku ?? product.Sku);
          const styleId = integerValue(product.styleID ?? product.StyleID);
          const responseBrand = canonicalApprovedBrand(product.brandName ?? product.BrandName);
          if (
            !sku ||
            styleId === null ||
            !stylesById.has(styleId) ||
            (responseBrand && responseBrand !== brand)
          ) {
            skippedRows += 1;
            continue;
          }
          productsBySku.set(sku, product);
        }
      }

      if (productsBySku.size === 0) {
        const message = upstreamProducts === 0
          ? `S&S returned no SKU rows for the staged ${brand} styles`
          : `S&S returned ${upstreamProducts} product rows, but none contained usable staged SKU identifiers`;
        console.error(message);
        await failRun(message, apiRequests, rateLimitRemaining);
        return json(request, { error: message }, 502);
      }

      const fetchedAt = new Date().toISOString();
      const rows = [...productsBySku.entries()].map(([sku, product]) => {
        const styleId = integerValue(product.styleID)!;
        const stagedStyle = stylesById.get(styleId);
        return {
          style_session_id: latest.import_session_id,
          sync_run_id: syncRun.id,
          owner_user_id: authData.user.id,
          created_by_email: authData.user.email || '',
          fetched_at: fetchedAt,
          brand,
          style_id: styleId,
          part_number: stagedStyle?.partNumber || null,
          style_name: textValue(product.styleName) || stagedStyle?.styleName || null,
          sku_id: integerValue(product.skuID ?? product.skuID_Master),
          sku,
          gtin: textValue(product.gtin),
          your_sku: textValue(product.yourSku),
          color_name: textValue(product.colorName),
          color_code: textValue(product.colorCode),
          color_price_code_name: textValue(product.colorPriceCodeName),
          color_group: textValue(product.colorGroup),
          color_group_name: textValue(product.colorGroupName),
          color_family_id: integerValue(product.colorFamilyID),
          color_family: textValue(product.colorFamily),
          color_swatch_image: imageUrl(product.colorSwatchImage),
          color_swatch_text_color: textValue(product.colorSwatchTextColor),
          color_front_image: imageUrl(product.colorFrontImage),
          color_side_image: imageUrl(product.colorSideImage),
          color_back_image: imageUrl(product.colorBackImage),
          color_direct_side_image: imageUrl(product.colorDirectSideImage),
          color_on_model_front_image: imageUrl(product.colorOnModelFrontImage),
          color_on_model_side_image: imageUrl(product.colorOnModelSideImage),
          color_on_model_back_image: imageUrl(product.colorOnModelBackImage),
          color_1: textValue(product.color1),
          color_2: textValue(product.color2),
          size_name: textValue(product.sizeName),
          size_code: textValue(product.sizeCode),
          size_order: textValue(product.sizeOrder),
          size_price_code_name: textValue(product.sizePriceCodeName),
          case_qty: integerValue(product.caseQty),
          unit_weight: numberValue(product.unitWeight),
          map_price: numberValue(product.mapPrice),
          retail_price: numberValue(product.retailPrice),
          piece_price: numberValue(product.piecePrice),
          dozen_price: numberValue(product.dozenPrice),
          case_price: numberValue(product.casePrice),
          sale_price: numberValue(product.salePrice),
          customer_price: numberValue(product.customerPrice),
          sale_expiration: textValue(product.saleExpiration),
          noe_retailing: Boolean(product.noeRetailing),
          poly_pack_qty: integerValue(product.PolyPackQty ?? product.polyPackQty),
          inventory_qty: integerValue(product.qty) || 0,
          country_of_origin: textValue(product.countryOfOrigin),
          warehouses: Array.isArray(product.warehouses) ? product.warehouses : [],
          raw_product: product,
        };
      });

      for (let index = 0; index < rows.length; index += 200) {
        const { error: insertError } = await userClient
          .from('ss_sku_staging')
          .upsert(rows.slice(index, index + 200), { onConflict: 'style_session_id,sku' });
        if (insertError) {
          console.error('Private S&S SKU staging failed', insertError.message);
          const message = 'Unable to save the private SKU staging rows';
          await failRun(message, apiRequests, rateLimitRemaining);
          return json(request, { error: message }, 500);
        }
      }

      const completedAt = new Date().toISOString();
      const { error: completeError } = await userClient
        .from('ss_sku_sync_runs')
        .update({
          status: 'completed',
          completed_at: completedAt,
          total_skus: rows.length,
          skipped_rows: skippedRows,
          api_requests: apiRequests,
          rate_limit_remaining: rateLimitRemaining,
          error_message: null,
        })
        .eq('id', syncRun.id);
      if (completeError) {
        console.error('Unable to finalize the SKU sync run', completeError.message);
        return json(request, { error: 'SKU rows were staged, but the sync log could not be finalized' }, 500);
      }

      return json(request, {
        synced: true,
        brand,
        style_session_id: latest.import_session_id,
        styles: styleIds.length,
        skus: rows.length,
        skipped_rows: skippedRows,
        api_requests: apiRequests,
        rate_limit_remaining: rateLimitRemaining,
        completed_at: completedAt,
        storefront_changed: false,
      });
    } catch (error) {
      console.error('S&S brand SKU sync failed', error);
      const message = 'Unable to complete the S&S SKU sync for this brand';
      await failRun(message, apiRequests, rateLimitRemaining);
      return json(request, { error: message }, 502);
    }
  }

  if (payload.action === 'stage_styles') {
    const { data: existing, error: existingError } = await userClient
      .from('ss_import_staging')
      .select('import_session_id,total_staged_rows')
      .eq('row_status', 'pending')
      .order('created_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError) {
      console.error('Unable to check existing S&S staging session', existingError.message);
      return json(request, { error: 'Unable to check the staging area' }, 500);
    }
    if (existing) {
      const { count } = await userClient
        .from('ss_import_staging')
        .select('id', { count: 'exact', head: true })
        .eq('import_session_id', existing.import_session_id);
      return json(request, {
        staged: true,
        reused: true,
        import_session_id: existing.import_session_id,
        staged_styles: count || Number(existing.total_staged_rows) || 0,
      });
    }
  }

  try {
    const endpoint = payload.action === 'test_connection'
      ? 'https://api.ssactivewear.com/v2/brands/?mediatype=json'
      : 'https://api.ssactivewear.com/v2/styles/?fields=StyleID%2CPartNumber%2CBrandName%2CStyleName%2CTitle%2CBaseCategory%2CStyleImage&mediatype=json';
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${btoa(`${accountNumber}:${apiKey}`)}`,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.error(`S&S connection test failed with status ${response.status}`);
      const message = response.status === 401
        ? 'S&S rejected the account number or API key'
        : 'S&S API connection failed';
      return json(request, { error: message, upstream_status: response.status }, 502);
    }

    const result = await response.json();
    if (payload.action === 'preview_catalog' || payload.action === 'stage_styles') {
      const { counts, samples, styles } = collectApprovedStyles(result);

      if (payload.action === 'stage_styles') {
        const sessionId = `ss-api-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 8)}`;
        const rows = styles.map((style, index) => ({
          import_session_id: sessionId,
          file_name: 'ss-activewear-api-v2-styles',
          total_staged_rows: styles.length,
          row_number: index + 1,
          raw_row_data: JSON.stringify(style),
          brand: style.canonicalBrand,
          style_number: String(style.partNumber || ''),
          product_name: [style.canonicalBrand, style.styleName, style.title].filter(Boolean).join(' - '),
          product_category: style.baseCategory || null,
          image_url: imageUrl(style.styleImage),
          row_status: 'pending',
          owner_user_id: authData.user.id,
          created_by_email: authData.user.email || '',
        }));

        for (let index = 0; index < rows.length; index += 200) {
          const { error: insertError } = await userClient
            .from('ss_import_staging')
            .insert(rows.slice(index, index + 200));
          if (insertError) {
            console.error('S&S staging insert failed', insertError.message);
            await userClient.from('ss_import_staging').delete().eq('import_session_id', sessionId);
            return json(request, { error: 'Unable to complete the staged import' }, 500);
          }
        }

        return json(request, {
          staged: true,
          reused: false,
          import_session_id: sessionId,
          staged_styles: rows.length,
          approved_brands: approvedBrands.length,
          rate_limit_remaining: response.headers.get('x-rate-limit-remaining'),
          staged_at: new Date().toISOString(),
        });
      }

      return json(request, {
        preview: true,
        approved_brands: approvedBrands.length,
        matching_styles: Object.values(counts).reduce((total, count) => total + Number(count), 0),
        brand_counts: approvedBrands.map((brand) => ({ brand, styles: counts[brand] })),
        unresolved_brands: approvedBrands.filter((brand) => counts[brand] === 0),
        sample_styles: samples,
        rate_limit_remaining: response.headers.get('x-rate-limit-remaining'),
        checked_at: new Date().toISOString(),
      });
    }

    return json(request, {
      connected: true,
      endpoint: 'S&S Activewear API v2',
      brands_available: Array.isArray(result) ? result.length : null,
      rate_limit_remaining: response.headers.get('x-rate-limit-remaining'),
      checked_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('S&S connection test request failed', error);
    return json(request, { error: 'Unable to reach the S&S API' }, 502);
  }
});
