import { createClient } from 'npm:@supabase/supabase-js@2';

const allowedOrigins = new Set([
  'http://localhost:5173', 'http://127.0.0.1:5173',
  'http://localhost:4173', 'http://127.0.0.1:4173',
  'https://hc-apparel-copy.vercel.app',
  'https://ilovehcapparel.net', 'https://www.ilovehcapparel.net',
]);

type StudioError = Error & { status?: number; code?: string };
const fail = (message: string, status = 400, code = 'invalid_request'): never => {
  const error = new Error(message) as StudioError;
  error.status = status;
  error.code = code;
  throw error;
};
const env = (name: string) => Deno.env.get(name)?.trim() || '';
const safeText = (value: unknown, max = 500) => String(value ?? '').trim().slice(0, max);
const reply = (body: unknown, status: number, origin: string) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json',
    'access-control-allow-origin': allowedOrigins.has(origin) ? origin : 'https://www.ilovehcapparel.net',
    'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
    'access-control-allow-methods': 'POST, OPTIONS',
  },
});

function decodeBase64(value: string) {
  try {
    const raw = atob(value);
    return Uint8Array.from(raw, char => char.charCodeAt(0));
  } catch { return fail('The uploaded file could not be decoded.'); }
}

function fileKind(bytes: Uint8Array) {
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return 'png';
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpg';
  const prefix = new TextDecoder().decode(bytes.slice(0, Math.min(bytes.length, 1024))).trim().toLowerCase();
  if (prefix.startsWith('<svg') || (prefix.startsWith('<?xml') && prefix.includes('<svg'))) return 'svg';
  return fail('Artwork must be a valid PNG, JPG/JPEG, or SVG file.');
}

function pngDimensions(bytes: Uint8Array) {
  if (bytes.length < 24) fail('The PNG is incomplete.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function pngMetadata(bytes: Uint8Array) {
  const dimensions = pngDimensions(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const colorType = bytes[25];
  let hasTransparency = colorType === 4 || colorType === 6;
  let resolutionX: number | null = null;
  let resolutionY: number | null = null;
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = new TextDecoder().decode(bytes.slice(offset + 4, offset + 8));
    if (type === 'tRNS') hasTransparency = true;
    if (type === 'pHYs' && length >= 9 && bytes[offset + 16] === 1) {
      resolutionX = Math.round(view.getUint32(offset + 8) * 0.0254);
      resolutionY = Math.round(view.getUint32(offset + 12) * 0.0254);
    }
    offset += length + 12;
    if (type === 'IEND') break;
  }
  return { ...dimensions, hasTransparency, resolutionX, resolutionY, containsEmbeddedRaster: false };
}

function jpegDimensions(bytes: Uint8Array) {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    const length = (bytes[offset + 2] << 8) + bytes[offset + 3];
    if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
      return { height: (bytes[offset + 5] << 8) + bytes[offset + 6], width: (bytes[offset + 7] << 8) + bytes[offset + 8] };
    }
    if (!length) break;
    offset += length + 2;
  }
  return fail('The JPEG dimensions could not be decoded.');
}


function jpegMetadata(bytes: Uint8Array) {
  const dimensions = jpegDimensions(bytes);
  let resolutionX: number | null = null;
  let resolutionY: number | null = null;
  let offset = 2;
  while (offset + 14 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    const length = (bytes[offset + 2] << 8) + bytes[offset + 3];
    if (marker === 0xe0 && new TextDecoder().decode(bytes.slice(offset + 4, offset + 9)) === 'JFIF\0') {
      const unit = bytes[offset + 9];
      const x = (bytes[offset + 10] << 8) + bytes[offset + 11];
      const y = (bytes[offset + 12] << 8) + bytes[offset + 13];
      if (unit === 1) { resolutionX = x; resolutionY = y; }
      if (unit === 2) { resolutionX = Math.round(x * 2.54); resolutionY = Math.round(y * 2.54); }
      break;
    }
    if (!length) break;
    offset += length + 2;
  }
  return { ...dimensions, hasTransparency: false, resolutionX, resolutionY, containsEmbeddedRaster: false };
}

