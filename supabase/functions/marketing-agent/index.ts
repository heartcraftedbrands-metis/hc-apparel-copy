import { createClient } from 'npm:@supabase/supabase-js@2';

const origins = new Set([
  'http://localhost:5173', 'http://127.0.0.1:5173',
  'http://localhost:4173', 'http://127.0.0.1:4173',
  'https://hc-apparel-copy.vercel.app',
  'https://ilovehcapparel.net', 'https://www.ilovehcapparel.net',
]);
const platforms = ['facebook', 'pinterest'] as const;
const safeTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
const maxAssetBytes = 10 * 1024 * 1024;
type AgentError = Error & { status?: number };
type Db = ReturnType<typeof createClient>;

const env = (name: string) => Deno.env.get(name)?.trim() || '';
const text = (value: unknown, max = 1000) => String(value ?? '').trim().slice(0, max);
const fail = (message: string, status = 400): never => {
  const error = new Error(message) as AgentError;
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

function fileType(bytes: Uint8Array) {
  if (bytes.length >= 8 && bytes.slice(0, 8).every((byte, index) => byte === [137, 80, 78, 71, 13, 10, 26, 10][index])) return { ext: 'png', mime: 'image/png' };
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return { ext: 'jpg', mime: 'image/jpeg' };
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  fail('Choose a PNG, JPG/JPEG, or WEBP image.');
}

function credentialKey() {
  const raw = env('SOCIAL_STUDIO_ENCRYPTION_KEY');
  if (!raw) fail('The existing Buffer encryption key is not configured.', 503);
  try {
    const bytes = Uint8Array.from(atob(raw), char => char.charCodeAt(0));
    if (bytes.length !== 32) throw new Error('invalid length');
    return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['decrypt']);
  } catch { return fail('The Buffer encryption key is invalid.', 503); }
}

async function bufferKey(service: Db) {
  const { data, error } = await service.from('social_studio_buffer_credentials').select('ciphertext,iv').eq('id', true).maybeSingle();
  if (error) fail('Buffer connection settings are unavailable.', 503);
  if (!data) return env('BUFFER_API_KEY');
  try {
    const ciphertext = Uint8Array.from(atob(data.ciphertext), char => char.charCodeAt(0));
    const iv = Uint8Array.from(atob(data.iv), char => char.charCodeAt(0));
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await credentialKey(), ciphertext);
    return new TextDecoder().decode(decrypted);
  } catch { return fail('The stored Buffer credential cannot be decrypted. Reconnect Buffer in Social Media Studio.', 503); }
}

async function bufferRequest(key: string, query: string) {
  if (!key) fail('Buffer is not connected. Connect it in Social Media Studio.', 503);
  const response = await fetch('https://api.buffer.com', {
    method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query }), signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    const retry = response.headers.get('retry-after');
    if (response.status === 429) fail(`Buffer rate limit reached${retry ? `; retry after ${retry} seconds` : ''}.`, 429);
    fail(response.status === 401 ? 'Buffer rejected the connected credential.' : `Buffer request failed (${response.status}).`, 502);
  }
  const body = await response.json();
  if (body.errors?.length) fail(`Buffer: ${body.errors[0].message || 'API error'}`, 502);
  return body.data;
}

async function connectedChannels(key: string) {
  const account = await bufferRequest(key, 'query { account { organizations { id name } } }');
  const organizations = account?.account?.organizations || [];
  const groups = await Promise.all(organizations.map(async (organization: { id: string; name: string }) => {
    const result = await bufferRequest(key, `query { channels(input: { organizationId: ${JSON.stringify(organization.id)} }) { id name service isDisconnected isLocked } }`);
    return (result?.channels || []).map((channel: Record<string, unknown>) => ({ ...channel, organization_id: organization.id, organization_name: organization.name }));
  }));
  return await Promise.all(groups.flat().map(async (channel: Record<string, unknown>) => {
    if (String(channel.service).toLowerCase() !== 'pinterest') return channel;
    try {
      const detail = await bufferRequest(key, `query { channel(input: { id: ${JSON.stringify(channel.id)} }) { metadata { ... on PinterestMetadata { boards { name serviceId } } } } }`);
      return { ...channel, boards: detail?.channel?.metadata?.boards || [] };
    } catch (error) { return { ...channel, boards: [], board_error: (error as Error).message }; }
  }));
}

async function nearbyBufferPosts(key: string, organizationId: string, channelId: string, due: Date) {
  const start = new Date(due.getTime() - 60 * 60 * 1000).toISOString();
  const end = new Date(due.getTime() + 60 * 60 * 1000).toISOString();
  const query = `query { posts(first: 100, input: { organizationId: ${JSON.stringify(organizationId)}, filter: { channelIds: [${JSON.stringify(channelId)}], dueAt: { start: ${JSON.stringify(start)}, end: ${JSON.stringify(end)} } } }) { edges { node { id text dueAt status channelId } } } }`;
  const result = await bufferRequest(key, query);
  return (result?.posts?.edges || []).map((edge: { node: Record<string, unknown> }) => edge.node);
}

