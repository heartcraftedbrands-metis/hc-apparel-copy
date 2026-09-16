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
  platform: ['instagram', 'facebook', 'x'],
  content_type: ['Product Promo', 'Brand Promo', 'Sale Post', 'New Arrival', 'Seasonal Post'],
  brand: ['HC Apparel', 'Shaka Wear', 'Champion', 'Columbia', 'Bella + Canvas', 'Gildan', 'Comfort Colors', 'Next Level', 'Independent Trading Co.', 'Port & Company', 'Hanes', 'District', 'Rabbit Skins', 'Lane Seven', 'adidas', 'Oakley'],
  tone: ['professional', 'bold', 'clean', 'modern', 'premium', 'streetwear'],
  audience: ['brands', 'teams', 'creators', 'churches', 'schools', 'businesses'],
  caption_length: ['short', 'medium', 'long'],
  cta: ['Shop Now', 'Order Blanks', 'Start Your Brand', 'Bulk Orders Available', 'Explore Collection'],
} as const;

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
  return groups.flat().filter(channel => ['instagram', 'facebook', 'twitter'].includes(String(channel.service)));
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
    const input = await request.json().catch(() => ({}));
    const action = input.action;

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
        .select('id,name,supplier_sku,vendor_source,image_url,mockup_images')
        .or(`name.ilike.${pattern},supplier_sku.ilike.${pattern},vendor_source.ilike.${pattern}`)
        .order('name').limit(20);
      if (error) fail('Product search failed. Please try again.', 503);
      return reply({ products: data || [] }, 200, origin);
    }

    if (action === 'generate') {
      const key = env('OPENAI_API_KEY');
      if (!key) fail('OPENAI_API_KEY is missing from the Supabase function secrets.', 503);
      const platform = pick(input.platform, options.platform, 'platform');
      const contentType = pick(input.content_type, options.content_type, 'content type');
      const brand = pick(input.brand, options.brand, 'brand');
      const tone = pick(input.tone, options.tone, 'tone');
      const audience = pick(input.audience, options.audience, 'audience');
      const captionLength = pick(input.caption_length, options.caption_length, 'caption length');
      const cta = pick(input.cta, options.cta, 'CTA');
      const notes = limited(input.notes, 1000);
      const includeHashtags = input.include_hashtags !== false;
      let product: Record<string, unknown> | null = null;
      if (input.product_id) {
        const { data, error } = await service.from('products')
          .select('id,name,description,category,image_url,mockup_images,vendor_source,supplier_sku,visibility,is_active')
          .eq('id', String(input.product_id)).maybeSingle();
        if (error || !data) fail('Selected product was not found.');
        product = data;
      }
      const imageChoices = product
        ? [product.image_url, ...(Array.isArray(product.mockup_images) ? product.mockup_images : [])]
          .map(item => typeof item === 'string' ? item : item?.image_url || item?.url || item?.src || '')
          .filter(Boolean)
        : [];
      const imageIndex = Number(input.product_image_index);
      const sourceImageUrl = Number.isInteger(imageIndex) && imageIndex >= 0 ? String(imageChoices[imageIndex] || '') : '';
      const productContext = product
        ? `Selected product: ${product.name}; category ${product.category || 'apparel'}; vendor ${product.vendor_source || 'unspecified'}; style ${product.supplier_sku || 'unspecified'}. Description: ${limited(product.description, 450)}.`
        : 'No specific product selected; focus on t-shirts, hoodies, hats, bags, and blank apparel collections.';
      const brief = `Write an HC Apparel ${platform} ${contentType} for ${audience}. Tone: ${tone}. Caption length: ${captionLength}. CTA: ${cta}. Hashtags: ${includeHashtags ? 'yes' : 'no'}. Brand focus: ${brand}. ${productContext} Admin notes: ${notes || 'none'}. Never invent prices, discounts, stock, delivery claims, or product specifications. If this is a Sale Post without an explicit price or offer, do not claim a specific sale. Use the real brand name in caption only; image should not copy third-party logos. Return JSON with keys image_prompt, caption, hashtags (hashtags as a single space-separated string).`;
      const copy = await openaiRequest('https://api.openai.com/v1/chat/completions', key, JSON.stringify({
        model: env('OPENAI_TEXT_MODEL') || 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You are a careful apparel marketing art director. Produce polished social copy and a visual prompt. Focus on blank apparel and HC Apparel olive green, cream/linen, and restrained gold. No copyrighted graphics, third-party logos in imagery, watermarks, fake pricing, or fabricated claims. Keep image text minimal because generated lettering can be unreliable.' },
          { role: 'user', content: brief },
        ],
      }));
      let generated: Record<string, unknown>;
      try { generated = JSON.parse(copy.choices?.[0]?.message?.content || '{}'); }
      catch { return fail('OpenAI returned copy that could not be parsed. Please try again.', 502); }
      const imagePrompt = `${limited(generated.image_prompt, 1800)} Square 1:1 social campaign image, polished premium apparel photography, blank garments, olive green, cream linen and restrained gold palette, clean modern composition, generous negative space, no prices, no watermarks, no copyrighted graphics, no third-party logos or readable text.`;
      if (!limited(generated.image_prompt, 1800) || !limited(generated.caption, 3000)) fail('OpenAI returned incomplete post content. Please try again.', 502);
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
      const { data: publicUrl } = service.storage.from('storefront-assets').getPublicUrl(filePath);
      const post = {
        created_by: auth.user.id, platform, content_type: contentType, brand,
        product_id: product?.id || null, product_name: product?.name || null,
        tone, audience, caption_length: captionLength, cta, include_hashtags: includeHashtags,
        notes, image_prompt: imagePrompt, source_image_url: sourceImageUrl || null,
        image_url: publicUrl.publicUrl, caption: limited(generated.caption, 3000),
        hashtags: includeHashtags ? limited(generated.hashtags, 1000) : '', status: 'draft',
      };
      const { data: saved, error: insertError } = await service.from('social_studio_posts').insert(post).select().single();
      if (insertError) fail('Image was generated but the draft could not be saved. Apply the Studio migration.', 503);
      return reply({ post: saved }, 200, origin);
    }

    if (action === 'send_buffer') {
      const id = String(input.post_id || '');
      const channelId = String(input.channel_id || '');
      const mode = input.mode === 'schedule' ? 'schedule' : 'draft';
      const key = await bufferKey(service);
      const available = await channels(key);
      const channel = available.find(item => item.id === channelId);
      if (!channel || channel.isDisconnected || channel.isLocked) fail('Choose a connected, available Buffer channel.');
      const { data: post, error: postError } = await service.from('social_studio_posts').select('*').eq('id', id).single();
      if (postError || !post) fail('Save the post before sending it to Buffer.');
      const expectedService = post.platform === 'x' ? 'twitter' : post.platform;
      if (channel.service !== expectedService) fail('The Buffer channel does not match the post platform.');
      if (post.status !== 'draft' || post.buffer_post_id) fail('This post has already been sent to Buffer. Create a new draft to send again.');
      if (!post.caption?.trim()) fail('Add a caption before sending.');
      if (post.platform === 'instagram' && !post.image_url) fail('Instagram posts need an image.');
      const text = [post.caption.trim(), post.hashtags?.trim()].filter(Boolean).join('\n\n');
      if (post.platform === 'x' && text.length > 280) fail('X posts must be 280 characters or less, including hashtags.');
      const dueAt = mode === 'schedule' && input.scheduled_at ? new Date(String(input.scheduled_at)) : null;
      if (dueAt && (!Number.isFinite(dueAt.getTime()) || dueAt.getTime() <= Date.now())) fail('Choose a future date and time.');
      const scheduling = dueAt ? `customScheduled, dueAt: ${JSON.stringify(dueAt.toISOString())}` : 'addToQueue';
      const assets = post.image_url ? `, assets: [{ image: { url: ${JSON.stringify(post.image_url)} } }]` : '';
      const mutation = `mutation { createPost(input: { text: ${JSON.stringify(text)}, channelId: ${JSON.stringify(channelId)}, schedulingType: automatic, mode: ${scheduling}${mode === 'draft' ? ', saveToDraft: true' : ''}${assets} }) { ... on PostActionSuccess { post { id dueAt } } ... on MutationError { message } } }`;
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
