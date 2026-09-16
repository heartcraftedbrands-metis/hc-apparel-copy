import { createClient } from 'npm:@supabase/supabase-js@2';

const origins = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:4174',
  'http://127.0.0.1:4174',
  'https://hc-apparel-copy.vercel.app',
  'https://ilovehcapparel.net',
  'https://www.ilovehcapparel.net',
]);

const options = {
  platform: ['instagram', 'facebook', 'x', 'pinterest', 'tiktok', 'linkedin', 'youtube', 'threads', 'bluesky', 'google'],
  content_type: ['Product Promo', 'Brand Promo', 'Sale Post', 'New Arrival', 'Seasonal Post', 'Bulk Order', 'Custom Printing'],
  category: ['', 't_shirts', 'hoodies', 'fleece', 'outerwear', 'hats', 'bags', 'tank_tops', 'womens', 'sportswear', 'crewnecks', 'long_sleeve', 'polos'],
  brand: ['HC Apparel', 'Shaka Wear', 'Champion', 'Columbia', 'Bella + Canvas', 'Gildan', 'Comfort Colors', 'Next Level', 'Independent Trading Co.', 'Port & Company', 'Hanes', 'District', 'Rabbit Skins', 'Lane Seven', 'adidas', 'Oakley'],
  tone: ['professional', 'bold', 'clean', 'modern', 'premium', 'streetwear'],
  audience: ['brands', 'teams', 'creators', 'churches', 'schools', 'businesses'],
  caption_length: ['short', 'medium', 'long'],
  cta: ['Shop Blanks', 'Order Blanks', 'Request Bulk Quote', 'Start Your Brand', 'Explore Collection'],
} as const;

const categoryDetails: Record<string, { label: string; database: string[]; visual: string }> = {
  t_shirts: { label: 'T-Shirts', database: ['short_sleeve_shirts', 'mens_short_sleeve_shirts', 'womens_short_sleeve_shirts', 'youth_short_sleeve_shirts'], visual: 'blank t-shirts and tees' },
  hoodies: { label: 'Hoodies', database: ['hoodies'], visual: 'blank hoodies' },
  fleece: { label: 'Fleece', database: ['crewnecks', 'hoodies'], visual: 'blank fleece tops' },
  outerwear: { label: 'Outerwear', database: ['jackets', 'mens_jackets', 'womens_jackets', 'youth_jackets'], visual: 'blank jackets and outerwear' },
  hats: { label: 'Hats', database: ['hats'], visual: 'blank hats and caps' },
  bags: { label: 'Bags', database: ['accessories'], visual: 'blank bags' },
  tank_tops: { label: 'Tank Tops', database: ['short_sleeve_shirts'], visual: 'blank tank tops' },
  womens: { label: "Women's Styles", database: ['womens_short_sleeve_shirts', 'womens_long_sleeve_shirts', 'womens_crewnecks', 'womens_polo_shirts', 'womens_jackets', 'womens_sportswear'], visual: "women's blank apparel" },
  sportswear: { label: 'Sports / Activewear', database: ['sportswear', 'mens_sportswear', 'womens_sportswear', 'youth_sportswear'], visual: 'blank activewear and sports apparel' },
  crewnecks: { label: 'Crewnecks / Sweatshirts', database: ['crewnecks', 'mens_crewnecks', 'womens_crewnecks', 'youth_crewnecks'], visual: 'blank crewneck sweatshirts' },
  long_sleeve: { label: 'Long Sleeve', database: ['long_sleeve_shirts', 'mens_long_sleeve_shirts', 'womens_long_sleeve_shirts', 'youth_long_sleeve_shirts'], visual: 'blank long-sleeve shirts' },
  polos: { label: 'Polos', database: ['polo_shirts', 'mens_polo_shirts', 'womens_polo_shirts', 'youth_polo_shirts'], visual: 'blank polo shirts' },
};

const knownBrands = ['Shaka Wear', 'Champion', 'Columbia', 'Bella + Canvas', 'Gildan', 'Comfort Colors', 'Next Level', 'Independent Trading Co.', 'Port & Company', 'Hanes', 'District', 'Rabbit Skins', 'Lane Seven', 'adidas', 'Oakley'];
const colorNames = (value: unknown) => Array.isArray(value) ? value.map(item => typeof item === 'string' ? item : item?.name || item?.color_name || item?.color || '').filter(Boolean).map(String) : [];
const productBrand = (product: Record<string, unknown>) => {
  if (product.brand) return String(product.brand);
  const name = String(product.name || '').toLowerCase();
  const tags = Array.isArray(product.tags) ? product.tags.map(String) : [];
  return knownBrands.find(brand => name.startsWith(brand.toLowerCase()) || tags.some(tag => tag.toLowerCase() === brand.toLowerCase())) || '';
};

function productImageUrl(value: unknown) {
  const raw = limited(value, 2000);
  if (!raw) return '';
  const normalized = raw.startsWith('Images/') || raw.startsWith('/Images/')
    ? `https://www.ssactivewear.com/${raw.replace(/^\//, '')}` : raw;
  try {
    const url = new URL(normalized);
    if (url.protocol === 'https:') return url.toString();
  } catch { /* An unusable catalog path is not an image. */ }
  return '';
}