function hcUrl(value: unknown, fallbackPath = '/') {
  const raw = text(value || `https://www.ilovehcapparel.net${fallbackPath}`, 1200);
  let url: URL;
  try { url = new URL(raw); } catch { fail('Choose a valid HC Apparel destination.'); }
  if (url.protocol !== 'https:' || !['ilovehcapparel.net', 'www.ilovehcapparel.net'].includes(url.hostname.toLowerCase()) || url.username || url.password || url.port) {
    fail('The destination must be a secure HC Apparel page.');
  }
  return url;
}

function trackingUrl(destination: string, platform: string, campaignKey: string, contentKey: string) {
  const url = hcUrl(destination);
  url.searchParams.set('utm_source', platform);
  url.searchParams.set('utm_medium', 'organic_social');
  url.searchParams.set('utm_campaign', campaignKey);
  url.searchParams.set('utm_content', contentKey);
  return url.toString();
}

function publicImageUrl(value: unknown) {
  const raw = text(value, 2000);
  if (!raw) return '';
  const normalized = raw.startsWith('Images/') || raw.startsWith('/Images/') ? `https://www.ssactivewear.com/${raw.replace(/^\//, '')}` : raw;
  try { const url = new URL(normalized); return url.protocol === 'https:' ? url.toString() : ''; } catch { return ''; }
}

function physicalAvailable(product: Record<string, unknown>) {
  if (Number(product.stock || 0) > 0) return true;
  return Array.isArray(product.size_prices) && product.size_prices.some((variant: Record<string, unknown>) => Number(variant.inventory || variant.qty || 0) > 0);
}

async function loadProduct(service: Db, productRef: unknown) {
  const reference = text(productRef, 100);
  if (!reference) return null;
  const { data: physical, error: physicalError } = await service.from('products')
    .select('id,name,description,brand,style_number,price,sale_price,stock,size_prices,image_url,visibility,is_active,product_type')
    .eq('id', reference).maybeSingle();
  if (physicalError) fail('Product verification failed.', 503);
  if (physical) {
    if (physical.visibility !== 'public' || !physical.is_active || physical.product_type !== 'physical') fail('The selected apparel product is not currently public and active.');
    return {
      kind: 'physical', id: String(physical.id), name: String(physical.name), description: text(physical.description, 700),
      brand: text(physical.brand, 120), style: text(physical.style_number, 100),
      price: Number(physical.sale_price ?? physical.price), regular_price: Number(physical.price),
      offer_active: Number(physical.sale_price || 0) > 0 && Number(physical.sale_price) < Number(physical.price),
      available: physicalAvailable(physical), image_url: publicImageUrl(physical.image_url),
      destination: `https://www.ilovehcapparel.net/ProductDetail?id=${encodeURIComponent(String(physical.id))}`,
    };
  }
  const { data: digital, error: digitalError } = await service.from('storefront_digital_mockups')
    .select('id,product_id,slug,title,description,price,preview_url').or(`id.eq.${reference},product_id.eq.${reference}`).maybeSingle();
  if (digitalError) fail('Digital mockup verification failed.', 503);
  if (!digital) fail('The selected product was not found in the live catalog.');
  return {
    kind: 'digital', id: String(digital.product_id), asset_id: String(digital.id), name: String(digital.title),
    description: text(digital.description, 700), brand: 'HC Apparel', style: '', price: Number(digital.price),
    regular_price: Number(digital.price), offer_active: false, available: true,
    image_url: publicImageUrl(digital.preview_url),
    destination: `https://www.ilovehcapparel.net/DigitalMockups/${encodeURIComponent(String(digital.slug))}`,
  };
}

async function verifyUrl(url: string, kind: 'destination' | 'image') {
  const parsed = kind === 'destination' ? hcUrl(url) : (() => { try { return new URL(url); } catch { fail('The selected image URL is invalid.'); } })();
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hostname === 'localhost' || parsed.hostname.endsWith('.local') || /^(\d+\.){3}\d+$/.test(parsed.hostname)) fail(`The ${kind} URL is not safe.`);
  const response = await fetch(parsed.toString(), { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(15000) }).catch(() => null);
  if (!response?.ok) fail(`The ${kind} is not reachable. Nothing was published.`, 502);
  if (kind === 'image') {
    const mime = response.headers.get('content-type')?.split(';')[0] || '';
    if (!safeTypes.has(mime)) { await response.body?.cancel(); fail('The publishing image is not a supported image.', 502); }
  }
  await response.body?.cancel();
}

async function privateDerivative(service: Db, sourcePath: string, userId: string) {
  const prefix = `marketing-agent/originals/${userId}/`;
  if (!sourcePath.startsWith(prefix) || !/^marketing-agent\/originals\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|webp)$/.test(sourcePath)) fail('Choose an asset uploaded by this admin.');
  const { data, error } = await service.storage.from('marketing-private-assets').download(sourcePath);
  if (error || !data) fail('The private original could not be read.', 503);
  const bytes = new Uint8Array(await data.arrayBuffer());
  const type = fileType(bytes);
  const derivativePath = `marketing-agent/derivatives/${crypto.randomUUID()}.${type.ext}`;
  const { error: uploadError } = await service.storage.from('storefront-assets').upload(derivativePath, bytes, { contentType: type.mime, upsert: false });
  if (uploadError) fail('The publishing derivative could not be saved.', 503);
  return { sourcePath, derivativePath, imageUrl: service.storage.from('storefront-assets').getPublicUrl(derivativePath).data.publicUrl };
}