function sanitizeSvg(bytes: Uint8Array) {
  let svg = new TextDecoder().decode(bytes);
  const externalOrUnsafeHref = /(?:href|xlink:href)\s*=\s*["']\s*(?:https?:|javascript:)/i.test(svg);
  const unsafeDataHref = /(?:href|xlink:href)\s*=\s*["']\s*data:(?!image\/(?:png|jpeg);base64,)/i.test(svg);
  if (/<\s*(script|foreignObject|iframe|object|embed|audio|video)|\son[a-z]+\s*=/i.test(svg) || externalOrUnsafeHref || unsafeDataHref) {
    fail('The SVG contains scripts, event handlers, embedded content, or external references and cannot be used.');
  }
  svg = svg.replace(/<\?xml[^>]*>/gi, '').replace(/<!doctype[^>]*>/gi, '').trim();
  const root = svg.match(/<svg\b([^>]*)>/i)?.[1] || '';
  const width = Number(root.match(/\bwidth=["']([0-9.]+)/i)?.[1] || 0);
  const height = Number(root.match(/\bheight=["']([0-9.]+)/i)?.[1] || 0);
  const viewBoxValues = root.match(/\bviewBox=["']([^"']+)["']/i)?.[1]
    ?.trim().split(/[ ,]+/).map(Number) || [];
  const decodedWidth = width || Number(viewBoxValues[2] || 0);
  const decodedHeight = height || Number(viewBoxValues[3] || 0);
  if (!decodedWidth || !decodedHeight) fail('SVG artwork needs numeric width/height or a valid viewBox.');
  return { bytes: new TextEncoder().encode(svg), width: Math.round(decodedWidth), height: Math.round(decodedHeight), hasTransparency: true, resolutionX: null, resolutionY: null, containsEmbeddedRaster: /<image\b/i.test(svg) };
}

async function sha256(bytes: Uint8Array) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
    .map(value => value.toString(16).padStart(2, '0')).join('');
}

function visitImageElements(document: Record<string, unknown>, callback: (element: Record<string, unknown>) => void) {
  const placements = document.placements && typeof document.placements === 'object' ? document.placements as Record<string, unknown[]> : {};
  for (const elements of Object.values(placements)) for (const value of elements || []) {
    const element = value as Record<string, unknown>;
    if (element.type === 'image' && element.assetId) callback(element);
  }
}

async function storedDocumentCopy(document: Record<string, unknown>) {
  const copy = structuredClone(document);
  visitImageElements(copy, element => { delete element.previewUrl; });
  return copy;
}

async function hydrateDocumentAssets(service: ReturnType<typeof createClient>, document: Record<string, unknown>, userId: string, isAdmin: boolean) {
  const copy = structuredClone(document);
  const ids: string[] = [];
  visitImageElements(copy, element => ids.push(String(element.assetId)));
  if (!ids.length) return copy;
  let query = service.from('design_assets').select('id,owner_user_id,storage_path').in('id', ids);
  if (!isAdmin) query = query.eq('owner_user_id', userId);
  const { data } = await query;
  const signed = new Map<string, string>();
  await Promise.all((data || []).map(async asset => {
    const { data: url } = await service.storage.from('customer-files').createSignedUrl(asset.storage_path, 3600);
    if (url?.signedUrl) signed.set(asset.id, url.signedUrl);
  }));
  visitImageElements(copy, element => { element.previewUrl = signed.get(String(element.assetId)) || ''; });
  return copy;
}

function validateDocument(document: Record<string, unknown>, areas: Record<string, unknown>[]) {
  const warnings: Record<string, unknown>[] = [];
  const selectedSize = safeText(document.size, 100);
  const placements = document.placements && typeof document.placements === 'object' ? document.placements as Record<string, unknown[]> : {};
  if (!safeText(document.productId, 100)) warnings.push({ code: 'product_missing', level: 'blocker', message: 'Choose an eligible garment.' });
  if (!safeText(document.color, 200) || !safeText(document.size, 100)) warnings.push({ code: 'variant_missing', level: 'blocker', message: 'Choose a color and size.' });
  if (!Object.values(placements).some(items => Array.isArray(items) && items.length)) warnings.push({ code: 'artwork_missing', level: 'blocker', message: 'Add a design element.' });
  for (const [placement, rawElements] of Object.entries(placements)) {
    if (!Array.isArray(rawElements) || !rawElements.length) continue;
    const area = areas.filter(item => item.placement === placement && item.enabled && item.verified)
      .sort((a, b) => Number(b.product_size === selectedSize) - Number(a.product_size === selectedSize))[0];
    if (!area || !Number(area.width_in) || !Number(area.height_in)) {
      warnings.push({ code: 'print_area_unverified', level: 'blocker', placement, message: 'Verified physical print dimensions are required.' });
      continue;
    }
    for (const value of rawElements) {
      const element = value as Record<string, unknown>;
      const x = Number(element.x), y = Number(element.y), width = Number(element.width), height = Number(element.height);
      if (![x,y,width,height].every(Number.isFinite) || x < 0 || y < 0 || x + width > 100 || y + height > 100) {
        warnings.push({ code: 'outside_print_area', level: 'blocker', placement, element_id: element.id, message: 'Artwork extends outside the printable area.' });
      }
      if (element.type === 'image' && Number(element.pixelWidth) > 0) {
        const dpi = Math.round(Number(element.pixelWidth) / Math.max(.01, (width / 100) * Number(area.width_in)));
        if (dpi < Number(area.min_dpi || 150)) warnings.push({ code: 'low_resolution', level: 'warning', placement, element_id: element.id, dpi, message: `Artwork is about ${dpi} DPI at this size.` });
      }
    }
  }
  return warnings;
}

async function printifyRequest(path: string, init: RequestInit = {}) {
  const token = env('PRINTIFY_API_TOKEN');
  if (!token) fail('Printify is not connected. Add PRINTIFY_API_TOKEN to Supabase Edge Function secrets after creating a scoped Personal Access Token.', 503, 'printify_not_connected');
  const response = await fetch(`https://api.printify.com/v1/${path.replace(/^\//, '')}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'user-agent': 'HC-Apparel-Design-Studio/1.0', 'content-type': 'application/json', ...(init.headers || {}) },
    signal: AbortSignal.timeout(25000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) fail(response.status === 401 ? 'Printify rejected the configured token.' : `Printify request failed (${response.status}).`, 502, 'printify_request_failed');
  return body;
}

Deno.serve(async request => {
  const origin = request.headers.get('origin') || '';
  if (request.method === 'OPTIONS') return reply({}, 200, origin);
  try {
    const supabaseUrl = env('SUPABASE_URL');
    const anonKey = env('SUPABASE_ANON_KEY');
    const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !anonKey || !serviceKey) fail('Design Studio server configuration is incomplete.', 503, 'server_config_missing');
    const authorization = request.headers.get('authorization') || '';
    const jwt = authorization.replace(/^Bearer\s+/i, '');
    const auth = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const service = createClient(supabaseUrl, serviceKey);
    const { data: { user } } = await auth.auth.getUser(jwt);
    if (!user) fail('Sign in to use the Design Studio.', 401, 'auth_required');
    const { data: profile } = await service.from('profiles').select('role').eq('id', user.id).maybeSingle();
    const isAdmin = profile?.role === 'admin';
    const payload = await request.json().catch(() => ({}));
    const action = safeText(payload.action, 80);

    if (action === 'status') {
      const [{ data: settings }, { data: printify }, { data: pricingConfigs }, { data: decorationMethods }, { data: pricingPackages }] = await Promise.all([
        service.from('design_studio_settings').select('*').eq('id', true).single(),
        service.from('printify_integration_settings').select('*').eq('id', true).single(),
        service.from('design_pricing_config').select('*').eq('active', true).order('effective_at', { ascending: false }),
        service.from('design_decoration_methods').select('*').order('customer_label'),
        service.from('design_pricing_packages').select('*').eq('active', true).order('effective_at', { ascending: false }),
      ]);
      if (!isAdmin && !settings?.public_studio_enabled) fail('The Design Studio is in admin preview.', 403, 'preview_only');
      let printifyConnection = { configured: false, verified: false, shop_count: 0, safe_error: '' };
      if (env('PRINTIFY_API_TOKEN')) {
        try {
          const shops = await printifyRequest('shops.json');
          printifyConnection = { configured: true, verified: true, shop_count: Array.isArray(shops) ? shops.length : 0, safe_error: '' };
          await service.from('printify_integration_settings').update({ connection_status: 'connected', catalog_read_enabled: true, last_verified_at: new Date().toISOString(), last_safe_error: null }).eq('id', true);
        } catch (error) {
          printifyConnection = { configured: true, verified: false, shop_count: 0, safe_error: (error as Error).message };
        }
      }
      return reply({ settings, pricing_configs: pricingConfigs || [], pricing_packages: pricingPackages || [], decoration_methods: decorationMethods || [], printify: { ...printify, ...printifyConnection, token_exposed: false } }, 200, origin);
    }

    if (!isAdmin) {
      const { data: settings } = await service.from('design_studio_settings').select('public_studio_enabled').eq('id', true).single();
      if (!settings?.public_studio_enabled) fail('The Design Studio is in admin preview.', 403, 'preview_only');
    }

    if (action === 'mockups') {
      const productId = safeText(payload.product_id, 100);
      const color = safeText(payload.color, 160);
      let query = service.from('design_mockup_mappings').select('*').eq('product_id', productId).order('verified', { ascending: false });
      if (color) query = query.in('color_key', ['*', color]);
      const { data, error } = await query;
      if (error) fail('Mapped garment views could not be loaded.', 500);
      const mockups = await Promise.all((data || []).map(async mapping => {
        let imageUrl = mapping.image_url || '';
        if (mapping.storage_path) {
          const { data: signed } = await service.storage.from(mapping.storage_bucket || 'customer-files').createSignedUrl(mapping.storage_path, 3600);
          imageUrl = signed?.signedUrl || '';
        }
        return { ...mapping, image_url: imageUrl, storage_path: undefined };
      }));
      return reply({ mockups }, 200, origin);
    }

    if (action === 'upload_mockup') {
      if (!isAdmin) fail('Admin access is required.', 403);
      const productId = safeText(payload.product_id, 100);
      const colorKey = safeText(payload.color_key || '*', 160);
      const view = safeText(payload.view, 40);
      const sourceNote = safeText(payload.source_note, 500);
      if (!['front','back','left_sleeve','right_sleeve'].includes(view)) fail('Choose a supported garment view.');
      if (!sourceNote) fail('Record the authorized source for this garment view.');
      const { data: product } = await service.from('products').select('id').eq('id', productId).maybeSingle();
      if (!product) fail('Product not found.', 404);
      const bytes = decodeBase64(String(payload.data || ''));
      if (!bytes.length || bytes.length > 15728640) fail('Garment mockup files must be smaller than 15 MB.');
      const kind = fileKind(bytes);
      if (kind === 'svg') fail('Garment mockups must be a photographic PNG or JPG.');
      const dimensions = kind === 'png' ? pngDimensions(bytes) : jpegDimensions(bytes);
      if (dimensions.width > 12000 || dimensions.height > 12000) fail('Garment mockup dimensions may not exceed 12,000 × 12,000 pixels.');
      const ext = kind === 'jpg' ? 'jpg' : 'png';
      const mime = kind === 'jpg' ? 'image/jpeg' : 'image/png';
      const path = `design-studio-mockups/${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await service.storage.from('customer-files').upload(path, bytes, { contentType: mime, upsert: false });
      if (uploadError) fail('The garment mockup could not be stored privately.', 500);
      const previewArea = payload.preview_area && typeof payload.preview_area === 'object' ? payload.preview_area : null;
      const { data: previous } = await service.from('design_mockup_mappings').select('storage_bucket,storage_path').eq('product_id', productId).eq('color_key', colorKey).eq('view', view).maybeSingle();
      const { data: mapping, error } = await service.from('design_mockup_mappings').upsert({
        product_id: productId, color_key: colorKey, view, image_url: null,
        storage_bucket: 'customer-files', storage_path: path, preview_area: previewArea,
        source_note: sourceNote, verified: true, verified_at: new Date().toISOString(), verified_by: user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'product_id,color_key,view' }).select('*').single();
      if (error) { await service.storage.from('customer-files').remove([path]); fail('The garment mockup mapping could not be saved.', 500); }
      if (previous?.storage_path && previous.storage_path !== path) await service.storage.from(previous.storage_bucket || 'customer-files').remove([previous.storage_path]);
      const { data: signed } = await service.storage.from('customer-files').createSignedUrl(path, 3600);
      return reply({ mockup: { ...mapping, image_url: signed?.signedUrl || '', storage_path: undefined }, server_validated: true }, 200, origin);
    }

    if (action === 'upload') {
      const originalName = safeText(payload.filename, 180).replace(/[^A-Za-z0-9._ -]/g, '-');
      const rawBytes = decodeBase64(String(payload.data || ''));
      const { data: settings } = await service.from('design_studio_settings').select('max_upload_bytes').eq('id', true).single();
      if (!rawBytes.length || rawBytes.length > Number(settings?.max_upload_bytes || 15728640)) fail(`Artwork must be smaller than ${Math.round(Number(settings?.max_upload_bytes || 15728640) / 1048576)} MB.`);
      const kind = fileKind(rawBytes);
      let bytes = rawBytes;
      let dimensions;
      if (kind === 'png') dimensions = pngMetadata(bytes);
      else if (kind === 'jpg') dimensions = jpegMetadata(bytes);
      else {
        const sanitized = sanitizeSvg(bytes); bytes = sanitized.bytes; dimensions = sanitized;
      }
      if (dimensions.width > 30000 || dimensions.height > 30000) fail('Artwork dimensions may not exceed 30,000 × 30,000 pixels.');
      const digest = await sha256(bytes);
      const ext = kind === 'jpg' ? 'jpg' : kind;
      const mime = kind === 'png' ? 'image/png' : kind === 'jpg' ? 'image/jpeg' : 'image/svg+xml';
      const path = `design-studio/${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await service.storage.from('customer-files').upload(path, bytes, { contentType: mime, upsert: false });
      if (uploadError) fail('Artwork could not be stored privately.', 500, 'storage_failed');
      const { data: asset, error: assetError } = await service.from('design_assets').insert({
        owner_user_id: user.id, design_id: payload.design_id || null, storage_path: path,
        original_filename: originalName || `artwork.${ext}`, mime_type: mime, byte_size: bytes.length,
        pixel_width: dimensions.width, pixel_height: dimensions.height, sha256: digest, svg_sanitized: kind === 'svg',
        file_kind: kind, has_transparency: dimensions.hasTransparency,
        resolution_x_ppi: dimensions.resolutionX, resolution_y_ppi: dimensions.resolutionY,
        contains_embedded_raster: dimensions.containsEmbeddedRaster,
      }).select('*').single();
      if (assetError) { await service.storage.from('customer-files').remove([path]); fail('Artwork metadata could not be saved.', 500); }
      const { data: signed } = await service.storage.from('customer-files').createSignedUrl(path, 3600);
      return reply({ asset, preview_url: signed?.signedUrl, server_validated: true }, 200, origin);
    }

    if (action === 'signed_asset_url') {
      const { data: asset } = await service.from('design_assets').select('owner_user_id,storage_path').eq('id', safeText(payload.asset_id, 80)).single();
      if (!asset || (asset.owner_user_id !== user.id && !isAdmin)) fail('Artwork is not available.', 404);
      const { data } = await service.storage.from('customer-files').createSignedUrl(asset.storage_path, 3600);
      return reply({ url: data?.signedUrl || '' }, 200, origin);
    }

    if (action === 'save') {
      const document = payload.document as Record<string, unknown>;
      if (!document || typeof document !== 'object') fail('A design document is required.');
      const productId = safeText(document.productId, 100);
      let product: Record<string, unknown> | null = null;
      if (productId) {
        const result = await service.from('products').select('*').eq('id', productId).maybeSingle();
        product = result.data;
        if (!product || product.visibility !== 'public' || !product.is_active) fail('The selected garment is not currently eligible.');
        const productText = `${product.brand || ''} ${product.name || ''}`.toLowerCase();
        if (productText.includes('columbia') || productText.includes('champion') || product.customization_restricted === true || product.customization_eligible === false) {
          fail('This product is restricted from Design Studio customization.');
        }
        const garmentType = safeText(product.primary_garment_type || product.category || product.product_subtype, 80).toLowerCase();
        const nameText = `${safeText(product.name, 300)} ${safeText(product.description, 500)} ${safeText(product.category, 100)} ${safeText(product.product_subtype, 100)}`.toLowerCase();
        if (/\b(?:jacket|coat|anorak|windbreaker|puffer|vest)\b/.test(nameText)) fail('Outerwear is not enabled for the current Design Studio rollout.');
        const eligibleType = ['t_shirts','hoodies','crewnecks'].includes(garmentType)
          || /\b(?:t-?shirt|tee|hoodie|hooded sweatshirt|crewneck|crew neck)\b/.test(nameText);
        if (!eligibleType) fail('Only eligible T-shirts, hoodies, and crewneck sweatshirts can be customized.');
      }
      const color = safeText(document.color, 160);
      const size = safeText(document.size, 80);
      const variants = product && Array.isArray(product.size_prices) ? product.size_prices : [];
      const selectedVariant = color && size ? variants.find((item: Record<string, unknown>) => {
        const raw = safeText(item.size, 240);
        const separator = raw.indexOf(' / ');
        const itemColor = safeText(item.color_name || item.color || (separator >= 0 ? raw.slice(0, separator) : ''), 160);
        const itemSize = safeText(separator >= 0 ? raw.slice(separator + 3) : raw, 80);
        return itemColor.toLowerCase() === color.toLowerCase() && itemSize.toLowerCase() === size.toLowerCase();
      }) : null;
      if (color && size && variants.length && (!selectedVariant || Number(selectedVariant.inventory ?? 0) <= 0)) fail('The selected catalog variant is not currently available.');
      const methodKey = safeText(document.decorationMethod || document.printMethod || 'dtf', 80);
      const { data: method } = await service.from('design_decoration_methods').select('*').eq('method_key', methodKey).maybeSingle();
      if (!method) fail('Choose a recognized print or decoration method.');
      if (method.draft_selectable === false) fail('This decoration method is not selectable for design drafts.');
      const route = safeText(method.production_route || 'hc_transfer_press', 80);
      const areasResult = productId && size
        ? await service.from('design_print_areas').select('*').eq('product_id', productId).eq('production_route', route).eq('print_method', methodKey).in('product_size', ['*', size])
        : { data: [] };
      const areas = areasResult.data || [];
      const warnings = validateDocument(document, areas || []);
      const persistedDocument = await storedDocumentCopy(document);
      const record = {
        owner_user_id: user.id, name: safeText(document.name || 'Untitled design', 160), product_id: productId || null,
        variant_sku: safeText(document.productSku, 160) || null, selected_color: safeText(document.color, 160) || null,
        selected_size: safeText(document.size, 80) || null, quantity: Math.max(1, Number(document.quantity) || 1),
        production_route: route, print_method: methodKey, document: { ...persistedDocument, decorationMethod: methodKey, printMethod: methodKey, productionRoute: route },
        validation: warnings, autosaved_at: new Date().toISOString(),
        ...(payload.explicit ? { status: 'saved', saved_at: new Date().toISOString() } : {}),
      };
      let saved;
      if (payload.design_id) {
        const { data: existing } = await service.from('design_documents').select('owner_user_id,status').eq('id', payload.design_id).maybeSingle();
        if (!existing || (existing.owner_user_id !== user.id && !isAdmin)) fail('Design not found.', 404);
        if (existing.status === 'ordered') fail('Ordered designs cannot be changed. Duplicate it instead.');
        const result = await service.from('design_documents').update({ ...record, updated_at: new Date().toISOString() }).eq('id', payload.design_id).select('*').single();
        if (result.error) fail(`Design could not be saved (database ${result.error.code || 'error'}).`, 500, result.error.code || 'design_update_failed'); saved = result.data;
      } else {
        const result = await service.from('design_documents').insert(record).select('*').single();
        if (result.error) fail(`Design could not be created (database ${result.error.code || 'error'}).`, 500, result.error.code || 'design_insert_failed'); saved = result.data;
      }
      let version = null;
      if (payload.create_version) {
        const { count } = await service.from('design_versions').select('*', { count: 'exact', head: true }).eq('design_id', saved.id);
        const checksum = await sha256(new TextEncoder().encode(JSON.stringify(record.document)));
        const result = await service.from('design_versions').insert({
          design_id: saved.id, owner_user_id: saved.owner_user_id, version_number: Number(count || 0) + 1,
          document_snapshot: record.document, production_spec_snapshot: {
            print_areas: areas || [], route, print_method: record.print_method,
            production_ready: Boolean(method.available), provider_key: method.provider_key || null,
            backup_production_route: method.backup_production_route || null,
            backup_provider_key: method.backup_provider_key || null,
          },
          validation_snapshot: warnings, checksum,
        }).select('id,version_number,checksum,created_at').single();
        if (result.error) fail(`The design saved, but its immutable version could not be created (database ${result.error.code || 'error'}).`, 500, result.error.code || 'design_version_failed'); version = result.data;
      }
      const referencedAssetIds: string[] = [];
      visitImageElements(document, element => referencedAssetIds.push(String(element.assetId)));
      if (referencedAssetIds.length) await service.from('design_assets').update({ design_id: saved.id }).eq('owner_user_id', user.id).in('id', referencedAssetIds);
      return reply({ design: saved, version, warnings }, 200, origin);
    }

    if (action === 'list') {
      let query = service.from('design_documents').select('id,name,status,product_id,selected_color,selected_size,quantity,production_route,print_method,validation,updated_at,saved_at,owner_user_id').is('archived_at', null).neq('status', 'archived').order('updated_at', { ascending: false }).limit(100);
      if (!isAdmin) query = query.eq('owner_user_id', user.id);
      const { data, error } = await query;
      if (error) fail('Designs could not be loaded.', 500);
      return reply({ designs: data || [] }, 200, origin);
    }

    if (action === 'load') {
      const { data } = await service.from('design_documents').select('*').eq('id', safeText(payload.design_id, 80)).maybeSingle();
      if (!data || (data.owner_user_id !== user.id && !isAdmin)) fail('Design not found.', 404);
      data.document = await hydrateDocumentAssets(service, data.document || {}, user.id, isAdmin);
      return reply({ design: data }, 200, origin);
    }

    if (action === 'attach_preview_cart') {
      if (!isAdmin) fail('Admin access is required for the isolated preview cart.', 403);
      const versionId = safeText(payload.design_version_id, 80);
      const { data: version } = await service.from('design_versions').select('*').eq('id', versionId).maybeSingle();
      if (!version || (version.owner_user_id !== user.id && !isAdmin)) fail('Saved design version not found.', 404);
      const { data: design } = await service.from('design_documents').select('*').eq('id', version.design_id).maybeSingle();
      if (!design || (design.owner_user_id !== user.id && !isAdmin)) fail('Saved design not found.', 404);
      const document = (version.document_snapshot || {}) as Record<string, unknown>;
      const productId = safeText(document.productId, 100);
      const methodKey = safeText(document.decorationMethod || document.printMethod || 'dtf', 80);
      const [{ data: method }, { data: product }, { data: configs }, { data: packages }] = await Promise.all([
        service.from('design_decoration_methods').select('*').eq('method_key', methodKey).maybeSingle(),
        productId ? service.from('products').select('*').eq('id', productId).maybeSingle() : Promise.resolve({ data: null }),
        service.from('design_pricing_config').select('*').eq('active', true),
        service.from('design_pricing_packages').select('*').eq('active', true).eq('method_key', methodKey),
      ]);
      const color = safeText(document.color, 160);
      const size = safeText(document.size, 80);
      const variants = product && Array.isArray(product.size_prices) ? product.size_prices : [];
      const selectedVariant = variants.find((item: Record<string, unknown>) => {
        const raw = safeText(item.size, 240);
        const separator = raw.indexOf(' / ');
        const itemColor = safeText(item.color_name || item.color || (separator >= 0 ? raw.slice(0, separator) : ''), 160);
        const itemSize = safeText(separator >= 0 ? raw.slice(separator + 3) : raw, 80);
        return itemColor.toLowerCase() === color.toLowerCase() && itemSize.toLowerCase() === size.toLowerCase();
      });
      const placementMap = document.placements && typeof document.placements === 'object' ? document.placements as Record<string, unknown[]> : {};
      const usedPlacements = Object.entries(placementMap).filter(([, elements]) => Array.isArray(elements) && elements.some(value => (value as Record<string, unknown>).visible !== false)).map(([placement]) => placement);
      const remaining = new Set(usedPlacements);
      let printingUnit = 0;
      for (const item of (packages || []).sort((a, b) => (b.placements?.length || 0) - (a.placements?.length || 0))) {
        const list = Array.isArray(item.placements) ? item.placements : [];
        if (list.length > 1 && list.every((placement: string) => remaining.has(placement))) {
          printingUnit += Number(item.service_price || 0);
          list.forEach((placement: string) => remaining.delete(placement));
        }
      }
      const missingPricing: string[] = [];
      for (const placement of remaining) {
        const candidates = (configs || []).filter(item => item.production_route === method?.production_route
          && (!item.product_id || item.product_id === productId)
          && (!item.print_method || item.print_method === methodKey)
          && item.placement === placement)
          .sort((a, b) => Number(Boolean(b.product_id)) - Number(Boolean(a.product_id)));
        if (!candidates[0] || candidates[0].service_price === null) missingPricing.push(placement);
        else printingUnit += Number(candidates[0].service_price || 0);
      }
      const blockers = Array.isArray(version.validation_snapshot) ? [...version.validation_snapshot] : [];
      if (!method?.available) blockers.push({
        code: 'fulfillment_not_configured', level: 'blocker',
        message: `${method?.customer_label || methodKey} production fulfillment is not configured. The saved design remains available for draft review.`,
      });
      const compatibleTypes = Array.isArray(method?.compatible_garment_types) ? method.compatible_garment_types : [];
      const compatiblePlacements = Array.isArray(method?.compatible_placements) ? method.compatible_placements : [];
      if (method && compatibleTypes.length && !compatibleTypes.includes(safeText(document.garmentType, 80))) blockers.push({ code: 'method_garment_incompatible', level: 'blocker', message: `${method.customer_label} is not enabled for this garment type.` });
      const incompatiblePlacements = usedPlacements.filter(placement => compatiblePlacements.length && !compatiblePlacements.includes(placement));
      if (incompatiblePlacements.length) blockers.push({ code: 'method_placement_incompatible', level: 'blocker', message: `${method?.customer_label || methodKey} is not enabled for: ${incompatiblePlacements.join(', ')}.` });
      if (missingPricing.length) blockers.push({ code: 'printing_price_missing', level: 'blocker', message: `Printing price is not configured for: ${missingPricing.join(', ')}.` });
      if (Number(document.quantity || 1) >= 50) blockers.push({ code: 'bulk_quote_required', level: 'blocker', message: 'Quantities of 50 or more use the Bulk Quote workflow.' });
      const garmentUnit = Number(selectedVariant?.price ?? product?.account_price ?? product?.price ?? 0);
      const pricingComplete = Boolean(product && selectedVariant && method?.available && !missingPricing.length && usedPlacements.length);
      const quantity = Math.max(1, Number(document.quantity) || 1);
      const checkoutReady = pricingComplete && !blockers.some(item => item.level === 'blocker');
      const record = {
        owner_user_id: user.id, design_id: design.id, design_version_id: version.id, design_checksum: version.checksum,
        product_id: productId || null, product_name: safeText(document.productName || product?.name, 300) || null,
        variant_sku: safeText(selectedVariant?.sku || document.productSku, 160) || null,
        variant_id: safeText(selectedVariant?.variant_id || selectedVariant?.id || document.variantId, 160) || null,
        selected_color: color || null, selected_size: size || null, quantity,
        decoration_method: methodKey, placements: usedPlacements,
        thumbnail_url: safeText(document.productImage || product?.image_url, 1500) || null,
        garment_unit_price: product ? garmentUnit : null,
        printing_unit_price: pricingComplete ? printingUnit : null,
        merchandise_total: pricingComplete ? (garmentUnit + printingUnit) * quantity : null,
        pricing_complete: pricingComplete, checkout_ready: checkoutReady, blockers,
        document_snapshot: document, admin_preview_only: true, updated_at: new Date().toISOString(),
      };
      const { data: existing } = await service.from('design_preview_cart_items').select('id')
        .eq('owner_user_id', user.id)
        .eq('design_id', design.id)
        .eq('design_checksum', version.checksum)
        .is('archived_at', null)
        .maybeSingle();
      const result = existing
        ? await service.from('design_preview_cart_items').update(record).eq('id', existing.id).select('*').single()
        : await service.from('design_preview_cart_items').insert(record).select('*').single();
      if (result.error) fail(`The preview cart could not be updated (database ${result.error.code || 'error'}).`, 500, result.error.code || 'preview_cart_failed');
      return reply({ item: result.data, duplicate_prevented: Boolean(existing) }, 200, origin);
    }

    if (action === 'list_preview_cart') {
      if (!isAdmin) fail('Admin access is required for the isolated preview cart.', 403);
      const { data, error } = await service.from('design_preview_cart_items').select('*').eq('owner_user_id', user.id).is('archived_at', null).order('updated_at', { ascending: false });
      if (error) fail('The preview cart could not be loaded.', 500);
      return reply({ items: data || [] }, 200, origin);
    }

    if (action === 'catalog_blueprints') {
      if (!isAdmin) fail('Admin access is required.', 403);
      const catalog = await printifyRequest(`catalog/blueprints.json${payload.page ? `?page=${Number(payload.page)}` : ''}`);
      return reply({ catalog }, 200, origin);
    }

    if (action === 'catalog_variants') {
      if (!isAdmin) fail('Admin access is required.', 403);
      const blueprint = encodeURIComponent(safeText(payload.blueprint_id, 30));
      const provider = encodeURIComponent(safeText(payload.print_provider_id, 30));
      const variants = await printifyRequest(`catalog/blueprints/${blueprint}/print_providers/${provider}/variants.json`);
      return reply({ variants }, 200, origin);
    }

    if (action === 'shipping_quote') {
      if (!isAdmin) fail('Admin access is required.', 403);
      const { data: mapping } = await service.from('design_provider_mappings').select('*').eq('id', safeText(payload.mapping_id, 80)).eq('provider', 'printify').eq('compatible', true).single();
      if (!mapping?.provider_shop_id || !mapping?.provider_variant_id) fail('A verified Printify product/variant mapping is required.');
      const address = payload.address_to || {};
      if (!safeText(address.country, 2) || !safeText(address.zip, 20)) fail('A destination country and postal code are required.');
      const lineItem = mapping.provider_product_id
        ? { product_id: mapping.provider_product_id, variant_id: Number(mapping.provider_variant_id), quantity: Math.max(1, Number(payload.quantity) || 1) }
        : { blueprint_id: Number(mapping.provider_blueprint_id), print_provider_id: Number(mapping.provider_print_provider_id), variant_id: Number(mapping.provider_variant_id), quantity: Math.max(1, Number(payload.quantity) || 1) };
      const quote = await printifyRequest(`shops/${encodeURIComponent(mapping.provider_shop_id)}/orders/shipping.json`, { method: 'POST', body: JSON.stringify({ line_items: [lineItem], address_to: address }) });
      return reply({ quote, currency: 'USD', live: true }, 200, origin);
    }

    if (action === 'prepare_job') {
      if (!isAdmin) fail('Admin access is required.', 403);
      const { data: version } = await service.from('design_versions').select('*').eq('id', safeText(payload.design_version_id, 80)).single();
      if (!version) fail('Saved design version not found.', 404);
      const blockers = (version.validation_snapshot || []).filter((item: Record<string, unknown>) => item.level === 'blocker');
      if (blockers.length) fail('Resolve all artwork and print-area blockers before production preparation.');
      const { data: job, error } = await service.from('design_production_jobs').insert({
        design_version_id: version.id, production_route: safeText(payload.production_route, 80),
        status: 'review_required', costs_complete: false,
      }).select('*').single();
      if (error) fail('Production review job could not be prepared.', 500);
      return reply({ job, submitted: false }, 200, origin);
    }

    if (action === 'submit_printify') {
      if (!isAdmin) fail('Admin access is required.', 403);
      const { data: settings } = await service.from('design_studio_settings').select('live_vendor_submission_enabled').eq('id', true).single();
      const { data: integration } = await service.from('printify_integration_settings').select('order_submission_enabled').eq('id', true).single();
      if (!settings?.live_vendor_submission_enabled || !integration?.order_submission_enabled) fail('Printify order submission is disabled.', 403, 'submission_disabled');
      const { data: job } = await service.from('design_production_jobs').select('*').eq('id', safeText(payload.job_id, 80)).single();
      if (!job?.payment_verified_at || !job?.artwork_approved_at || !payload.confirm_submission) fail('Verified payment, approved artwork, and explicit submission confirmation are required.');
      if (job.provider_order_id) return reply({ submitted: true, duplicate_prevented: true, provider_order_id: job.provider_order_id }, 200, origin);
      fail('Submission payload preparation is intentionally unavailable until a compatible mapping and connected Printify shop have passed admin QA.', 409, 'mapping_qa_required');
    }

    return fail('Unknown Design Studio action.', 404);
  } catch (error) {
    const safe = error as StudioError;
    console.error('[design-studio]', JSON.stringify({ name: safe.name, message: safe.message, code: safe.code || '', status: safe.status || 500 }));
    return reply({ error: safe.message || 'Design Studio request failed.', code: safe.code || 'server_error' }, safe.status || 500, origin);
  }
});
