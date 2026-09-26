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
    if (!['refresh_existing_candidates', 'refresh_sale_brand_variants', 'inspect_sale_candidates'].includes(input.action)) return reply({ error: 'Unsupported action' }, 400, origin);
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

    if (input.action === 'inspect_sale_candidates') {
      const brands = ['adidas', 'Adidas', 'American Apparel', 'Columbia'];
      const { data: products, error: productError } = await client.from('products')
        .select('id,brand,style_number,name,category,price,sale_price,image_url,stock,size_prices')
        .eq('visibility', 'public').eq('is_active', true).eq('is_sample', false);
      if (productError) throw productError;
      const targetProducts = (products || []).filter(product => brands.some(brand => brand.toLowerCase() === String(product.brand || '').trim().toLowerCase()));
      const styles = [...new Set(targetProducts.map(product => String(product.style_number || '').trim()).filter(Boolean))];
      const { data: staged, error: stagedError } = await client.from('ss_sku_staging')
        .select('sku,brand,part_number,color_name,size_name,inventory_qty,customer_price,sale_price,piece_price,sale_expiration,color_front_image,color_on_model_front_image,noe_retailing,fetched_at')
        .in('part_number', styles).order('fetched_at', { ascending: false }).limit(5000);
      if (stagedError) throw stagedError;
      const latest = new Map<string, Record<string, unknown>>();
      for (const row of staged || []) {
        const key = String(row.sku || '').toUpperCase();
        if (key && !latest.has(key)) latest.set(key, row);
      }
      const now = Date.now();
      const reports = targetProducts.map(product => {
        const variants = [...latest.values()].filter(row =>
          String(row.brand || '').toLowerCase() === String(product.brand || '').toLowerCase()
          && String(row.part_number || '').toUpperCase() === String(product.style_number || '').toUpperCase());
        const saleVariants = variants.filter(row => {
          const salePrice = number(row.sale_price);
          const expires = String(row.sale_expiration || '').trim();
          const expirationTime = expires ? new Date(expires).getTime() : Number.POSITIVE_INFINITY;
          return salePrice !== null && salePrice > 0 && expirationTime >= now;
        }).sort((a, b) => Number(b.inventory_qty || 0) - Number(a.inventory_qty || 0));
        const representative = saleVariants.find(row => Number(row.inventory_qty || 0) > 0 && !row.noe_retailing) || saleVariants[0];
        return {
          product_id: product.id,
          brand: product.brand,
          product_name: product.name,
          style: product.style_number,
          category: product.category,
          hc_customer_price: number(product.sale_price) || number(product.price),
          sku: representative?.sku || null,
          color: representative?.color_name || null,
          size: representative?.size_name || null,
          vendor_cost: number(representative?.customer_price),
          sale_price: number(representative?.sale_price),
          piece_price: number(representative?.piece_price),
          sale_expiration: representative?.sale_expiration || null,
          sale_field_source: representative ? 'S&S salePrice' : null,
          inventory: saleVariants.reduce((sum, row) => sum + Math.max(0, Number(row.inventory_qty || 0)), 0),
          image_url: representative?.color_front_image || representative?.color_on_model_front_image || product.image_url,
          fetched_at: representative?.fetched_at || null,
          is_current_sale: Boolean(representative),
        };
      }).filter(report => report.is_current_sale);
      return reply({ sale_candidates: reports, source: 'Authenticated S&S catalog salePrice and saleExpiration fields', ss_order_submitted: false }, 200, origin);
    }

    if (input.action === 'refresh_sale_brand_variants') {
      const brands = ['adidas', 'Adidas', 'American Apparel', 'Columbia'];
      const { data: products, error: productError } = await client.from('products')
        .select('brand,style_number').eq('visibility', 'public').eq('is_active', true).eq('is_sample', false);
      if (productError) throw productError;
      const targetProducts = (products || []).filter(product => brands.some(brand => brand.toLowerCase() === String(product.brand || '').trim().toLowerCase()));
      const styles = [...new Set(targetProducts.map(product => String(product.style_number || '').trim()).filter(Boolean))];
      if (!styles.length) return reply({ products_refreshed: 0, skus_refreshed: 0, message: 'No live requested-brand products found.' }, 200, origin);
      const { data: staged, error: stagedError } = await client.from('ss_sku_staging')
        .select('*').in('part_number', styles)
        .order('fetched_at', { ascending: false }).limit(5000);
      if (stagedError) throw stagedError;
      const latestBySku = new Map<string, Record<string, unknown>>();
      for (const row of staged || []) {
        const key = String(row.sku || '').toUpperCase();
        if (key && !latestBySku.has(key) && brands.some(brand => brand.toLowerCase() === String(row.brand || '').toLowerCase())) latestBySku.set(key, row);
      }
      const styleIds = [...new Set([...latestBySku.values()].map(row => number(row.style_id)).filter((value): value is number => value !== null))];
      if (!styleIds.length) return reply({ products_refreshed: 0, skus_refreshed: 0, message: 'No staged S&S style IDs found for the requested brands.' }, 200, origin);

      const returnedBySku = new Map<string, Record<string, unknown>>();
      let apiRequests = 0;
      for (let offset = 0; offset < styleIds.length; offset += 20) {
        const endpoint = new URL('https://api.ssactivewear.com/v2/products/');
        endpoint.searchParams.set('styleid', styleIds.slice(offset, offset + 20).join(','));
        endpoint.searchParams.set('fields', fields);
        endpoint.searchParams.set('mediatype', 'json');
        const response = await fetch(endpoint, {
          method: 'GET',
          headers: { Authorization: `Basic ${btoa(`${account}:${apiKey}`)}`, Accept: 'application/json' },
          signal: AbortSignal.timeout(30000),
        });
        apiRequests += 1;
        if (!response.ok) return reply({ error: `S&S read-only product lookup failed (${response.status})`, api_requests: apiRequests }, 502, origin);
        const result = await response.json();
        for (const row of Array.isArray(result) ? result : []) {
          const key = String(row.sku ?? row.Sku ?? '').toUpperCase();
          if (key && latestBySku.has(key)) returnedBySku.set(key, row);
        }
      }

      const fetchedAt = new Date().toISOString();
      const updates: Record<string, unknown>[] = [];
      const refreshedStyles = new Set<string>();
      let skipped = 0;
      for (const [sku, existing] of latestBySku) {
        const product = returnedBySku.get(sku);
        const price = number(product?.customerPrice ?? product?.CustomerPrice);
        const quantity = number(product?.qty ?? product?.Qty);
        const styleId = number(product?.styleID ?? product?.StyleID);
        if (!product || !price || price <= 0 || quantity === null || quantity < 0 || styleId !== number(existing.style_id)) {
          skipped += 1;
          continue;
        }
        updates.push({
          ...existing,
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
        });
        refreshedStyles.add(String(existing.part_number));
      }
      for (let offset = 0; offset < updates.length; offset += 100) {
        const { error: updateError } = await client.from('ss_sku_staging').upsert(updates.slice(offset, offset + 100), { onConflict: 'id' });
        if (updateError) throw updateError;
      }
      return reply({ products_refreshed: refreshedStyles.size, skus_refreshed: updates.length, candidate_products: targetProducts.length, skipped, api_requests: apiRequests, fetched_at: fetchedAt, products_created: 0, ss_order_submitted: false, storefront_prices_changed: false }, 200, origin);
    }

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