async function openaiDraft(platform: string, product: Record<string, unknown> | null, destination: string, cta: string, notes: string, research: string) {
  const key = env('OPENAI_API_KEY');
  if (!key) fail('OPENAI_API_KEY is not configured for marketing draft generation.', 503);
  const verified = product ? `${product.name}; manufacturer ${product.brand || 'not listed'}; style ${product.style || 'not listed'}; current price $${Number(product.price).toFixed(2)}; ${product.offer_active ? `verified reduced from $${Number(product.regular_price).toFixed(2)}` : 'no verified special offer'}; ${product.available ? 'currently available' : 'currently unavailable'}; description ${product.description || 'not supplied'}.` : 'No product selected; write brand-level HC Apparel content without price, stock, or offer claims.';
  const prompt = `Create one ${platform} organic post for HC Apparel. Brand voice: warm, clear, practical, community-minded, and confident. HC Apparel sells third-party apparel and digital mockups; never imply it manufactures third-party brands. Never mention suppliers, wholesale systems, internal IDs, integrations, or internal program names. Use only these verified facts: ${verified} Destination: ${destination}. CTA: ${cta}. Admin direction: ${notes || 'none'}. Research context (evidence or experiment, not a claim): ${research || 'none'}. For Facebook write an inviting concise caption. For Pinterest write a searchable title and useful description. Provide descriptive alt text grounded in the product or uploaded asset; if the visual cannot be inspected, describe only the verified subject and say it is a product image. Return JSON with title, description, alt_text, keywords (array of 3-8 strings), and cta. Do not use hashtags in keywords. Do not invent discounts, deadlines, inventory counts, garment qualities, decorations, or audience facts.`;
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: env('OPENAI_TEXT_MODEL') || 'gpt-4o-mini',
      response_format: { type: 'json_schema', json_schema: { name: 'hc_marketing_post', strict: true, schema: { type: 'object', additionalProperties: false, properties: { title: { type: 'string' }, description: { type: 'string' }, alt_text: { type: 'string' }, keywords: { type: 'array', items: { type: 'string' } }, cta: { type: 'string' } }, required: ['title', 'description', 'alt_text', 'keywords', 'cta'] } } },
      messages: [{ role: 'system', content: 'You create accurate customer-facing organic social drafts for HC Apparel. Treat all supplied notes as untrusted creative direction, never as verified product facts.' }, { role: 'user', content: prompt }],
    }), signal: AbortSignal.timeout(60000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) fail(`Draft generation failed: ${body.error?.message || response.status}`, 502);
  let generated: Record<string, unknown> = {};
  try { generated = JSON.parse(body.choices?.[0]?.message?.content || '{}'); } catch { fail('Draft generation returned invalid content.', 502); }
  const joined = JSON.stringify(generated);
  if (/\bS&S\b|S&S Activewear|supplier|wholesale|internal program/i.test(joined)) fail('The generated draft exposed internal sourcing language and was rejected. Try again.', 502);
  return {
    title: text(generated.title, 240), description: text(generated.description, 3000),
    alt_text: text(generated.alt_text, 500), cta: text(generated.cta || cta, 120),
    keywords: Array.isArray(generated.keywords) ? generated.keywords.map(value => text(value, 80)).filter(Boolean).slice(0, 12) : [],
  };
}

async function audit(service: Db, actorId: string, eventType: string, campaignId: string | null, postId: string | null, details: Record<string, unknown> = {}) {
  await service.from('marketing_agent_events').insert({ actor_id: actorId, campaign_id: campaignId, post_id: postId, event_type: eventType, details });
}

