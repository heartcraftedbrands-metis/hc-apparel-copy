import { createClient } from 'npm:@supabase/supabase-js@2';

const allowedOrigins = new Set([
  'https://www.ilovehcapparel.net',
  'https://ilovehcapparel.net',
  'https://hc-apparel-copy.vercel.app',
  'http://localhost:5173',
]);
const fields = [
  'Sku', 'BrandName', 'StyleID', 'ColorName', 'SizeName', 'Qty',
  'CustomerPrice', 'SalePrice', 'PiecePrice', 'DozenPrice', 'CasePrice',
  'RetailPrice', 'MapPrice', 'SaleExpiration', 'NoeRetailing',
].join(',');

function reply(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': allowedOrigins.has(origin) ? origin : 'https://www.ilovehcapparel.net',
      'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
      'access-control-allow-methods': 'POST, OPTIONS',
    },
  });
}
const number = (value: unknown) => {
  const parsed = Number(value);
  return value === null || value === undefined || value === '' || !Number.isFinite(parsed) ? null : parsed;
};

Deno.serve(async request => {
  const origin = request.headers.get('origin') || '';
  if (request.method === 'OPTIONS') return reply({}, 200, origin);
  if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405, origin);
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.toLowerCase().startsWith('bearer ')) return reply({ error: 'Admin sign-in required' }, 401, origin);
  try {
    const input = await request.json();
    if (input.action !== 'refresh_existing_candidates') return reply({ error: 'Unsupported action' }, 400, origin);
    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const account = Deno.env.get('SS_ACCOUNT_NUMBER');
    const apiKey = Deno.env.get('SS_API_KEY');
    if (!url || !anonKey || !account || !apiKey) return reply({ error: 'Server-side S&S connection is not configured' }, 503, origin);
    const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authorization } } });
    const jwt = authorization.replace(/^Bearer\s+/i, '');
    const { data: userResult, error: userError } = await client.auth.getUser(jwt);
    if (userError || !userResult.user) return reply({ error: 'Invalid session' }, 401, origin);
    const { data: isAdmin, error: adminError } = await client.rpc('is_admin');
    if (adminError || !isAdmin) return reply({ error: 'Admin access required' }, 403, origin);

    const { data: candidates, error: candidateError } = await client.rpc('homepage_special_candidates');
    if (candidateError) throw candidateError;
    const targets = (candidates || []).filter((row: Record<string, unknown>) => typeof row.sku === 'string' && row.sku);
    if (!targets.length) return reply({ products_refreshed: 0, skus_refreshed: 0, candidate_products: 0, skipped: 0, message: 'No existing catalog candidates found.' }, 200, origin);
    if (targets.length > 250) return reply({ error: 'Too many candidates for one controlled refresh' }, 409, origin);
    const bySku = new Map(targets.map((row: Record<string, unknown>) => [String(row.sku).toUpperCase(), row]));
    const stagingBySku = new Map<string, Record<string, unknown>>();
    const keys = [...bySku.keys()];
    for (let offset = 0; offset < keys.length; offset += 20) {
      const { data, error } = await client.from('ss_sku_staging')
        .select('id,sku,brand,style_id,fetched_at')
        .in('sku', keys.slice(offset, offset + 20))
        .order('fetched_at', { ascending: false }).limit(500);
      if (error) throw error;
      for (const row of data || []) {
        const key = String(row.sku).toUpperCase();
        if (!stagingBySku.has(key)) stagingBySku.set(key, row);
      }
    }

    let refreshed = 0;
    let skipped = 0;
    let apiRequests = 0;
    const refreshedProducts = new Set<string>();
    const fetchedAt = new Date().toISOString();
    for (let offset = 0; offset < keys.length; offset += 20) {
      const chunk = keys.slice(offset, offset + 20).filter(key => stagingBySku.has(key));
      if (!chunk.length) continue;
      const endpoint = new URL(`https://api.ssactivewear.com/v2/products/${chunk.map(encodeURIComponent).join(',')}`);
      endpoint.searchParams.set('fields', fields);
      endpoint.searchParams.set('mediatype', 'json');
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: { Authorization: `Basic ${btoa(`${account}:${apiKey}`)}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(30000),
      });
      apiRequests += 1;
      if (!response.ok) return reply({ error: `S&S read-only product lookup failed (${response.status})`, products_refreshed: refreshedProducts.size, skus_refreshed: refreshed, api_requests: apiRequests }, 502, origin);
      const result = await response.json();
      const responseRows = Array.isArray(result) ? result : [];
      const productBySku = new Map(responseRows.map((row: Record<string, unknown>) => [String(row.sku ?? row.Sku ?? '').toUpperCase(), row]));
      for (const sku of chunk) {
        const product = productBySku.get(sku) as Record<string, unknown> | undefined;
        const existing = stagingBySku.get(sku);
        const expected = bySku.get(sku);
        const price = number(product?.customerPrice ?? product?.CustomerPrice);
        const quantity = number(product?.qty ?? product?.Qty);
        const styleId = number(product?.styleID ?? product?.StyleID);
        if (!product || !existing || !expected || !price || price <= 0 || quantity === null || quantity < 0 || styleId !== number(existing.style_id)) {
          skipped += 1;
          continue;
        }
        const changes = {
          customer_price: price,
          sale_price: number(product.salePrice ?? product.SalePrice),
          piece_price: number(product.piecePrice ?? product.PiecePrice),
          dozen_price: number(product.dozenPrice ?? product.DozenPrice),
          case_price: number(product.casePrice ?? product.CasePrice),
          retail_price: number(product.retailPrice ?? product.RetailPrice),
          map_price: number(product.mapPrice ?? product.MapPrice),
          sale_expiration: String(product.saleExpiration ?? product.SaleExpiration ?? '').trim() || null,
          inventory_qty: Math.floor(quantity),
          noe_retailing: Boolean(product.noeRetailing ?? product.NoeRetailing),
          fetched_at: fetchedAt,
        };
        const { data: updated, error: updateError } = await client.from('ss_sku_staging')
          .update(changes).eq('id', existing.id).eq('sku', existing.sku).select('id').maybeSingle();
        if (updateError) throw updateError;
        if (updated) {
          refreshed += 1;
          refreshedProducts.add(String(expected.product_id));
        } else skipped += 1;
      }
    }
    return reply({ products_refreshed: refreshedProducts.size, skus_refreshed: refreshed, candidate_products: targets.length, skipped, api_requests: apiRequests, fetched_at: fetchedAt, products_created: 0, ss_order_submitted: false, storefront_prices_changed: false }, 200, origin);
  } catch (error) {
    console.error('Homepage specials S&S refresh failed', error);
    return reply({ error: 'Unable to complete the restricted S&S refresh. No order was submitted.' }, 500, origin);
  }
});
