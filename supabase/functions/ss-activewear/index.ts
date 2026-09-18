import { createClient } from 'npm:@supabase/supabase-js@2';

const allowedOrigins = new Set([
  'http://127.0.0.1:4174',
  'http://localhost:4174',
  'https://hc-apparel-copy.vercel.app',
  'https://ilovehcapparel.net',
  'https://www.ilovehcapparel.net',
]);

const approvedBrands = [
  'Gildan',
  'Bella + Canvas',
  'Comfort Colors',
  'DRI DUCK',
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
  'Columbia',
  'Independent Trading Co',
];

const coldWeatherBrands = new Set([
  'Columbia',
  'Gildan',
  'Champion',
  'Lane Seven',
  'Independent Trading Co',
  'Comfort Colors',
  'DRI DUCK',
  'Tultex',
  'adidas',
  'Oakley',
]);

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

function isColdWeatherStyle(style: Record<string, unknown> & { canonicalBrand: string }) {
  if (!coldWeatherBrands.has(style.canonicalBrand)) return false;
  const text = [
    style.styleName,
    style.title,
    style.baseCategory,
    style.partNumber,
  ].map((value) => String(value || '').toLowerCase()).join(' ');

  return /(hood|hoodie|fleece|jacket|pullover|outerwear|coat|beanie|hat|cap|crewneck|crew neck|sweatshirt|soft shell|shell|vest)/i
    .test(text);
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

function importedDescriptionLines(value: unknown) {
  const description = String(value || '')
    .replace(/<(br|\/p|\/li)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\r/g, '\n');

  return [...new Set(
    description
      .split(/\n|[•]+/)
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter((line) => line.length >= 3),
  )];
}

const supportedShippingMethods = new Set([
  '1', '2', '3', '6', '8', '14', '16', '17', '19', '20', '21', '22', '26', '27', '40', '48', '54',
]);

function ssShippingMethod(value: unknown) {
  const normalized = String(value || '').trim().toLowerCase();
  if (supportedShippingMethods.has(normalized)) return normalized;
  if (normalized.includes('cheapest') || normalized.includes('economy')) return '54';
  return '1';
}

function safeSsError(value: unknown, fallback: string) {
  if (!value || typeof value !== 'object') return fallback;
  const record = value as Record<string, unknown>;
  const errors = Array.isArray(record.errors) ? record.errors : [];
  const messages = errors
    .map((entry) => entry && typeof entry === 'object' ? textValue((entry as Record<string, unknown>).message) : null)
    .filter(Boolean);
  return textValue(record.message) || messages.join('; ') || fallback;
}

function inventoryQuantity(product: Record<string, unknown>) {
  const warehouses = Array.isArray(product.warehouses ?? product.Warehouses)
    ? (product.warehouses ?? product.Warehouses) as Array<Record<string, unknown>>
    : [];
  if (warehouses.length) {
    return warehouses.reduce((total, warehouse) => total + Math.max(0, Number(warehouse.qty ?? warehouse.Qty) || 0), 0);
  }
  return Math.max(0, Number(product.qty ?? product.Qty) || 0);
}

function buildSsOrderRequest(vendorPayload: Record<string, unknown>, draftId: string) {
  const shipping = (vendorPayload.shipping_address || {}) as Record<string, unknown>;
  const items = Array.isArray(vendorPayload.items)
    ? vendorPayload.items as Array<Record<string, unknown>>
    : [];
  return {
    shippingAddress: {
      customer: textValue(vendorPayload.customer_name) || textValue(shipping.company) || textValue(shipping.name) || '',
      attn: textValue(shipping.name) || '',
      address: textValue(shipping.street) || textValue(shipping.line1) || textValue(shipping.address1),
      city: textValue(shipping.city),
      state: textValue(shipping.state),
      zip: textValue(shipping.zip) || textValue(shipping.postal_code),
      residential: true,
    },
    shippingMethod: ssShippingMethod(vendorPayload.shipping_method),
    shipBlind: false,
    poNumber: textValue(vendorPayload.purchase_order_number) || `HC-${draftId}`,
    emailConfirmation: '',
    testOrder: false,
    autoselectWarehouse: true,
    lines: items.map((item) => ({
      identifier: String(item.sku || '').trim(),
      qty: Math.trunc(Number(item.quantity)),
    })),
  };
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

  let payload: {
    action?: string;
    brand?: string;
    draft_id?: string;
    order_id?: string;
    ss_live_submission_enabled?: boolean;
    zerotouch_live_submission_enabled?: boolean;
  };
  try {
    payload = await request.json();
  } catch {
    return json(request, { error: 'Invalid request body' }, 400);
  }

  const jwt = authorization.replace(/^Bearer\s+/i, '');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const serviceMaintenance = Boolean(
    serviceRoleKey
    && jwt === serviceRoleKey
    && payload.action === 'refresh_public_style_content'
  );
  const userClient = createClient(
    supabaseUrl,
    serviceMaintenance ? serviceRoleKey! : publishableKey,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authorization } },
    },
  );

  let actorUserId: string | null = null;
  let actorEmail = '';
  if (serviceMaintenance) {
    actorEmail = 'service-maintenance';
  } else {
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
    actorUserId = authData.user.id;
    actorEmail = authData.user.email || '';
  }

  if (![
    'test_connection',
    'preview_catalog',
    'stage_styles',
    'stage_brand_styles',
    'stage_cold_weather_styles',
    'sync_brand_products',
    'refresh_public_style_content',
    'validate_vendor_order_draft',
    'check_blank_fulfillment_inventory',
    'create_blank_fulfillment_draft',
    'get_admin_status',
    'set_live_controls',
    'submit_vendor_order',
  ].includes(payload.action || '')) {
    return json(request, { error: 'Unsupported action' }, 400);
  }

  const accountNumber = Deno.env.get('SS_ACCOUNT_NUMBER');
  const apiKey = Deno.env.get('SS_API_KEY');

  if (payload.action === 'check_blank_fulfillment_inventory'
    || payload.action === 'create_blank_fulfillment_draft') {
    if (!payload.order_id) return json(request, { error: 'Customer order ID is required' }, 400);
    const { data: order, error: orderError } = await userClient.from('orders')
      .select('id,payment_status,total_amount,amount_paid,balance_due,shipping_address,order_items,artwork_file_url,artwork_link,print_method,print_placement,what_to_print')
      .eq('id', payload.order_id).maybeSingle();
    if (orderError || !order) return json(request, { error: 'Customer order not found' }, 404);
    if (order.payment_status !== 'paid'
      || Number(order.balance_due ?? (Number(order.total_amount) - Number(order.amount_paid))) > 0
      || Number(order.amount_paid) < Number(order.total_amount)) {
      return json(request, { error: 'Payment must be confirmed with no balance due' }, 400);
    }
    const address = order.shipping_address || {};
    if (!(address.street || address.line1 || address.address1)
      || !address.city || !address.state || !(address.zip || address.postal_code)) {
      return json(request, { error: 'A complete shipping address is required' }, 400);
    }
    const items = Array.isArray(order.order_items) ? order.order_items : [];
    if (!items.length || order.artwork_file_url || order.artwork_link || order.print_method
      || (Array.isArray(order.print_placement) ? order.print_placement.length > 0 : Boolean(order.print_placement))
      || order.what_to_print || items.some((item) =>
      !item.sku || !item.product_name || !item.color || !item.size
      || !Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1
      || item.purchase_mode === 'customized' || item.is_customized === true
      || item.artwork_file_url || item.decoration_method || item.print_method
      || (Array.isArray(item.print_placement) ? item.print_placement.length > 0 : Boolean(item.print_placement))
    )) return json(request, { error: 'Blank garment SKU, variant, quantity, and no-print validation failed' }, 400);
    if (!accountNumber || !apiKey) return json(request, { error: 'S&S inventory connection is not configured' }, 503);

    try {
      const skuList = [...new Set(items.map((item) => String(item.sku).trim()))];
      const url = new URL(`https://api.ssactivewear.com/v2/products/${skuList.map(encodeURIComponent).join(',')}`);
      url.searchParams.set('fields', 'Sku,ColorName,SizeName,Qty,Warehouses');
      url.searchParams.set('mediatype', 'json');
      const response = await fetch(url, {
        headers: { Authorization: `Basic ${btoa(`${accountNumber}:${apiKey}`)}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) return json(request, { error: 'Current S&S inventory could not be confirmed' }, 502);
      const body = await response.json();
      const rows = Array.isArray(body) ? body as Array<Record<string, unknown>> : [];
      const checks = items.map((item) => {
        const row = rows.find((candidate) =>
          String(candidate.sku ?? candidate.Sku ?? '').trim().toLowerCase() === String(item.sku).trim().toLowerCase());
        const available = row ? inventoryQuantity(row) : 0;
        const colorMatches = Boolean(row) && String(row?.colorName ?? row?.ColorName ?? '').trim().toLowerCase()
          === String(item.color).trim().toLowerCase();
        const sizeMatches = Boolean(row) && String(row?.sizeName ?? row?.SizeName ?? '').trim().toLowerCase()
          === String(item.size).trim().toLowerCase();
        const valid = Boolean(row) && colorMatches && sizeMatches && available >= Number(item.quantity);
        return { sku: item.sku, requested_quantity: Number(item.quantity), available_quantity: available,
          valid, reason: !row ? 'SKU not found' : !colorMatches || !sizeMatches ? 'Variant mismatch' : 'Insufficient inventory' };
      });
      if (payload.action === 'check_blank_fulfillment_inventory') {
        return json(request, { valid: checks.every((check) => check.valid), items: checks,
          checked_at: new Date().toISOString(), submitted: false });
      }
      if (checks.some((check) => !check.valid)) {
        return json(request, { error: 'Current S&S inventory or variant could not be confirmed', items: checks }, 409);
      }
      const { data: draft, error: draftError } = await userClient.rpc('create_blank_ss_fulfillment_draft',
        { p_order_id: payload.order_id });
      if (draftError) return json(request, { error: draftError.message || 'Could not create the private draft' }, 400);
      return json(request, { ...draft, submitted: false });
    } catch (error) {
      console.error('Read-only blank fulfillment inventory check failed', error instanceof Error ? error.name : 'unknown');
      return json(request, { error: 'S&S inventory check could not connect. Try again before creating a draft.' }, 502);
    }
  }

  if (payload.action === 'get_admin_status') {
    const { data: settings, error: settingsError } = await userClient
      .from('integration_settings')
      .select('ss_live_submission_enabled,zerotouch_live_submission_enabled,ss_api_connected,last_ss_connection_at,last_ss_connection_message,last_ss_submission_at,last_ss_submission_status,last_ss_submission_draft_id,last_ss_submission_order_number,last_ss_submission_error')
      .eq('id', true)
      .maybeSingle();
    if (settingsError) {
      console.error('Unable to load integration controls', settingsError.message);
      return json(request, { error: 'Unable to load integration controls' }, 500);
    }
    return json(request, {
      ...settings,
      ss_credentials_configured: Boolean(accountNumber && apiKey),
    });
  }

  if (payload.action === 'set_live_controls') {
    const ssLiveEnabled = payload.ss_live_submission_enabled === true;
    const zeroTouchLiveEnabled = payload.zerotouch_live_submission_enabled === true;
    if (ssLiveEnabled && (!accountNumber || !apiKey)) {
      return json(request, { error: 'S&S credentials must be configured before live submission can be enabled' }, 409);
    }
    const { data: settings, error: settingsError } = await userClient.rpc(
      'set_live_integration_controls',
      {
        p_ss_live_enabled: ssLiveEnabled,
        p_zerotouch_live_enabled: zeroTouchLiveEnabled,
      },
    );
    if (settingsError || !settings) {
      console.error('Unable to update live integration controls', settingsError?.message);
      return json(request, { error: 'Unable to update live integration controls' }, 500);
    }
    return json(request, {
      ss_live_submission_enabled: settings.ss_live_submission_enabled,
      zerotouch_live_submission_enabled: settings.zerotouch_live_submission_enabled,
      ss_api_connected: settings.ss_api_connected,
      ss_credentials_configured: Boolean(accountNumber && apiKey),
      updated_at: settings.updated_at,
    });
  }

  if (payload.action === 'submit_vendor_order') {
    if (!payload.draft_id) {
      return json(request, { error: 'Vendor order draft ID is required' }, 400);
    }
    if (!accountNumber || !apiKey) {
      return json(request, { error: 'S&S credentials are not configured' }, 503);
    }

    const { data: authorizationResult, error: authorizationError } = await userClient.rpc(
      'begin_live_ss_submission',
      { p_draft_id: payload.draft_id },
    );
    if (authorizationError || !authorizationResult) {
      console.warn('Live S&S submission gate rejected the request', authorizationError?.message);
      return json(request, { error: authorizationError?.message || 'Live S&S submission is not allowed' }, 409);
    }

    const failSubmission = async (message: string) => {
      const safeMessage = message.slice(0, 1000);
      const { error } = await userClient.rpc('fail_live_ss_submission', {
        p_draft_id: payload.draft_id,
        p_error: safeMessage,
      });
      if (error) console.error('Unable to record failed S&S submission state', error.message);
      return safeMessage;
    };

    try {
      const vendorPayload = authorizationResult.payload as Record<string, unknown>;
      const items = Array.isArray(vendorPayload.items)
        ? vendorPayload.items as Array<Record<string, unknown>>
        : [];
      const skuIdentifiers = [...new Set(items.map((item) => textValue(item.sku)).filter(Boolean))] as string[];
      if (!skuIdentifiers.length) {
        const message = await failSubmission('No valid S&S SKU identifiers were available');
        return json(request, { error: message }, 409);
      }

      const inventoryUrl = new URL(`https://api.ssactivewear.com/v2/products/${skuIdentifiers.map(encodeURIComponent).join(',')}`);
      inventoryUrl.searchParams.set('fields', 'Sku,ColorName,SizeName,Qty,Warehouses');
      inventoryUrl.searchParams.set('mediatype', 'json');
      const authHeader = `Basic ${btoa(`${accountNumber}:${apiKey}`)}`;
      const inventoryResponse = await fetch(inventoryUrl, {
        headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
      if (!inventoryResponse.ok) {
        const message = await failSubmission('Unable to confirm current S&S inventory');
        return json(request, { error: message }, 502);
      }
      const inventoryResult = await inventoryResponse.json();
      const inventoryRows = Array.isArray(inventoryResult)
        ? inventoryResult as Array<Record<string, unknown>>
        : [];

      for (const item of items) {
        const sku = String(item.sku || '').trim().toLowerCase();
        const color = String(item.color || '').trim().toLowerCase();
        const size = String(item.size || '').trim().toLowerCase();
        const quantity = Math.trunc(Number(item.quantity) || 0);
        const product = inventoryRows.find((row) => String(row.sku ?? row.Sku ?? '').trim().toLowerCase() === sku);
        if (!product) {
          const message = await failSubmission(`S&S SKU ${String(item.sku || '').trim()} is invalid or unavailable`);
          return json(request, { error: message }, 409);
        }
        const currentColor = String(product.colorName ?? product.ColorName ?? '').trim().toLowerCase();
        const currentSize = String(product.sizeName ?? product.SizeName ?? '').trim().toLowerCase();
        if (currentColor !== color || currentSize !== size) {
          const message = await failSubmission(`S&S SKU ${String(item.sku || '').trim()} does not match the selected color and size`);
          return json(request, { error: message }, 409);
        }
        if (quantity <= 0 || inventoryQuantity(product) < quantity) {
          const message = await failSubmission(`S&S SKU ${String(item.sku || '').trim()} does not have enough current stock`);
          return json(request, { error: message }, 409);
        }
      }

      const requestBody = buildSsOrderRequest(vendorPayload, payload.draft_id);

      const orderResponse = await fetch('https://api.ssactivewear.com/v2/orders/', {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(30000),
      });
      const orderResult = await orderResponse.json().catch(() => null);
      if (!orderResponse.ok) {
        const message = await failSubmission(safeSsError(orderResult, 'S&S rejected the vendor order'));
        return json(request, { error: message, upstream_status: orderResponse.status }, 502);
      }

      const orders = (Array.isArray(orderResult) ? orderResult : [orderResult])
        .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'));
      const orderNumbers = orders.map((entry) => textValue(entry.orderNumber)).filter(Boolean) as string[];
      if (!orderNumbers.length) {
        const message = await failSubmission('S&S accepted the request but did not return an order number; manual review is required');
        return json(request, { error: message }, 502);
      }
      const responseSummary = orders.map((entry) => ({
        order_number: textValue(entry.orderNumber),
        order_status: textValue(entry.orderStatus),
        warehouse: textValue(entry.warehouseAbbr),
        guid: textValue(entry.guid),
      }));
      const { data: completedDraft, error: completionError } = await userClient.rpc(
        'complete_live_ss_submission',
        {
          p_draft_id: payload.draft_id,
          p_order_number: orderNumbers.join(', '),
          p_response_summary: responseSummary,
        },
      );
      if (completionError || !completedDraft) {
        console.error('S&S returned an order but the local confirmation audit failed', completionError?.message);
        return json(request, {
          error: 'S&S returned an order number, but local confirmation requires immediate manual review',
          submitted: true,
          order_numbers: orderNumbers,
        }, 500);
      }
      return json(request, {
        submitted: true,
        order_numbers: orderNumbers,
        submitted_at: completedDraft.ss_submitted_at,
        submission_state: completedDraft.ss_submission_state,
      });
    } catch (error) {
      console.error('Live S&S order request failed without logging request data', error instanceof Error ? error.message : 'unknown error');
      const message = await failSubmission('Unable to complete the S&S order request');
      return json(request, { error: message }, 502);
    }
  }

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

    const { data: validationDraft, error: validationDraftError } = await userClient
      .from('vendor_order_drafts')
      .select('customer_name')
      .eq('id', payload.draft_id)
      .maybeSingle();
    if (validationDraftError || !validationDraft) {
      console.error('Unable to load vendor draft for dry-run preview', validationDraftError?.message);
      return json(request, { error: 'Unable to prepare the S&S dry-run preview' }, 500);
    }
    const authorizedPayload = {
      ...(validation.payload as Record<string, unknown>),
      customer_name: validationDraft.customer_name,
    };
    const submissionPayload = buildSsOrderRequest(authorizedPayload, payload.draft_id);

    let apiConnected = false;
    let connectionMessage = 'S&S API not connected';
    let rateLimitRemaining: string | null = null;
    let inventoryValid = false;
    let inventoryChecks: Array<Record<string, unknown>> = [];

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

        if (response.ok && submissionPayload.lines.length) {
          const inventoryUrl = new URL(
            `https://api.ssactivewear.com/v2/products/${submissionPayload.lines.map((line) => encodeURIComponent(line.identifier)).join(',')}`,
          );
          inventoryUrl.searchParams.set('fields', 'Sku,ColorName,SizeName,Qty,Warehouses');
          inventoryUrl.searchParams.set('mediatype', 'json');
          const inventoryResponse = await fetch(inventoryUrl, {
            headers: {
              'Authorization': `Basic ${btoa(`${accountNumber}:${apiKey}`)}`,
              'Accept': 'application/json',
            },
            signal: AbortSignal.timeout(15000),
          });
          if (inventoryResponse.ok) {
            const inventoryResult = await inventoryResponse.json();
            const inventoryRows = Array.isArray(inventoryResult)
              ? inventoryResult as Array<Record<string, unknown>>
              : [];
            const items = authorizedPayload.items as Array<Record<string, unknown>>;
            inventoryChecks = items.map((item) => {
              const sku = String(item.sku || '').trim();
              const product = inventoryRows.find((row) =>
                String(row.sku ?? row.Sku ?? '').trim().toLowerCase() === sku.toLowerCase()
              );
              const available = product ? inventoryQuantity(product) : 0;
              const requested = Math.trunc(Number(item.quantity) || 0);
              const colorMatches = Boolean(product)
                && String(product?.colorName ?? product?.ColorName ?? '').trim().toLowerCase()
                  === String(item.color || '').trim().toLowerCase();
              const sizeMatches = Boolean(product)
                && String(product?.sizeName ?? product?.SizeName ?? '').trim().toLowerCase()
                  === String(item.size || '').trim().toLowerCase();
              return {
                sku,
                requested_quantity: requested,
                available_quantity: available,
                sku_found: Boolean(product),
                color_matches: colorMatches,
                size_matches: sizeMatches,
                in_stock: requested > 0 && available >= requested,
              };
            });
            inventoryValid = inventoryChecks.length === items.length
              && inventoryChecks.every((check) =>
                check.sku_found && check.color_matches && check.size_matches && check.in_stock
              );
          } else {
            connectionMessage = 'S&S API connected; current SKU inventory preview was unavailable';
          }
        }
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
      dry_run: true,
      submission_payload: submissionPayload,
      credentials: {
        account_number: accountNumber ? 'configured (masked)' : 'not configured',
        api_key: apiKey ? 'configured (masked)' : 'not configured',
      },
      inventory_check: {
        valid: inventoryValid,
        items: inventoryChecks,
        checked_at: new Date().toISOString(),
      },
    };
    const { error: recordError } = await userClient.rpc(
      'record_ss_vendor_order_test_result',
      { p_draft_id: payload.draft_id, p_result: result },
    );
    if (recordError) {
      console.error('Unable to record vendor order test result', recordError.message);
      return json(request, { error: 'Validation ran, but its audit result could not be saved' }, 500);
    }
    await userClient.rpc('record_ss_connection_result', {
      p_connected: apiConnected,
      p_message: connectionMessage,
    });

    return json(request, result);
  }

  if (!accountNumber || !apiKey) {
    return json(request, { error: 'S&S credentials are not configured' }, 503);
  }

  if (payload.action === 'refresh_public_style_content') {
    const { data: products, error: productsError } = await userClient
      .from('products')
      .select('id,name,supplier_sku,brand')
      .eq('product_type', 'physical')
      .ilike('vendor_source', 'S&S Activewear%')
      .not('supplier_sku', 'is', null)
      .limit(1000);
    if (productsError) {
      console.error('Unable to read S&S public product styles', productsError.message);
      return json(request, { error: 'Unable to read S&S product styles' }, 500);
    }

    const normalizedIdentifier = (value: unknown) => String(value || '').trim().toUpperCase();
    const productsByIdentifier = new Map<string, Array<Record<string, unknown>>>();
    for (const product of products || []) {
      const identifier = normalizedIdentifier(product.supplier_sku);
      if (!identifier) continue;
      const brand = normalizedIdentifier(product.brand);
      const keys = brand ? [`${brand}::${identifier}`] : [`*::${identifier}`];
      for (const key of keys) {
        const matches = productsByIdentifier.get(key) || [];
        matches.push(product);
        productsByIdentifier.set(key, matches);
      }
    }

    let allStyles: Array<Record<string, unknown>> = [];
    let apiRequests = 0;
    try {
      const styleUrl = new URL('https://api.ssactivewear.com/v2/styles/');
      styleUrl.searchParams.set(
        'fields',
        'StyleID,PartNumber,BrandName,StyleName,Title,Description,BaseCategory,Categories,StyleImage',
      );
      styleUrl.searchParams.set('mediatype', 'json');
      const styleResponse = await fetch(styleUrl, {
        headers: {
          'Authorization': `Basic ${btoa(`${accountNumber}:${apiKey}`)}`,
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(30000),
      });
      apiRequests += 1;
      if (!styleResponse.ok) {
        console.error('S&S style content lookup failed', styleResponse.status);
        return json(request, { error: 'S&S style content lookup failed' }, 502);
      }
      const fetchedStyles = await styleResponse.json();
      allStyles = Array.isArray(fetchedStyles) ? fetchedStyles : [];
    } catch (error) {
      console.error('S&S public style content lookup failed', error);
      return json(request, { error: 'Unable to retrieve S&S public style content' }, 502);
    }

    const styleRows: Array<Record<string, unknown>> = [];
    const productsByResolvedPartNumber = new Map<string, Array<Record<string, unknown>>>();
    const resolvedStyleIds = new Set<string>();
    for (const style of allStyles) {
      const brand = normalizedIdentifier(style.brandName ?? style.BrandName);
      const styleName = normalizedIdentifier(style.styleName ?? style.StyleName);
      const partNumber = normalizedIdentifier(style.partNumber ?? style.PartNumber);
      const styleId = normalizedIdentifier(style.styleID ?? style.StyleID);
      const matchedProducts = new Map<string, Record<string, unknown>>();

      for (const identifier of [styleName, partNumber]) {
        if (!identifier) continue;
        for (const key of [`${brand}::${identifier}`, `*::${identifier}`]) {
          for (const product of productsByIdentifier.get(key) || []) {
            matchedProducts.set(String(product.id), product);
          }
        }
      }
      if (!matchedProducts.size || !partNumber) continue;

      styleRows.push(style);
      productsByResolvedPartNumber.set(partNumber, [...matchedProducts.values()]);
      if (styleId) resolvedStyleIds.add(styleId);
    }

    const specRows: Array<Record<string, unknown>> = [];
    try {
      const styleIds = [...resolvedStyleIds];
      for (let index = 0; index < styleIds.length; index += 20) {
        const styleIdChunk = styleIds.slice(index, index + 20);
        const specUrl = new URL('https://api.ssactivewear.com/v2/specs/');
        specUrl.searchParams.set('style', styleIdChunk.join(','));
        specUrl.searchParams.set(
          'fields',
          'SpecID,StyleID,PartNumber,BrandName,StyleName,SizeName,SizeOrder,SpecName,Value',
        );
        specUrl.searchParams.set('mediatype', 'json');
        const specResponse = await fetch(specUrl, {
          headers: {
            'Authorization': `Basic ${btoa(`${accountNumber}:${apiKey}`)}`,
            'Accept': 'application/json',
          },
          signal: AbortSignal.timeout(30000),
        });
        apiRequests += 1;
        if (!specResponse.ok) {
          console.error('S&S style specs lookup failed', specResponse.status);
          return json(request, { error: 'S&S style specs lookup failed' }, 502);
        }
        const fetchedSpecs = await specResponse.json();
        specRows.push(...(Array.isArray(fetchedSpecs) ? fetchedSpecs : []));
      }
    } catch (error) {
      console.error('S&S public style content refresh failed', error);
      return json(request, { error: 'Unable to refresh S&S public style content' }, 502);
    }

    const specsByPartNumber = new Map<string, Array<Record<string, unknown>>>();
    for (const spec of specRows) {
      const partNumber = String(spec.partNumber ?? spec.PartNumber ?? '').trim().toUpperCase();
      if (!partNumber) continue;
      const matches = specsByPartNumber.get(partNumber) || [];
      matches.push({
        size: textValue(spec.sizeName ?? spec.SizeName),
        size_order: textValue(spec.sizeOrder ?? spec.SizeOrder),
        spec_name: textValue(spec.specName ?? spec.SpecName),
        value: textValue(spec.value ?? spec.Value),
      });
      specsByPartNumber.set(partNumber, matches);
    }

    let updatedProducts = 0;
    let productsWithDescription = 0;
    let productsWithSpecs = 0;
    for (const style of styleRows) {
      const partNumber = normalizedIdentifier(style.partNumber ?? style.PartNumber);
      const matchedProducts = productsByResolvedPartNumber.get(partNumber) || [];
      if (!matchedProducts.length) continue;

      const brand = textValue(style.brandName ?? style.BrandName);
      const styleName = textValue(style.styleName ?? style.StyleName);
      const title = textValue(style.title ?? style.Title);
      const lines = importedDescriptionLines(style.description ?? style.Description);
      const description = lines.join('\n');
      const specs = specsByPartNumber.get(partNumber) || [];
      const fabricLine = lines.find((line) =>
        /(cotton|polyester|rayon|spandex|nylon|wool|fleece|fabric)/i.test(line)
      ) || null;
      const weightLine = lines.find((line) =>
        /(\d+(?:\.\d+)?\s*oz\.?(?:\/yd²|\/yd2|\.?)?|\d+\s*gsm)/i.test(line)
      ) || null;
      const fitLine = lines.find((line) =>
        /(fit|unisex|women'?s|men'?s|youth|oversized|relaxed)/i.test(line)
      ) || null;

      for (const product of matchedProducts) {
        const updates = {
          brand,
          style_number: styleName || partNumber,
          name: [brand, styleName, title].filter(Boolean).join(' - '),
          description: description || null,
          fabric_material: fabricLine,
          garment_weight: weightLine,
          fit: fitLine,
          features: lines,
          vendor_specs: specs,
          vendor_data_refreshed_at: new Date().toISOString(),
        };
        const { error: updateError } = await userClient
          .from('products')
          .update(updates)
          .eq('id', product.id);
        if (updateError) {
          console.error('Unable to save imported S&S style content', updateError.message);
          return json(request, { error: 'Unable to save imported S&S style content' }, 500);
        }
        updatedProducts += 1;
        if (description) productsWithDescription += 1;
        if (specs.length) productsWithSpecs += 1;
      }
    }

    return json(request, {
      refreshed: true,
      products_reviewed: products?.length || 0,
      products_updated: updatedProducts,
      products_with_description: productsWithDescription,
      products_with_specs: productsWithSpecs,
      api_requests: apiRequests,
      live_submission_enabled: false,
      ss_order_submitted: false,
      zerotouch_submitted: false,
    });
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
      .eq('brand', brand)
      .like('import_session_id', payload.style_session_id && /^ss-brand-(driduck|comfortcolors)-[a-zA-Z0-9T-]+$/.test(String(payload.style_session_id)) ? String(payload.style_session_id) : '%')
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
        owner_user_id: actorUserId,
        created_by_email: actorEmail,
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
          owner_user_id: actorUserId,
          created_by_email: actorEmail,
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
      if (payload.action === 'test_connection') {
        await userClient.rpc('record_ss_connection_result', {
          p_connected: false,
          p_message: message,
        });
      }
      return json(request, { error: message, upstream_status: response.status }, 502);
    }

    const result = await response.json();
    if (
      payload.action === 'preview_catalog'
      || payload.action === 'stage_styles'
      || payload.action === 'stage_brand_styles'
      || payload.action === 'stage_cold_weather_styles'
    ) {
      const { counts, samples, styles } = collectApprovedStyles(result);

      if (payload.action === 'stage_styles' || payload.action === 'stage_cold_weather_styles' || payload.action === 'stage_brand_styles') {
        const coldWeatherOnly = payload.action === 'stage_cold_weather_styles';
        const selectedBrand = payload.action === 'stage_brand_styles' ? canonicalApprovedBrand(payload.brand) : null;
        if (payload.action === 'stage_brand_styles' && !['Comfort Colors', 'DRI DUCK'].includes(selectedBrand || '')) {
          return json(request, { error: 'Only Comfort Colors or DRI DUCK can be staged with this action' }, 400);
        }
        const brandStyles = selectedBrand ? styles.filter(style => style.canonicalBrand === selectedBrand) : [];
        // These are the five existing private draft style names. S&S partNumber
        // is a different internal identifier for DRI DUCK and must not be used
        // as the draft style-number match.
        const driDuckDraftStyles = new Set(['3458', '5020', '7035', '9340', '9416']);
        const focusedDriDuck = selectedBrand === 'DRI DUCK'
          ? brandStyles.filter(style => driDuckDraftStyles.has(String(style.styleName || '').trim()))
          : [];
        const selectedStyles = selectedBrand === 'DRI DUCK'
          ? focusedDriDuck
          : selectedBrand === 'Comfort Colors'
            ? brandStyles.filter(style => ['00108', '00208', '00808', '00908', '10008', '70108'].includes(String(style.partNumber)))
            : coldWeatherOnly ? styles.filter(isColdWeatherStyle) : styles;
        if (selectedStyles.length === 0) {
          return json(request, { error: selectedBrand ? `No S&S styles were available for ${selectedBrand}` : 'No eligible S&S styles were available' }, 409);
        }

        const sessionPrefix = selectedBrand ? `ss-brand-${normalizeBrand(selectedBrand)}` : coldWeatherOnly ? 'ss-cold-weather' : 'ss-api';
        const sessionId = `${sessionPrefix}-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 8)}`;
        const rows = selectedStyles.map((style, index) => ({
          import_session_id: sessionId,
          file_name: coldWeatherOnly
            ? 'ss-activewear-api-v2-cold-weather-styles'
            : selectedBrand ? `ss-activewear-api-v2-${normalizeBrand(selectedBrand)}-styles` : 'ss-activewear-api-v2-styles',
          total_staged_rows: selectedStyles.length,
          row_number: index + 1,
          raw_row_data: JSON.stringify(style),
          brand: style.canonicalBrand,
          style_number: String(style.partNumber || ''),
          product_name: [style.canonicalBrand, style.styleName, style.title].filter(Boolean).join(' - '),
          product_category: style.baseCategory || null,
          image_url: imageUrl(style.styleImage),
          row_status: 'pending',
          owner_user_id: actorUserId,
          created_by_email: actorEmail,
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
          cold_weather_only: coldWeatherOnly,
          brand_counts: approvedBrands
            .map((brand) => ({
              brand,
              styles: selectedStyles.filter((style) => style.canonicalBrand === brand).length,
            }))
            .filter(({ styles: count }) => count > 0),
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

    const connectionResult = {
      connected: true,
      endpoint: 'S&S Activewear API v2',
      brands_available: Array.isArray(result) ? result.length : null,
      rate_limit_remaining: response.headers.get('x-rate-limit-remaining'),
      checked_at: new Date().toISOString(),
    };
    await userClient.rpc('record_ss_connection_result', {
      p_connected: true,
      p_message: 'S&S API connected (read-only test)',
    });
    return json(request, connectionResult);
  } catch (error) {
    console.error('S&S connection test request failed', error);
    if (payload.action === 'test_connection') {
      await userClient.rpc('record_ss_connection_result', {
        p_connected: false,
        p_message: 'Unable to reach the S&S API',
      });
    }
    return json(request, { error: 'Unable to reach the S&S API' }, 502);
  }
});