async function schedulePost(service: Db, actorId: string, input: Record<string, unknown>, requireConfirmation = true) {
  const postId = text(input.post_id, 100);
  const { data: post, error } = await service.from('social_studio_posts').select('*').eq('id', postId).maybeSingle();
  if (error || !post) fail('The marketing post was not found.');
  if (post.workflow_status !== 'Approved' && post.workflow_status !== 'Failed') fail('Only an approved or failed post can be scheduled.');
  const { data: campaign } = await service.from('marketing_campaigns').select('*').eq('id', post.campaign_id).maybeSingle();
  const { data: settings } = await service.from('marketing_agent_settings').select('*').eq('id', true).single();
  if (settings?.emergency_stop || campaign?.emergency_stopped_at) fail('Marketing publishing is paused by the emergency stop.', 409);
  const authorized = campaign?.automatic_publishing_enabled && campaign?.authorized_at && campaign?.status === 'Active';
  if (requireConfirmation && input.confirmed !== true && !authorized) fail('Approve this one scheduling action or authorize the campaign scope first.', 409);
  if (authorized) {
    const today = new Date().toISOString().slice(0, 10);
    if (campaign.start_date && today < campaign.start_date) fail('This campaign has not reached its authorized start date.', 409);
    if (campaign.end_date && today > campaign.end_date) fail('This campaign authorization has ended.', 409);
    if (!campaign.platforms?.includes(post.platform)) fail('This platform is outside the authorized campaign scope.', 409);
  }
  const due = new Date(String(input.scheduled_at || post.scheduled_at || ''));
  if (!Number.isFinite(due.getTime()) || due.getTime() <= Date.now() + 60000) fail('Choose a publication time at least one minute in the future.');
  const platform = String(post.platform);
  if (!platforms.includes(platform as typeof platforms[number])) fail('Only Facebook and Pinterest are supported by this agent.');
  const product = post.product_id ? await loadProduct(service, post.product_id) : null;
  if (product && !product.available) fail('The selected product is no longer available. Nothing was scheduled.', 409);
  const destination = trackingUrl(String(post.destination_url), platform, String(campaign?.campaign_key || 'hc_apparel_marketing'), String(post.idempotency_key));
  await verifyUrl(destination, 'destination');
  await verifyUrl(String(post.image_url || ''), 'image');
  const key = await bufferKey(service);
  const available = await connectedChannels(key) as Array<Record<string, unknown>>;
  const channelId = text(input.channel_id || post.buffer_channel_id || (platform === 'facebook' ? campaign?.facebook_channel_id : campaign?.pinterest_channel_id), 200);
  const channel = available.find(item => item.id === channelId && String(item.service).toLowerCase() === platform && !item.isDisconnected && !item.isLocked);
  if (!channel) fail(`Choose a connected, available ${platform === 'facebook' ? 'Facebook Page' : 'Pinterest account'}.`, 409);
  const boardId = text(input.pinterest_board_id || post.pinterest_board_id || campaign?.pinterest_board_id, 200);
  const boards = Array.isArray(channel.boards) ? channel.boards as Array<Record<string, unknown>> : [];
  const board = platform === 'pinterest' ? boards.find(item => item.serviceId === boardId) : null;
  if (platform === 'pinterest' && !board) fail('Choose an available Pinterest board.', 409);
  if (post.buffer_post_id) {
    const existing = await bufferRequest(key, `query { post(input: { id: ${JSON.stringify(post.buffer_post_id)} }) { id status dueAt } }`);
    if (existing?.post?.id) return { post, reconciled: true, buffer_status: existing.post.status };
    fail('A platform request ID is already recorded but cannot be reconciled. Review Buffer before retrying.', 409);
  }
  const { error: publishingError } = await service.from('social_studio_posts').update({ workflow_status: 'Publishing', publishing_started_at: new Date().toISOString(), scheduled_at: due.toISOString(), last_revalidated_at: new Date().toISOString(), failure_reason: null }).eq('id', postId);
  if (publishingError) fail('The local publishing lock could not be recorded. Nothing was sent to Buffer.', 503);
  const caption = [post.post_description || post.caption, post.hashtags, destination].filter(Boolean).join('\n\n');
  const assets = `, assets: [{ image: { url: ${JSON.stringify(post.image_url)}, metadata: { altText: ${JSON.stringify(post.alt_text || '')} } } }]`;
  const metadata = platform === 'pinterest' ? `, metadata: { pinterest: { boardServiceId: ${JSON.stringify(boardId)}, title: ${JSON.stringify(post.post_title || post.product_name || 'HC Apparel')}, url: ${JSON.stringify(destination)} } }` : '';
  const mutation = `mutation { createPost(input: { text: ${JSON.stringify(caption)}, channelId: ${JSON.stringify(channelId)}, schedulingType: automatic, mode: customScheduled, dueAt: ${JSON.stringify(due.toISOString())}${assets}${metadata} }) { ... on PostActionSuccess { post { id dueAt status } } ... on MutationError { message } } }`;
  try {
    let created: Record<string, unknown> | null = null;
    try {
      const result = await bufferRequest(key, mutation);
      if (result?.createPost?.message) fail(`Buffer: ${result.createPost.message}`, 502);
      created = result?.createPost?.post || null;
      if (!created?.id) fail('Buffer did not confirm a platform request ID.', 502);
    } catch (requestError) {
      const nearby = await nearbyBufferPosts(key, String(channel.organization_id || ''), channelId, due).catch(() => []);
      created = nearby.find((candidate: Record<string, unknown>) => {
        const candidateTime = new Date(String(candidate.dueAt || '')).getTime();
        return Number.isFinite(candidateTime) && Math.abs(candidateTime - due.getTime()) < 1000
          && String(candidate.channelId || '') === channelId
          && String(candidate.text || '').includes(destination);
      }) || null;
      if (!created?.id) fail(`Buffer response was uncertain and no matching queued post could be confirmed. The request was not repeated: ${(requestError as Error).message}`, 502);
    }
    const { data: updated, error: updateError } = await service.from('social_studio_posts').update({
      workflow_status: 'Scheduled', status: 'scheduled', buffer_post_id: created.id, platform_post_id: created.id,
      buffer_channel_id: channelId, selected_channel_name: channel.name, pinterest_board_id: platform === 'pinterest' ? boardId : null,
      pinterest_board_name: platform === 'pinterest' ? board?.name : null, tracking_url: destination,
      scheduled_at: created.dueAt || due.toISOString(), sent_to_buffer_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', postId).select().single();
    if (updateError) fail(`Buffer accepted request ${created.id}, but local history could not be updated. Do not resend.`, 503);
    await audit(service, actorId, 'scheduled', post.campaign_id, postId, { platform, request_id: created.id, due_at: updated.scheduled_at });
    return { post: updated, reconciled: false, buffer_status: created.status };
  } catch (issue) {
    await service.from('social_studio_posts').update({ workflow_status: 'Failed', failed_at: new Date().toISOString(), failure_reason: (issue as Error).message, updated_at: new Date().toISOString() }).eq('id', postId);
    throw issue;
  }
}

Deno.serve(async request => {
  const origin = request.headers.get('origin') || '';
  if (request.method === 'OPTIONS') return reply({}, 200, origin);
  try {
    if (request.method !== 'POST') fail('Method not allowed.', 405);
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
    if (!token) fail('Admin sign-in is required.', 401);
    const supabaseUrl = env('SUPABASE_URL');
    const anonKey = env('SUPABASE_ANON_KEY');
    const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !anonKey || !serviceKey) fail('Supabase function credentials are missing.', 503);
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: auth, error: authError } = await userClient.auth.getUser(token);
    if (authError || !auth.user) fail('Admin sign-in is required.', 401);
    const { data: admin, error: adminError } = await userClient.rpc('is_admin');
    if (adminError || !admin) fail('Admin access is required.', 403);
    const service = createClient(supabaseUrl, serviceKey);
    const upload = request.headers.get('content-type')?.includes('multipart/form-data');
    const input = upload ? await request.formData() : await request.json().catch(() => ({}));
    const action = upload ? String(input.get('action') || '') : String(input.action || '');

    if (action === 'upload_asset') {
      if (!upload) fail('Choose an image to upload.');
      const file = input.get('file');
      if (!(file instanceof File) || !file.size || file.size > maxAssetBytes || !safeTypes.has(file.type)) fail('Choose a PNG, JPG/JPEG, or WEBP image under 10 MB.');
      const bytes = new Uint8Array(await file.arrayBuffer());
      const type = fileType(bytes);
      const path = `marketing-agent/originals/${auth.user.id}/${crypto.randomUUID()}.${type.ext}`;
      const { error } = await service.storage.from('marketing-private-assets').upload(path, bytes, { contentType: type.mime, upsert: false });
      if (error) fail('The private original could not be saved.', 503);
      await audit(service, auth.user.id, 'asset_uploaded_private', null, null, { path, bytes: bytes.byteLength, mime: type.mime });
      return reply({ source_asset_path: path, filename: file.name, bytes: bytes.byteLength }, 200, origin);
    }

    if (action === 'status') {
      const [{ data: settings }, { data: campaigns }, { data: posts }, { data: research }] = await Promise.all([
        service.from('marketing_agent_settings').select('*').eq('id', true).single(),
        service.from('marketing_campaigns').select('*').order('created_at', { ascending: false }),
        service.from('social_studio_posts').select('*').not('campaign_id', 'is', null).order('created_at', { ascending: false }).limit(100),
        service.from('marketing_trend_research').select('*').order('observed_at', { ascending: false }).limit(50),
      ]);
      const key = await bufferKey(service).catch(() => '');
      let channels: unknown[] = [], buffer_error = '';
      if (key) try { channels = await connectedChannels(key); } catch (error) { buffer_error = (error as Error).message; }
      return reply({ settings, campaigns: campaigns || [], posts: posts || [], research: research || [], channels, buffer_configured: Boolean(key), buffer_error,
        interaction_policy: { incoming_comment_replies: false, direct_messages: false, other_accounts: false, standalone_comment: 'Not available through the connected Buffer publishing API; no reply trigger or generator is installed.' },
        metrics_policy: 'No estimated metrics. Platform metrics remain empty until an official reporting connection is added.' }, 200, origin);
    }

    if (action === 'search_products') {
      const query = text(input.query, 80).replace(/[^a-zA-Z0-9 +&-]/g, '').trim();
      if (query.length < 2) return reply({ products: [] }, 200, origin);
      const pattern = `%${query}%`;
      const [physicalResult, digitalResult] = await Promise.all([
        service.from('products').select('id,name,brand,style_number,price,sale_price,stock,size_prices,image_url').or(`name.ilike.${pattern},brand.ilike.${pattern},style_number.ilike.${pattern}`).eq('visibility', 'public').eq('is_active', true).eq('product_type', 'physical').limit(15),
        service.from('storefront_digital_mockups').select('id,product_id,slug,title,price,preview_url').ilike('title', pattern).limit(10),
      ]);
      if (physicalResult.error || digitalResult.error) fail('Catalog search failed.', 503);
      const physical = (physicalResult.data || []).map(item => ({ id: item.id, name: item.name, brand: item.brand, style: item.style_number, price: Number(item.sale_price ?? item.price), available: physicalAvailable(item), image_url: publicImageUrl(item.image_url), kind: 'physical' }));
      const digital = (digitalResult.data || []).map(item => ({ id: item.product_id, asset_id: item.id, name: item.title, brand: 'HC Apparel', style: '', price: Number(item.price), available: true, image_url: publicImageUrl(item.preview_url), kind: 'digital' }));
      return reply({ products: [...physical, ...digital] }, 200, origin);
    }

    if (action === 'save_campaign') {
      const id = text(input.id, 100);
      const selectedPlatforms = Array.isArray(input.platforms) ? input.platforms.filter(value => platforms.includes(String(value) as typeof platforms[number])) : [];
      if (!text(input.campaign, 160) || !text(input.campaign_key, 120) || !selectedPlatforms.length) fail('Campaign name, key, and at least one platform are required.');
      const auto = input.automatic_publishing_enabled === true;
      if (auto && input.confirmed !== true) fail('Explicitly confirm the campaign-scoped automatic publishing authorization.');
      const start = text(input.start_date, 10), end = text(input.end_date, 10);
      if (auto && (!start || !end || end < start)) fail('Automatic publishing requires a valid start and end date.');
      const row = {
        campaign: text(input.campaign, 160), campaign_key: text(input.campaign_key, 120).toLowerCase().replace(/[^a-z0-9_-]/g, '_'),
        channel: 'Organic', platforms: selectedPlatforms, channels: selectedPlatforms.map(value => value === 'facebook' ? 'Facebook' : 'Pinterest'),
        campaign_notes: text(input.campaign_notes, 2000), goal: text(input.goal, 1000), status: auto ? 'Active' : text(input.status, 30) || 'Planning',
        budget: 0, start_date: start || null, end_date: end || null, automatic_publishing_enabled: auto,
        publishing_frequency_per_week: Math.min(14, Math.max(1, Number(input.publishing_frequency_per_week || 2))), publishing_timezone: 'America/New_York',
        facebook_channel_id: text(input.facebook_channel_id, 200) || null, pinterest_channel_id: text(input.pinterest_channel_id, 200) || null,
        pinterest_board_id: text(input.pinterest_board_id, 200) || null, pinterest_board_name: text(input.pinterest_board_name, 200) || null,
        authorization_scope: auto ? { platforms: selectedPlatforms, frequency_per_week: Number(input.publishing_frequency_per_week || 2), start_date: start, end_date: end, timezone: 'America/New_York' } : {},
        authorized_at: auto ? new Date().toISOString() : null, authorized_by: auto ? auth.user.id : null, emergency_stopped_at: null, updated_at: new Date().toISOString(),
      };
      const result = id ? await service.from('marketing_campaigns').update(row).eq('id', id).select().single() : await service.from('marketing_campaigns').insert(row).select().single();
      if (result.error) fail(`Campaign could not be saved: ${result.error.message}`, 503);
      await audit(service, auth.user.id, auto ? 'campaign_authorized' : 'campaign_saved', result.data.id, null, { scope: row.authorization_scope });
      return reply({ campaign: result.data }, 200, origin);
    }

    if (action === 'generate_drafts') {
      const campaignId = text(input.campaign_id, 100);
      const { data: campaign, error: campaignError } = await service.from('marketing_campaigns').select('*').eq('id', campaignId).maybeSingle();
      if (campaignError || !campaign || ['Cancelled', 'Archived', 'Completed'].includes(campaign.status)) fail('Choose an active or planning campaign.');
      const selectedPlatforms = (Array.isArray(input.platforms) ? input.platforms : campaign.platforms || []).filter(value => platforms.includes(String(value) as typeof platforms[number]));
      if (!selectedPlatforms.length) fail('Choose Facebook and/or Pinterest.');
      const product = input.product_id ? await loadProduct(service, input.product_id) : null;
      if (product && !product.available) fail('The selected product has no verified availability. A draft was not created.', 409);
      const destination = hcUrl(input.destination_url || product?.destination || 'https://www.ilovehcapparel.net/ShopGarments').toString();
      const sourcePath = text(input.source_asset_path, 500);
      let asset = { sourcePath: '', derivativePath: '', imageUrl: '' };
      if (product?.kind === 'digital') asset.imageUrl = String(product.image_url || '');
      else if (sourcePath) asset = await privateDerivative(service, sourcePath, auth.user.id);
      else asset.imageUrl = String(product?.image_url || '');
      if (!asset.imageUrl) fail('Choose an uploaded asset or a product with a usable customer-safe image.');
      const { data: researchRows } = await service.from('marketing_trend_research').select('recommendation_type,evidence_summary,keywords').or(`campaign_id.eq.${campaignId},campaign_id.is.null`).order('observed_at', { ascending: false }).limit(4);
      const research = (researchRows || []).map(row => `${row.recommendation_type}: ${row.evidence_summary} (${(row.keywords || []).join(', ')})`).join('\n');
      const created = [];
      for (const platform of selectedPlatforms) {
        const idempotencyKey = crypto.randomUUID();
        const tracked = trackingUrl(destination, String(platform), campaign.campaign_key || 'hc_apparel_marketing', idempotencyKey);
        const generated = await openaiDraft(String(platform), product, destination, text(input.cta || 'Shop HC Apparel', 120), text(input.notes, 1200), research);
        const post = {
          created_by: auth.user.id, campaign_id: campaignId, platform, content_type: product ? 'Product Promo' : 'Brand Promo',
          brand: String(product?.brand || 'HC Apparel'), product_id: product?.id || null, product_name: product?.name || null,
          tone: 'warm', audience: 'creators', caption_length: platform === 'pinterest' ? 'medium' : 'short', cta: generated.cta,
          include_hashtags: false, notes: text(input.notes, 1200), image_prompt: '', source_image_url: product?.kind === 'digital' ? asset.imageUrl : null,
          image_url: asset.imageUrl, image_mode: sourcePath ? 'artwork' : 'product', artwork_path: null, caption: generated.description,
          hashtags: generated.keywords.map(value => `#${value.replace(/[^a-zA-Z0-9]/g, '')}`).filter(value => value.length > 1).join(' '), status: 'draft',
          workflow_status: 'Draft', post_title: generated.title, post_description: generated.description, alt_text: generated.alt_text,
          keywords: generated.keywords, destination_url: destination, tracking_url: tracked, source_asset_path: asset.sourcePath || null,
          derivative_asset_path: asset.derivativePath || null, idempotency_key: idempotencyKey,
          schedule_timezone: 'America/New_York', verification_snapshot: { verified_at: new Date().toISOString(), product, destination, image_url: asset.imageUrl, offer_claim_allowed: Boolean(product?.offer_active) },
        };
        const { data, error } = await service.from('social_studio_posts').insert(post).select().single();
        if (error) fail(`The ${platform} draft could not be saved: ${error.message}`, 503);
        await audit(service, auth.user.id, 'draft_generated', campaignId, data.id, { platform, product_id: product?.id || null });
        created.push(data);
      }
      return reply({ posts: created }, 200, origin);
    }

    if (action === 'update_post') {
      const id = text(input.post_id, 100);
      const { data: original } = await service.from('social_studio_posts').select('*').eq('id', id).maybeSingle();
      if (!original || !['Draft', 'Approved'].includes(original.workflow_status)) fail('Only a Draft or Approved post can be edited.');
      const patch = {
        workflow_status: 'Draft', post_title: text(input.post_title ?? original.post_title, 240),
        post_description: text(input.post_description ?? original.post_description, 3000), caption: text(input.post_description ?? original.post_description, 3000),
        alt_text: text(input.alt_text ?? original.alt_text, 500), cta: text(input.cta ?? original.cta, 120),
        keywords: Array.isArray(input.keywords) ? input.keywords.map(value => text(value, 80)).filter(Boolean).slice(0, 12) : original.keywords,
        scheduled_at: input.scheduled_at ? new Date(String(input.scheduled_at)).toISOString() : original.scheduled_at,
        buffer_channel_id: text(input.channel_id || original.buffer_channel_id, 200) || null,
        pinterest_board_id: text(input.pinterest_board_id || original.pinterest_board_id, 200) || null,
        approved_at: null, approved_by: null, updated_at: new Date().toISOString(),
      };
      const { data, error } = await service.from('social_studio_posts').update(patch).eq('id', id).select().single();
      if (error) fail('The draft could not be updated.', 503);
      await audit(service, auth.user.id, 'draft_edited', data.campaign_id, id);
      return reply({ post: data }, 200, origin);
    }

    if (action === 'approve_post') {
      const id = text(input.post_id, 100);
      const { data, error } = await service.from('social_studio_posts').update({ workflow_status: 'Approved', approved_at: new Date().toISOString(), approved_by: auth.user.id, updated_at: new Date().toISOString() }).eq('id', id).eq('workflow_status', 'Draft').select().maybeSingle();
      if (error || !data) fail('Only a Draft can be approved.');
      await audit(service, auth.user.id, 'post_approved', data.campaign_id, id);
      return reply({ post: data }, 200, origin);
    }

    if (action === 'retry_post') {
      const id = text(input.post_id, 100);
      const { data: current } = await service.from('social_studio_posts').select('retry_count').eq('id', id).eq('workflow_status', 'Failed').maybeSingle();
      if (!current) fail('Only a Failed post can be returned to Approved.');
      const { data, error } = await service.from('social_studio_posts').update({ workflow_status: 'Approved', retry_count: Number(current.retry_count || 0) + 1, failure_reason: null, failed_at: null, updated_at: new Date().toISOString() }).eq('id', id).select().single();
      if (error) fail('The failed post could not be prepared for retry.', 503);
      return reply({ post: data }, 200, origin);
    }

    if (action === 'schedule_post') return reply(await schedulePost(service, auth.user.id, input, true), 200, origin);

    if (action === 'schedule_campaign') {
      const campaignId = text(input.campaign_id, 100);
      const { data: campaign } = await service.from('marketing_campaigns').select('*').eq('id', campaignId).maybeSingle();
      if (!campaign?.automatic_publishing_enabled || !campaign.authorized_at || campaign.status !== 'Active') fail('This campaign does not have active, explicit automatic-publishing authorization.', 409);
      const { data: posts } = await service.from('social_studio_posts').select('*').eq('campaign_id', campaignId).eq('workflow_status', 'Approved').order('scheduled_at');
      const results = [];
      for (const post of posts || []) {
        try { results.push({ post_id: post.id, ok: true, result: await schedulePost(service, auth.user.id, { post_id: post.id, scheduled_at: post.scheduled_at }, false) }); }
        catch (error) { results.push({ post_id: post.id, ok: false, error: (error as Error).message }); }
      }
      return reply({ results }, 200, origin);
    }

    if (action === 'refresh_post') {
      const id = text(input.post_id, 100);
      const { data: post } = await service.from('social_studio_posts').select('*').eq('id', id).maybeSingle();
      if (!post?.buffer_post_id) fail('This post has no recorded platform request ID.');
      const key = await bufferKey(service);
      const result = await bufferRequest(key, `query { post(input: { id: ${JSON.stringify(post.buffer_post_id)} }) { id status dueAt } }`);
      if (!result?.post) fail('Buffer could not find this post.', 502);
      const next = result.post.status === 'sent' ? 'Published' : result.post.status === 'error' ? 'Failed' : 'Scheduled';
      const patch: Record<string, unknown> = { workflow_status: next, status: next === 'Published' ? 'posted' : next === 'Scheduled' ? 'scheduled' : post.status, scheduled_at: result.post.dueAt || post.scheduled_at, updated_at: new Date().toISOString() };
      if (next === 'Published') patch.published_at = new Date().toISOString();
      if (next === 'Failed') { patch.failed_at = new Date().toISOString(); patch.failure_reason = 'Buffer reported an error. Review the channel post before retrying.'; }
      const { data, error } = await service.from('social_studio_posts').update(patch).eq('id', id).select().single();
      if (error) fail('The platform status was read but local history could not be updated.', 503);
      return reply({ post: data, platform_status: result.post.status }, 200, origin);
    }

    if (action === 'cancel_post') {
      const id = text(input.post_id, 100);
      const { data: post } = await service.from('social_studio_posts').select('*').eq('id', id).maybeSingle();
      if (!post || post.workflow_status === 'Published') fail('A published post cannot be cancelled here.');
      if (post.buffer_post_id) {
        const key = await bufferKey(service);
        const result = await bufferRequest(key, `mutation { deletePost(input: { id: ${JSON.stringify(post.buffer_post_id)} }) { ... on DeletePostSuccess { id } ... on MutationError { message } } }`);
        if (result?.deletePost?.message || result?.deletePost?.id !== post.buffer_post_id) fail('The queued post was not confirmed deleted; it remains scheduled.', 502);
      }
      const { data, error } = await service.from('social_studio_posts').update({ workflow_status: 'Cancelled', cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id).select().single();
      if (error) fail('The post could not be cancelled.', 503);
      await audit(service, auth.user.id, 'post_cancelled', data.campaign_id, id, { platform_request_deleted: Boolean(post.buffer_post_id) });
      return reply({ post: data }, 200, origin);
    }

    if (action === 'emergency_stop') {
      if (input.confirmed !== true) fail('Confirm the emergency stop before continuing.');
      const campaignId = text(input.campaign_id, 100);
      await service.from('marketing_campaigns').update({ status: 'Paused', automatic_publishing_enabled: false, emergency_stopped_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', campaignId);
      const { data: queued } = await service.from('social_studio_posts').select('*').eq('campaign_id', campaignId).eq('workflow_status', 'Scheduled');
      const key = await bufferKey(service).catch(() => '');
      const results = [];
      for (const post of queued || []) {
        try {
          if (!key || !post.buffer_post_id) throw new Error('No removable platform request ID is available.');
          const result = await bufferRequest(key, `mutation { deletePost(input: { id: ${JSON.stringify(post.buffer_post_id)} }) { ... on DeletePostSuccess { id } ... on MutationError { message } } }`);
          if (result?.deletePost?.message || result?.deletePost?.id !== post.buffer_post_id) throw new Error(result?.deletePost?.message || 'Deletion was not confirmed.');
          await service.from('social_studio_posts').update({ workflow_status: 'Cancelled', cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', post.id);
          results.push({ post_id: post.id, cancelled: true });
        } catch (error) { results.push({ post_id: post.id, cancelled: false, error: (error as Error).message }); }
      }
      await audit(service, auth.user.id, 'campaign_emergency_stop', campaignId, null, { results });
      return reply({ stopped: true, results }, 200, origin);
    }

    if (action === 'record_research') {
      let url: URL;
      try { url = new URL(text(input.source_url, 1000)); }
      catch { fail('Choose a valid HTTPS research source.'); }
      if (url.protocol !== 'https:') fail('Research sources must use HTTPS.');
      const row = { campaign_id: text(input.campaign_id, 100) || null, source_type: text(input.source_type, 50), source_title: text(input.source_title, 240), source_url: url.toString(), observed_at: new Date(text(input.observed_at, 40) || new Date().toISOString()).toISOString(), evidence_summary: text(input.evidence_summary, 2000), asset_fit: text(input.asset_fit, 1200), recommendation_type: text(input.recommendation_type, 50), keywords: Array.isArray(input.keywords) ? input.keywords.map(value => text(value, 80)).filter(Boolean).slice(0, 20) : [], aggregate_audience: text(input.aggregate_audience, 500) || null, created_by: auth.user.id, updated_at: new Date().toISOString() };
      if (!row.source_title || !row.evidence_summary || !['Observed evidence', 'Experiment'].includes(row.recommendation_type)) fail('Source title, evidence summary, and evidence/experiment label are required.');
      const { data, error } = await service.from('marketing_trend_research').insert(row).select().single();
      if (error) fail('Research could not be saved.', 503);
      return reply({ research: data }, 200, origin);
    }

    fail('Unknown Marketing Agent action.');
  } catch (error) {
    const issue = error as AgentError;
    return reply({ error: issue.message || 'Marketing Agent request failed.' }, issue.status || 500, origin);
  }
});