function artworkFileType(bytes: Uint8Array) {
  if (bytes.length >= 8 && bytes.slice(0, 8).every((byte, index) => byte === [137, 80, 78, 71, 13, 10, 26, 10][index])) return { ext: 'png', mime: 'image/png' };
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return { ext: 'jpg', mime: 'image/jpeg' };
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  fail('Artwork must be a PNG, JPG/JPEG, or WEBP image.');
}

async function artworkUrl(service: ReturnType<typeof createClient>, path: unknown, userId: string) {
  const candidate = String(path || '');
  const prefix = `social-studio/artwork/${userId}/`;
  if (!candidate.startsWith(prefix) || !/^social-studio\/artwork\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|webp)$/.test(candidate)) fail('Choose artwork uploaded by this admin.');
  const filename = candidate.slice(prefix.length);
  const { data, error } = await service.storage.from('storefront-assets').list(prefix.replace(/\/$/, ''), { search: filename, limit: 10 });
  if (error || !data?.some(item => item.name === filename)) fail('Uploaded artwork could not be found. Upload it again.');
  return service.storage.from('storefront-assets').getPublicUrl(candidate).data.publicUrl;
}

type StudioError = Error & { status?: number };
const fail = (message: string, status = 400): never => {
  const error = new Error(message) as StudioError;
  error.status = status;
  throw error;
};

const reply = (body: unknown, status = 200, origin = '') => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json',
    'access-control-allow-origin': origins.has(origin) ? origin : 'https://www.ilovehcapparel.net',
    'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
  },
});

function pick(value: unknown, allowed: readonly string[], label: string) {
  if (typeof value !== 'string' || !allowed.includes(value)) fail(`Choose a valid ${label}.`);
  return value as string;
}

function limited(value: unknown, max: number) {
  return String(value ?? '').trim().slice(0, max);
}

function websiteLink(value: unknown) {
  const raw = limited(value || 'www.ilovehcapparel.net', 300);
  let url: URL;
  try { url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); }
  catch { return fail('Enter a valid HC Apparel website link.'); }
  if (!['ilovehcapparel.net', 'www.ilovehcapparel.net'].includes(url.hostname.toLowerCase())
    || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port || url.search || url.hash) {
    fail('Website / CTA Link must be an HC Apparel site URL without a query or fragment.');
  }
  return `www.ilovehcapparel.net${url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '')}`;
}

function withWebsiteCta(caption: string, link: string) {
  const withoutExistingLink = caption
    .replace(/\[[^\]]*\]\((?:https?:\/\/)?(?:www\.)?ilovehcapparel\.net[^)]*\)/gi, '')
    .replace(/(?:https?:\/\/)?(?:www\.)?ilovehcapparel\.net(?:\/[^\s,.!?)]*)?/gi, '')
    .replace(/Shop blanks and printing:\s*/gi, '')
    .replace(/[ \t]+([,.!?])/g, '$1').trim();
  return `${withoutExistingLink}\n\nShop blanks and printing: ${link}`;
}

function env(name: string) { return Deno.env.get(name)?.trim() || ''; }

function bytesToBase64(bytes: Uint8Array) {
  let raw = '';
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw);
}

function credentialKey() {
  const raw = env('SOCIAL_STUDIO_ENCRYPTION_KEY');
  if (!raw) fail('Set SOCIAL_STUDIO_ENCRYPTION_KEY on the Supabase function before connecting Buffer.', 503);
  try {
    const bytes = Uint8Array.from(atob(raw), char => char.charCodeAt(0));
    if (bytes.length !== 32) throw new Error('invalid length');
    return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
  } catch {
    return fail('SOCIAL_STUDIO_ENCRYPTION_KEY must be a base64-encoded 32-byte key.', 503);
  }
}

async function encryptKey(secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, await credentialKey(), new TextEncoder().encode(secret),
  ));
  return { ciphertext: bytesToBase64(ciphertext), iv: bytesToBase64(iv) };
}

async function bufferKey(service: ReturnType<typeof createClient>) {
  const { data, error } = await service.from('social_studio_buffer_credentials')
    .select('ciphertext,iv').eq('id', true).maybeSingle();
  if (error) fail('Buffer connection settings are unavailable. Apply the Social Media Studio migration.', 503);
  if (!data) return env('BUFFER_API_KEY');
  const ciphertext = Uint8Array.from(atob(data.ciphertext), char => char.charCodeAt(0));
  const iv = Uint8Array.from(atob(data.iv), char => char.charCodeAt(0));
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await credentialKey(), ciphertext);
    return new TextDecoder().decode(plain);
  } catch {
    return fail('Stored Buffer credential cannot be decrypted. Reconnect Buffer with the configured encryption key.', 503);
  }
}

async function bufferRequest(key: string, query: string) {
  if (!key) fail('Buffer is not connected. Add an API key in Buffer connection settings.', 503);
  const response = await fetch('https://api.buffer.com', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) fail(response.status === 401 ? 'Buffer rejected the API key.' : `Buffer request failed (${response.status}).`, 502);
  const body = await response.json();
  if (body.errors?.length) fail(`Buffer: ${body.errors[0].message || 'API error'}`, 502);
  return body.data;
}

async function channels(key: string) {
  const account = await bufferRequest(key, 'query { account { organizations { id name } } }');
  const organizations = account?.account?.organizations || [];
  const groups = await Promise.all(organizations.map(async (organization: { id: string; name: string }) => {
    const data = await bufferRequest(key, `query { channels(input: { organizationId: ${JSON.stringify(organization.id)} }) { id name service isDisconnected isLocked } }`);
    return (data?.channels || []).map((channel: Record<string, unknown>) => ({
      ...channel, organization_name: organization.name,
    }));
  }));
  return await Promise.all(groups.flat().map(async channel => {
    if (String(channel.service).toLowerCase() !== 'pinterest') return channel;
    try {
      const detail = await bufferRequest(key, `query { channel(input: { id: ${JSON.stringify(channel.id)} }) { metadata { ... on PinterestMetadata { boards { name serviceId } } } } }`);
      return { ...channel, boards: detail?.channel?.metadata?.boards || [] };
    } catch (error) {
      return { ...channel, boards: [], board_error: (error as Error).message };
    }
  }));
}

async function openaiRequest(url: string, key: string, body: BodyInit, json = true) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, ...(json ? { 'content-type': 'application/json' } : {}) },
    body,
    signal: AbortSignal.timeout(110000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) fail(`OpenAI: ${result.error?.message || `request failed (${response.status})`}`, 502);
  return result;
}

async function sourceImageBlob(url: string) {
  const normalized = url.startsWith('Images/') || url.startsWith('/Images/')
    ? `https://www.ssactivewear.com/${url.replace(/^\//, '')}`
    : url;
  let parsed: URL;
  try { parsed = new URL(normalized); }
  catch { return fail('The selected product image does not have a usable URL.'); }
  if (parsed.protocol !== 'https:' || parsed.hostname === 'localhost' || parsed.hostname.endsWith('.local')
    || parsed.hostname.startsWith('[') || /^(\d+\.){3}\d+$/.test(parsed.hostname)) {
    fail('The selected product image must have a safe HTTPS URL.');
  }
  const response = await fetch(parsed.toString(), { redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok) fail('Could not load the selected product image for generation.', 502);
  const type = response.headers.get('content-type')?.split(';')[0] || '';
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(type)) fail('The selected product image must be PNG, JPEG, or WebP.');
  if (Number(response.headers.get('content-length') || 0) > 10 * 1024 * 1024) fail('The selected product image is larger than 10 MB.');
  const reader = response.body?.getReader();
  if (!reader) fail('The selected product image could not be read.');
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > 10 * 1024 * 1024) {
      await reader.cancel();
      fail('The selected product image is larger than 10 MB.');
    }
    chunks.push(value);
  }
  return new Blob(chunks, { type });
}

Deno.serve(async request => {
  const origin = request.headers.get('origin') || '';
  if (request.method === 'OPTIONS') return reply({}, 200, origin);
  try {
    if (request.method !== 'POST') fail('Method not allowed.', 405);
    const jwt = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
    if (!jwt) fail('Admin sign-in is required.', 401);
    const supabaseUrl = env('SUPABASE_URL');
    const anonKey = env('SUPABASE_ANON_KEY');
    const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !anonKey || !serviceKey) fail('Supabase function credentials are missing.', 503);
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
    const { data: auth, error: authError } = await userClient.auth.getUser(jwt);
    if (authError || !auth.user) fail('Admin sign-in is required.', 401);
    const { data: admin, error: roleError } = await userClient.rpc('is_admin');
    if (roleError || !admin) fail('Admin access is required.', 403);
    const service = createClient(supabaseUrl, serviceKey);
    const isUpload = request.headers.get('content-type')?.includes('multipart/form-data');
    const input = isUpload ? await request.formData() : await request.json().catch(() => ({}));
    const action = isUpload ? input.get('action') : input.action;

    if (action === 'upload_artwork') {
      if (!isUpload) fail('Choose an artwork file to upload.');
      const file = input.get('file');
      if (!(file instanceof File) || !file.size || file.size > 10 * 1024 * 1024) fail('Choose a PNG, JPG/JPEG, or WEBP image under 10 MB.');
      const bytes = new Uint8Array(await file.arrayBuffer());
      const type = artworkFileType(bytes);
      const path = `social-studio/artwork/${auth.user.id}/${crypto.randomUUID()}.${type.ext}`;
      const { error } = await service.storage.from('storefront-assets').upload(path, bytes, { contentType: type.mime, upsert: false });
      if (error) fail('Artwork could not be saved. Try again.', 503);
      return reply({ path, url: service.storage.from('storefront-assets').getPublicUrl(path).data.publicUrl }, 200, origin);
    }

    if (action === 'replace_artwork') {
      const url = await artworkUrl(service, input.artwork_path, auth.user.id);
      const { data, error } = await service.from('social_studio_posts').update({ image_mode: 'artwork', artwork_path: input.artwork_path, image_url: url, source_image_url: url, updated_at: new Date().toISOString() })
        .eq('id', String(input.post_id || '')).eq('status', 'draft').is('buffer_post_id', null).select().maybeSingle();
      if (error || !data) fail('Only an unsent HC Apparel draft can have its artwork replaced.');
      await service.from('social_studio_draft_audit').insert({ actor_id: auth.user.id, post_id: data.id, action: 'artwork_replaced', details: { artwork_path: input.artwork_path } });
      return reply({ post: data }, 200, origin);
    }

    if (action === 'update_draft_platform') {
      const platform = pick(input.platform, options.platform, 'platform');
      const id = String(input.post_id || '');
      const { data: original, error: readError } = await service.from('social_studio_posts')
        .select('*').eq('id', id).eq('status', 'draft').is('buffer_post_id', null).maybeSingle();
      if (readError || !original) fail('Only an unsent HC Apparel draft can change platforms.');
      if (original.platform === platform) return reply({ post: original, unchanged: true }, 200, origin);
      const { data: updated, error: updateError } = await service.from('social_studio_posts')
        .update({ platform, updated_at: new Date().toISOString() })
        .eq('id', id).eq('platform', original.platform).eq('status', 'draft').is('buffer_post_id', null).select().maybeSingle();
      if (updateError || !updated) fail('The draft platform could not be changed. Reload and try again.');
      await service.from('social_studio_draft_audit').insert({ actor_id: auth.user.id, post_id: id, action: 'platform_changed', details: { from: original.platform, to: platform } });
      return reply({ post: updated }, 200, origin);
    }

    if (action === 'duplicate_draft') {
      const { data: original, error } = await service.from('social_studio_posts').select('*').eq('id', String(input.post_id || '')).eq('status', 'draft').maybeSingle();
      if (error || !original) fail('Only an HC Apparel draft can be duplicated.');
      const { data: copy, error: copyError } = await service.from('social_studio_posts').insert({
        created_by: auth.user.id, platform: original.platform, content_type: original.content_type, brand: original.brand,
        category: original.category, product_id: original.product_id, product_name: original.product_name,
        tone: original.tone, audience: original.audience, caption_length: original.caption_length, cta: original.cta,
        include_hashtags: original.include_hashtags, notes: original.notes, image_prompt: original.image_prompt,
        source_image_url: original.source_image_url, image_url: original.image_url, image_mode: original.image_mode,
        artwork_path: original.artwork_path, caption: original.caption, hashtags: original.hashtags, status: 'draft',
      }).select().single();
      if (copyError) fail('Could not duplicate this draft.', 503);
      await service.from('social_studio_draft_audit').insert({ actor_id: auth.user.id, post_id: original.id, action: 'duplicated', details: { new_post_id: copy.id } });
      return reply({ post: copy }, 200, origin);
    }

    if (action === 'delete_draft') {
      const { data: deleted, error } = await service.from('social_studio_posts').delete().eq('id', String(input.post_id || ''))
        .eq('status', 'draft').is('buffer_post_id', null).select('id,artwork_path').maybeSingle();
      if (error || !deleted) fail('Only an unsent HC Apparel draft can be deleted.');
      const { error: auditError } = await service.from('social_studio_draft_audit').insert({ actor_id: auth.user.id, post_id: deleted.id, action: 'deleted', details: { artwork_path: deleted.artwork_path, media_disposition: 'retained_unreferenced' } });
      if (auditError) fail('Draft was deleted, but its audit entry could not be saved. Do not retry.', 503);
      return reply({ deleted: true, post_id: deleted.id }, 200, origin);
    }

    if (action === 'status') {
      const key = await bufferKey(service);
      let connectedChannels: unknown[] = [];
      let bufferError = '';
      if (key) {
        try { connectedChannels = await channels(key); }
        catch (error) { bufferError = (error as Error).message; }
      }
      return reply({ openai_configured: Boolean(env('OPENAI_API_KEY')), buffer_configured: Boolean(key), channels: connectedChannels, buffer_error: bufferError }, 200, origin);
    }

    if (action === 'connect_buffer') {
      const key = limited(input.api_key, 500);
      if (!key) fail('Enter a Buffer API key.');
      const connectedChannels = await channels(key);
      const encrypted = await encryptKey(key);
      const { error } = await service.from('social_studio_buffer_credentials').upsert({ id: true, ...encrypted, updated_at: new Date().toISOString() });
      if (error) fail('Could not save the encrypted Buffer credential. Apply the Studio migration.', 503);
      return reply({ connected: true, channels: connectedChannels }, 200, origin);
    }

    if (action === 'search_products') {
      const term = limited(input.query, 80).replace(/[^a-zA-Z0-9 +&-]/g, '').trim();
      if (term.length < 2) return reply({ products: [] }, 200, origin);
      const pattern = `%${term}%`;
      const { data, error } = await service.from('products')
        .select('id,name,brand,category,supplier_sku,vendor_source,image_url,mockup_images,available_colors,size_prices,price')
        .or(`name.ilike.${pattern},brand.ilike.${pattern},supplier_sku.ilike.${pattern},vendor_source.ilike.${pattern}`)
        .eq('visibility', 'public').eq('is_active', true).eq('product_type', 'physical')
        .order('name').limit(20);
      if (error) fail('Product search failed. Please try again.', 503);
      return reply({ products: data || [] }, 200, origin);
    }

    if (action === 'generate') {
      const key = env('OPENAI_API_KEY');
      if (!key) fail('OPENAI_API_KEY is missing from the Supabase function secrets.', 503);
      const platform = pick(input.platform, options.platform, 'platform');
      const contentType = pick(input.content_type, options.content_type, 'content type');
      const category = pick(input.category ?? '', options.category, 'category');
      const brand = pick(input.brand, options.brand, 'brand');
      const tone = pick(input.tone, options.tone, 'tone');
      const audience = pick(input.audience, options.audience, 'audience');
      const captionLength = pick(input.caption_length, options.caption_length, 'caption length');
      const cta = pick(input.cta, options.cta, 'CTA');
      const website = websiteLink(input.website_link);
      const notes = limited(input.notes, 1000);
      const includeHashtags = input.include_hashtags !== false;
      let product: Record<string, unknown> | null = null;
      if (input.product_id) {
        const { data, error } = await service.from('products')
          .select('id,name,brand,style_number,description,category,categories,tags,price,available_sizes,available_colors,size_prices,image_url,mockup_images,vendor_specs,fabric_material,garment_weight,fit,features,vendor_source,supplier_sku,visibility,is_active,product_type')
          .eq('id', String(input.product_id)).maybeSingle();
        if (error || !data) fail('Selected product was not found.');
        if (data.visibility !== 'public' || !data.is_active || data.product_type !== 'physical') fail('Choose a live apparel product from the storefront.');
        product = data;
      }
      const selectedColor = limited(input.product_color, 100);
      const availableColors = product ? colorNames(product.available_colors) : [];
      if (selectedColor && !availableColors.includes(selectedColor)) fail('Choose an available color for the selected product.');
      const imageMode = pick(input.image_mode ?? 'product', ['product', 'lifestyle', 'artwork'], 'image mode');
      let catalogExamples: Record<string, unknown>[] = [];
      if (!product && imageMode !== 'artwork') {
        let query = service.from('products')
          .select('name,brand,category,price,tags,image_url,vendor_source')
          .eq('visibility', 'public').eq('is_active', true).eq('product_type', 'physical')
          .not('image_url', 'is', null).neq('image_url', '');
        if (category) query = query.in('category', categoryDetails[category].database);
        else if (brand === 'HC Apparel') query = query.in('category', categoryDetails.t_shirts.database);
        if (brand !== 'HC Apparel') query = query.or(`brand.ilike.%${brand}%,name.ilike.%${brand}%`);
        const { data, error } = await query.order('name').limit(20);
        if (error) fail('Could not load live catalog examples for this campaign.', 503);
        catalogExamples = (data || []).filter(item => productImageUrl(item.image_url));
        if (brand !== 'HC Apparel' && !catalogExamples.length) fail(`No live ${brand} products were found for this selection. Choose another brand or category.`);
      }
      const artworkPath = imageMode === 'artwork' ? String(input.artwork_path || '') : '';
      const uploadedArtworkUrl = imageMode === 'artwork' ? await artworkUrl(service, artworkPath, auth.user.id) : '';
      const primaryImageUrl = productImageUrl(product?.image_url);
      const selectedVariant = selectedColor && Array.isArray(product?.size_prices)
        ? product.size_prices.find((item: Record<string, unknown>) => String(item.size || '').startsWith(`${selectedColor} /`) && productImageUrl(item.image_url)) : null;
      if (selectedColor && imageMode === 'product' && !selectedVariant) fail('No catalog image matches that color. Choose another color, clear the color, or use lifestyle mode.');
      const catalogImageUrl = productImageUrl(selectedVariant?.image_url) || primaryImageUrl;
      const representative = !product ? catalogExamples[0] : null;
      const representativeImageUrl = productImageUrl(representative?.image_url);
      const imageChoices = product ? [product?.image_url, ...(Array.isArray(product.mockup_images) ? product.mockup_images : [])]
        .map(item => productImageUrl(typeof item === 'string' ? item : item?.image_url || item?.url || item?.src || ''))
        .filter(Boolean) : [];
      const imageIndex = Number(input.product_image_index);
      const sourceImageUrl = product && imageMode === 'lifestyle' && Number.isInteger(imageIndex) && imageIndex >= 0
        ? String(imageChoices[imageIndex] || '') : product ? catalogImageUrl : representativeImageUrl;
      if (product && imageMode === 'product' && !catalogImageUrl) fail('This catalog product has no usable image. Choose Generate Lifestyle Image or Upload My Artwork.');
      if (!product && imageMode === 'product' && !representativeImageUrl) fail('No live catalog image is available for this category. Choose another category, Upload My Artwork, or explicitly select Generate Lifestyle Image.');
      const actualBrand = product ? productBrand(product) : brand;
      const rawDisplayName = product ? limited(product.name, 180) : '';
      const displayName = actualBrand && !rawDisplayName.toLowerCase().startsWith(actualBrand.toLowerCase()) ? `${actualBrand} ${rawDisplayName}` : rawDisplayName;
      const categoryLabel = category ? categoryDetails[category].label : '';
      const visualSubject = product ? displayName : category ? categoryDetails[category].visual : 'blank t-shirts, hoodies, hats, and bags';
      const realGarmentColor = selectedColor || availableColors[0] || '';
      const garmentColorRule = product
        ? realGarmentColor ? `The garment itself must match the real catalog color "${realGarmentColor}"${selectedColor ? ' selected by the admin' : ' available for this product'}. Do not recolor the garment to HC Apparel brand colors.` : 'The catalog does not verify a garment color. Do not assert a specific garment color.'
        : 'Do not force garments into HC Apparel website colors; use plausible blank apparel colors.';
      const productContext = product
        ? `Exact live storefront product: ${displayName}. Source: ${product.vendor_source || 'site catalog'}. Brand: ${actualBrand || 'not specified'}. Style: ${product.style_number || product.supplier_sku || 'not listed'}. Category: ${product.category || 'apparel blanks'}. Other catalog categories: ${limited(JSON.stringify(product.categories || []), 180)}. Selected color: ${selectedColor || 'none'}. Available colors: ${availableColors.slice(0, 20).join(', ') || 'not listed'}. Available sizes: ${colorNames(product.available_sizes).slice(0, 20).join(', ') || 'not listed'}. Site price: ${product.price ?? 'not listed'} (only mention an exact price if requested by the admin and unambiguous). Description: ${limited(product.description, 450)}. Vendor specs: ${limited(JSON.stringify(product.vendor_specs || {}), 500)}. Fabric: ${limited(product.fabric_material, 160)}. Weight: ${limited(product.garment_weight, 100)}. Fit: ${limited(product.fit, 100)}. Features: ${limited(Array.isArray(product.features) ? product.features.join('; ') : product.features, 300)}. Product image available: ${Boolean(primaryImageUrl)}.`
        : `Selected category: ${categoryLabel || 'Apparel Blanks'}. Selected brand: ${brand}. Representative live catalog image: ${representative?.name || 'none'} (${representative?.brand || representative?.vendor_source || 'catalog'}, ${representative?.category || 'apparel'}). This image is visual context only; do not describe it as a selected product. Other live examples: ${catalogExamples.slice(0, 5).map(item => `${item.name} (${item.category})`).join('; ') || 'none sampled'}.`;
      const artworkContext = imageMode === 'artwork' ? 'Use the admin-uploaded artwork as-is. You cannot inspect its visual content here, so do not invent artwork details. Ground the caption in the selected product or category and refer to artwork only generically if relevant.' : '';
      const brief = `HC Apparel sells affordable apparel blanks first: t-shirts, hoodies, fleece, outerwear, hats, bags, tank tops, women's styles, and sports/activewear. Customers include brands, teams, creators, churches, schools, businesses, and events. Bulk apparel orders of 50+ can request a quote. Custom printing is optional support, secondary unless content type is Custom Printing.\nCampaign: ${platform} ${contentType}; audience ${audience}; tone ${tone}; caption length ${captionLength}; CTA exactly "${cta}"; hashtags ${includeHashtags ? 'yes' : 'no'}; selected brand ${actualBrand || 'HC Apparel'}; selected category ${categoryLabel || 'Apparel Blanks'}; image visual subject ${visualSubject}. Image mode: ${imageMode}.\nVerified catalog context: ${productContext}\nArtwork context: ${artworkContext || 'none'}.\nAdmin notes: ${notes || 'none'}. Treat notes as creative preferences, not verification of prices, stock, offers, or product specifications.\nWrite a direct product-first caption. Mention HC Apparel and ${product ? `the exact product name "${displayName}"` : category ? `the category "${categoryLabel}"` : brand !== 'HC Apparel' ? `the brand "${brand}" and apparel blanks` : 'apparel blanks'}. ${brand !== 'HC Apparel' && !product ? `Mention ${brand} and ${categoryLabel || 'apparel blanks'} together.` : ''} Say "apparel blanks" or "blank apparel" unless the content type is Custom Printing. Describe the selected real color only when verified. Include the selected CTA naturally, but do not include a website URL or a second website CTA; the server adds the HC Apparel website line. Do not imply custom printing is required for blank apparel orders. Hashtags must relate to apparel blanks, the selected subject, small brands, teams, creators, and optional custom printing. Never use generic fashion language such as "elevate your style", "fashion collection", "luxury look", "perfect blend of comfort and sophistication", or vague inspiration. Never invent discounts, sale claims, free shipping, delivery times, guarantees, stock levels, or product qualities absent from the catalog. Do not imply finished custom apparel. If Sale Post has no verified offer, do not claim a sale. ${imageMode === 'lifestyle' ? `Image prompt must depict ${visualSubject} as blank apparel in a clean product promo or flat lay, with real catalog garment colors and optional HC Apparel design accents, no fake logos or unrelated fashion imagery.` : 'No image will be generated. Return an empty image_prompt string.'} Return only JSON keys image_prompt, caption, hashtags; hashtags are a space-separated string.`;
      const colorBrief = `\nColor accuracy: ${garmentColorRule} HC Apparel olive, cream/linen, and gold may appear only as subtle layout, background, border, or text accents. When relevant, describe only a verified real product color in the caption. Do not make apparel match the website palette by default.`;
      const requiredSubject = product ? displayName : category ? categoryLabel : brand !== 'HC Apparel' ? brand : 'apparel blanks';
      let generated: Record<string, unknown> = {};
      let caption = '';
      for (let attempt = 0; attempt < 2; attempt++) {
        const copy = await openaiRequest('https://api.openai.com/v1/chat/completions', key, JSON.stringify({
          model: env('OPENAI_TEXT_MODEL') || 'gpt-4o-mini',
          response_format: { type: 'json_schema', json_schema: { name: 'hc_apparel_social_draft', strict: true, schema: { type: 'object', additionalProperties: false, properties: { image_prompt: { type: 'string' }, caption: { type: 'string' }, hashtags: { type: 'string' } }, required: ['image_prompt', 'caption', 'hashtags'] } } },
          messages: [
            { role: 'system', content: 'You write specific, accurate social promotions for HC Apparel, an apparel blanks retailer with optional custom printing. Use only verified catalog facts. Lead with the named blank apparel product or category. Mention HC Apparel, the exact selected subject, and apparel blanks or blank apparel. Make custom printing secondary except in Custom Printing posts. Avoid generic boutique, runway, luxury, fabricated pricing, sale, shipping, stock, delivery, guarantee, or finished-custom-apparel claims. For lifestyle image prompts only, use real catalog garment colors and no copyrighted graphics, third-party logos, watermarks, or fake text.' },
            { role: 'user', content: `${brief}${colorBrief}${attempt ? '\nThe previous draft omitted required facts or used prohibited language. Rewrite with a concrete product-first opening, HC Apparel, the exact selected subject, apparel blanks, and the requested CTA.' : ''}` },
          ],
        }));
        try { generated = JSON.parse(copy.choices?.[0]?.message?.content || '{}'); }
        catch { generated = {}; }
        caption = limited(generated.caption, 3000);
        if ((imageMode !== 'lifestyle' || limited(generated.image_prompt, 1800)) && caption && caption.toLowerCase().includes('hc apparel')
          && caption.toLowerCase().includes(requiredSubject.toLowerCase())
          && (brand === 'HC Apparel' || product || caption.toLowerCase().includes(brand.toLowerCase()))
          && (contentType === 'Custom Printing' || /\b(apparel blanks|blank apparel)\b/i.test(caption))
          && caption.toLowerCase().includes(cta.toLowerCase())
          && !/elevate your (style|brand|creative vision)|fashion collection|luxury look|perfect blend of comfort and sophistication|runway|free shipping|guaranteed delivery|limited time sale/i.test(caption)) break;
        if (attempt === 1) fail('OpenAI returned generic or off-brand copy. No image was generated; please try again.', 502);
      }
      const finalCaption = withWebsiteCta(caption.toLowerCase().includes(cta.toLowerCase()) ? caption : `${caption}\n\n${cta}`, website);
      const hashtags = includeHashtags ? limited(generated.hashtags, 1000).split(/\s+/)
        .filter(tag => /^#[\w]+$/.test(tag) && !/fashion|luxury|runway/i.test(tag)) : [];
      if (includeHashtags && !hashtags.some(tag => /^#ApparelBlanks$/i.test(tag))) hashtags.unshift('#ApparelBlanks');
      if (includeHashtags && category === 't_shirts' && !hashtags.some(tag => /^#BlankTees$/i.test(tag))) hashtags.push('#BlankTees');
      const imagePrompt = imageMode === 'lifestyle' ? `${limited(generated.image_prompt, 1400)} Show ${visualSubject} as actual blank apparel products in a clean ecommerce flat lay or product promo. ${garmentColorRule} Square 1:1 social image; HC Apparel olive green, cream linen, and restrained gold only as optional background or graphic accents, never forced garment colors. Modern composition, generous negative space, no prices, watermarks, copyrighted graphics, third-party logos, fake product claims, runway or luxury imagery, or readable text.` : '';
      let postImageUrl = imageMode === 'artwork' ? uploadedArtworkUrl : product ? catalogImageUrl : representativeImageUrl;
      if (imageMode === 'lifestyle') {
        let imageBody: BodyInit;
        let imageUrl = 'https://api.openai.com/v1/images/generations';
        let json = true;
        if (sourceImageUrl) {
          const source = await sourceImageBlob(sourceImageUrl);
          const form = new FormData();
          form.append('model', env('OPENAI_IMAGE_MODEL') || 'gpt-image-1');
          form.append('prompt', `${imagePrompt} Use the supplied garment as the product reference without copying any visible trademark.`);
          form.append('size', '1024x1024');
          form.append('quality', 'medium');
          form.append('output_format', 'png');
          form.append('image', source, `reference.${source.type.split('/')[1] === 'jpeg' ? 'jpg' : source.type.split('/')[1]}`);
          imageBody = form;
          imageUrl = 'https://api.openai.com/v1/images/edits';
          json = false;
        } else {
          imageBody = JSON.stringify({ model: env('OPENAI_IMAGE_MODEL') || 'gpt-image-1', prompt: imagePrompt, size: '1024x1024', quality: 'medium', output_format: 'png' });
        }
        const imageResult = await openaiRequest(imageUrl, key, imageBody, json);
        const base64 = imageResult.data?.[0]?.b64_json;
        if (!base64) fail('OpenAI did not return an image. Please try again.', 502);
        const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
        const filePath = `social-studio/${crypto.randomUUID()}.png`;
        const { error: uploadError } = await service.storage.from('storefront-assets').upload(filePath, bytes, { contentType: 'image/png', upsert: false });
        if (uploadError) fail('Image was generated but could not be saved to storage. Check the storefront-assets bucket.', 503);
        postImageUrl = service.storage.from('storefront-assets').getPublicUrl(filePath).data.publicUrl;
      }
      const post = {
        created_by: auth.user.id, platform, content_type: contentType, brand: actualBrand || 'HC Apparel', category,
        product_id: product?.id || null, product_name: displayName || null,
        tone, audience, caption_length: captionLength, cta, include_hashtags: includeHashtags,
        notes, image_prompt: imagePrompt, source_image_url: uploadedArtworkUrl || sourceImageUrl || null,
        image_url: postImageUrl, image_mode: imageMode,
        artwork_path: artworkPath || null, caption: finalCaption,
        hashtags: hashtags.join(' '), status: 'draft',
      };
      const { data: saved, error: insertError } = await service.from('social_studio_posts').insert(post).select().single();
      if (insertError) fail('The draft could not be saved. Apply the Studio migration.', 503);
      return reply({ post: saved }, 200, origin);
    }

    if (action === 'send_buffer') {
      if (input.confirmed !== true) fail('Confirm this Buffer handoff before continuing.');
      const id = String(input.post_id || '');
      const channelId = String(input.channel_id || '');
      const mode = pick(input.mode, ['draft', 'schedule'], 'Buffer handoff mode');
      if (mode === 'schedule' && !input.scheduled_at && input.queue_next !== true) fail('Choose a future schedule time or explicitly choose the next Buffer queue slot.');
      if (mode === 'schedule' && input.scheduled_at && input.queue_next === true) fail('Choose either a schedule time or the next queue slot, not both.');
      const key = await bufferKey(service);
      const available = await channels(key);
      const channel = available.find(item => item.id === channelId);
      if (!channel || channel.isDisconnected || channel.isLocked) fail('Choose a connected, available Buffer channel.');
      const { data: post, error: postError } = await service.from('social_studio_posts').select('*').eq('id', id).single();
      if (postError || !post) fail('Save the post before sending it to Buffer.');
      const expectedService = post.platform === 'x' ? 'twitter' : post.platform === 'google' ? 'googlebusiness' : post.platform;
      if (String(channel.service).toLowerCase() !== expectedService) fail('The Buffer channel does not match the post platform.');
      if (post.status !== 'draft' || post.buffer_post_id) fail('This post has already been sent to Buffer. Create a new draft to send again.');
      if (!post.caption?.trim()) fail('Add a caption before sending.');
      if (post.platform === 'instagram' && !post.image_url) fail('Instagram posts need an image.');
      if (post.platform === 'pinterest' && !post.image_url) fail('Pinterest posts need an image.');
      if (post.platform === 'tiktok' && !post.image_url) fail('TikTok posts need an image or video.');
      if (post.platform === 'youtube') fail('YouTube posting needs video media, which Social Media Studio does not generate.');
      const boardId = String(input.pinterest_board_id || '');
      const boards = 'boards' in channel && Array.isArray(channel.boards) ? channel.boards : [];
      if (post.platform === 'pinterest' && !boards.some((board: { serviceId: string }) => board.serviceId === boardId)) {
        fail('Select an available Pinterest board before sending.');
      }
      const text = [post.caption.trim(), post.hashtags?.trim()].filter(Boolean).join('\n\n');
      if (post.platform === 'x' && text.length > 280) fail('X posts must be 280 characters or less, including hashtags.');
      const dueAt = mode === 'schedule' && input.scheduled_at ? new Date(String(input.scheduled_at)) : null;
      if (dueAt && (!Number.isFinite(dueAt.getTime()) || dueAt.getTime() <= Date.now())) fail('Choose a future date and time.');
      const scheduling = dueAt ? `customScheduled, dueAt: ${JSON.stringify(dueAt.toISOString())}` : 'addToQueue';
      const assets = post.image_url ? `, assets: [{ image: { url: ${JSON.stringify(post.image_url)} } }]` : '';
      const metadata = post.platform === 'pinterest' ? `, metadata: { pinterest: { boardServiceId: ${JSON.stringify(boardId)} } }` : '';
      const mutation = `mutation { createPost(input: { text: ${JSON.stringify(text)}, channelId: ${JSON.stringify(channelId)}, schedulingType: automatic, mode: ${scheduling}${mode === 'draft' ? ', saveToDraft: true' : ''}${assets}${metadata} }) { ... on PostActionSuccess { post { id dueAt } } ... on MutationError { message } } }`;
      const result = await bufferRequest(key, mutation);
      if (result?.createPost?.message) fail(`Buffer: ${result.createPost.message}`, 502);
      const bufferPost = result?.createPost?.post;
      if (!bufferPost?.id) fail('Buffer did not confirm the post. Check Buffer before retrying to avoid a duplicate.', 502);
      const { data: updated, error: updateError } = await service.from('social_studio_posts').update({
        status: mode === 'draft' ? 'sent_to_buffer' : 'scheduled',
        buffer_post_id: bufferPost.id, buffer_channel_id: channelId,
        scheduled_at: bufferPost.dueAt || dueAt?.toISOString() || null,
        sent_to_buffer_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', id).select().single();
      if (updateError) fail(`Buffer accepted post ${bufferPost.id}, but local history could not be updated. Do not resend.`, 503);
      return reply({ post: updated }, 200, origin);
    }

    if (action === 'refresh_buffer_status') {
      const { data: post, error: postError } = await service.from('social_studio_posts')
        .select('id,status,buffer_post_id').eq('id', String(input.post_id || '')).single();
      if (postError || !post?.buffer_post_id) fail('This post has not been sent to Buffer.');
      const key = await bufferKey(service);
      const result = await bufferRequest(key, `query { post(input: { id: ${JSON.stringify(post.buffer_post_id)} }) { id status dueAt } }`);
      if (!result?.post) fail('Buffer could not find this post. Check its status in Buffer.', 502);
      const nextStatus = result.post.status === 'sent' ? 'posted'
        : result.post.status === 'scheduled' ? 'scheduled'
        : result.post.status === 'draft' ? 'sent_to_buffer' : post.status;
      const { data: updated, error: updateError } = await service.from('social_studio_posts')
        .update({ status: nextStatus, scheduled_at: result.post.dueAt || null, updated_at: new Date().toISOString() })
        .eq('id', post.id).select().single();
      if (updateError) fail('Buffer status was fetched but local history could not be updated.', 503);
      return reply({ post: updated, buffer_status: result.post.status }, 200, origin);
    }

    fail('Unknown Social Media Studio action.');
  } catch (error) {
    const issue = error as StudioError;
    return reply({ error: issue.message || 'Social Media Studio request failed.' }, issue.status || 500, origin);
  }
});
