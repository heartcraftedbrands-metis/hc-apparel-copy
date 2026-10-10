import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';
import {
  getSupabasePublishableKey,
  getSupabaseServiceKey,
} from '../_shared/supabaseCredentials.ts';
import {
  getStripeCredentials,
  modeFromCheckoutSessionId,
  normalizeStripeMode,
} from '../_shared/stripeCredentials.ts';
import { stripePaymentDetails } from '../_shared/stripePaymentMethod.ts';

const allowedOrigins = new Set([
  'https://www.ilovehcapparel.net',
  'https://ilovehcapparel.net',
  'https://hc-apparel-copy.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
]);

type AppError = Error & { status?: number; code?: string };
type Row = Record<string, any>;

const fail = (message: string, status = 400, code = 'invalid_request'): never => {
  const error = new Error(message) as AppError;
  error.status = status;
  error.code = code;
  throw error;
};
const text = (value: unknown, max = 1000) => String(value ?? '').trim().slice(0, max);
const money = (value: unknown) => Math.round(Number(value || 0) * 100) / 100;
const viewType = (value: unknown) => value === 'front_back' ? 'front_back' : 'single_view';
const presentationType = (value: unknown) => ['flat_lay', 'lifestyle'].includes(String(value)) ? String(value) : 'studio';
const MOCKUP_DEAL_NAME = '3 for $2 Mockup Deal';
function priceMockupDeal(rawItems: Row[]) {
  const items = rawItems.map(item => ({ ...item, catalog_price: money(item.price), discount_amount: 0, discounted_line_total: money(item.price), promotion_name: null, promotion_group: null }));
  const eligible = items.map((item, index) => ({ item, index })).filter(({ item }) => item.product_type === 'digital' && Math.round(money(item.price) * 100) === 99).sort((a, b) => String(a.item.product_id).localeCompare(String(b.item.product_id)));
  const groups = Math.floor(eligible.length / 3);
  for (let group = 0; group < groups; group += 1) {
    [32, 32, 33].forEach((discount, position) => {
      const target = eligible[group * 3 + position].item;
      target.discount_amount = discount / 100;
      target.discounted_line_total = (99 - discount) / 100;
      target.promotion_name = MOCKUP_DEAL_NAME;
      target.promotion_group = group + 1;
    });
  }
  const catalogSubtotalCents = items.reduce((sum, item) => sum + Math.round(money(item.catalog_price) * 100), 0);
  const discountCents = groups * 97;
  return { items, eligibleCount: eligible.length, groups, catalogSubtotal: catalogSubtotalCents / 100, discount: discountCents / 100, subtotal: (catalogSubtotalCents - discountCents) / 100 };
}
function stripeMockupLines(pricing: ReturnType<typeof priceMockupDeal>, qa = false): Stripe.Checkout.SessionCreateParams.LineItem[] {
  const lines: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
  for (let group = 1; group <= pricing.groups; group += 1) {
    const groupItems = pricing.items.filter(item => item.promotion_group === group);
    lines.push({ price_data: { currency: 'usd', product_data: { name: `${MOCKUP_DEAL_NAME}${qa ? ' — QA test' : ''}`, description: groupItems.map(item => item.product_name).join(' · ').slice(0, 500) }, unit_amount: 200 }, quantity: 1 });
  }
  pricing.items.filter(item => !item.promotion_group).forEach(item => lines.push({ price_data: { currency: 'usd', product_data: { name: `${item.product_name}${qa ? ' — QA test' : ''}`, description: qa ? 'Stripe test-mode Digital Mockups checkout' : 'Full-resolution PNG digital image download' }, unit_amount: Math.round(money(item.price) * 100) }, quantity: 1 }));
  return lines;
}
const validPrice = (value: unknown, field = 'price') => {
  const parsed = money(value);
  if (!Number.isFinite(parsed) || parsed < 0.01 || parsed > 10000) fail(`Enter a valid ${field}.`, 400, 'invalid_price');
  return parsed;
};
const configuredPrice = (settings: Row | null, type: string, override: unknown = null) => {
  if (override !== null && override !== undefined && String(override).trim() !== '') return validPrice(override, 'price override');
  return validPrice(type === 'front_back' ? settings?.front_back_price : settings?.single_view_price, 'default price');
};
const safeEmail = (value: unknown) => text(value, 254).toLowerCase();
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const htmlEscape = (value: unknown) => text(value, 2000)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const response = (body: unknown, status: number, origin: string) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json',
    'access-control-allow-origin': allowedOrigins.has(origin) ? origin : 'https://www.ilovehcapparel.net',
    'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
    'access-control-allow-methods': 'POST, OPTIONS',
    'cache-control': 'no-store',
    'vary': 'Origin',
  },
});

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('');
const sha256 = async (bytes: Uint8Array) => hex(await crypto.subtle.digest('SHA-256', bytes));
const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
  .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');

async function guestAccessToken(secret: string, orderId: string, email: string) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${orderId}|${email.toLowerCase()}`));
  return base64url(new Uint8Array(signature));
}

function pngDimensions(bytes: Uint8Array) {
  if (bytes.length < 24 || ![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) {
    fail('Only valid PNG files are supported in this launch collection.', 400, 'invalid_png');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (!width || !height || width > 30000 || height > 30000) fail('The PNG dimensions are invalid.', 400, 'invalid_dimensions');
  return { width, height };
}

function slugify(value: string) {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 72) || 'digital-mockup';
}

function customerDownloadFileName(title: unknown, originalFileName: unknown, fileExtension: unknown = '') {
  const original = text(originalFileName, 255);
  const extension = text(fileExtension, 12).replace(/^\.+/, '').replace(/[^a-z0-9]/gi, '').toLowerCase()
    || original.split('.').pop()?.replace(/[^a-z0-9]/gi, '').toLowerCase()
    || 'png';
  let base = text(title, 180).normalize('NFKD')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/[\u2018\u2019\u201a\u201b]/g, "'")
    .replace(/[\u201c\u201d\u201e\u201f]/g, '"')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/[.\s]+$/g, '')
    .trim();
  if (!base) base = 'HC Apparel Digital Mockup';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(base)) base = `HC Apparel ${base}`;
  return `${base}.${extension}`;
}

function publicPreviewUrl(supabaseUrl: string, path: string) {
  return `${supabaseUrl}/storage/v1/object/public/storefront-assets/${path.split('/').map(encodeURIComponent).join('/')}`;
}

async function currentUser(request: Request, url: string, publishableKey: string) {
  const authHeader = request.headers.get('authorization') || '';
  if (!/^Bearer\s+\S+/i.test(authHeader)) return null;
  const client = createClient(url, publishableKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  const { data: profile } = await client.from('profiles').select('id,email,role').eq('id', user.id).maybeSingle();
  return { ...user, role: profile?.role || 'customer', email: profile?.email || user.email || '' };
}

async function requireAdmin(request: Request, url: string, publishableKey: string) {
  const user = await currentUser(request, url, publishableKey);
  if (!user || user.role !== 'admin') fail('Administrator access is required.', 403, 'admin_required');
  return user;
}

async function loadCatalog(service: ReturnType<typeof createClient>, input: Row) {
  const page = Math.max(1, Math.min(10000, Number(input.page || 1)));
  const perPage = Math.max(1, Math.min(48, Number(input.per_page || 12)));
  const start = (page - 1) * perPage;
  let query = service.from('storefront_digital_mockups').select('*', { count: 'exact' });
  const search = text(input.search, 120).replace(/[%_,]/g, ' ');
  if (search) query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%,sku.ilike.%${search}%`);
  const garmentType = text(input.garment_type, 80);
  const colorName = text(input.color_name, 80);
  const selectedViewType = text(input.view_type, 30);
  const selectedPresentationType = text(input.presentation_type, 30);
  if (garmentType) query = query.eq('garment_type', garmentType);
  if (colorName) query = query.eq('color_name', colorName);
  if (selectedViewType && ['single_view', 'front_back'].includes(selectedViewType)) query = query.eq('view_type', selectedViewType);
  if (selectedPresentationType && ['studio', 'flat_lay', 'lifestyle'].includes(selectedPresentationType)) query = query.eq('presentation_type', selectedPresentationType);
  if (input.deal_eligible === true) query = query.eq('price', 0.99);
  const sort = text(input.sort, 30);
  if (sort === 'price_low') query = query.order('price', { ascending: true }).order('created_at', { ascending: false });
  else if (sort === 'price_high') query = query.order('price', { ascending: false }).order('created_at', { ascending: false });
  else query = query.order('published_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
  const [{ data, count, error }, { data: options }, { data: settings }] = await Promise.all([
    query.range(start, start + perPage - 1),
    service.from('storefront_digital_mockups').select('garment_type,color_name,view_type,presentation_type').limit(1000),
    service.from('digital_mockup_settings').select('heading,description,button_label,supporting_text,right_headline,quality_label,launch_detail,featured_asset_id,hero_image_url,hero_image_width,hero_image_height,default_price,single_view_price,front_back_price,raster_format,license_terms,license_status').eq('id', true).maybeSingle(),
  ]);
  if (error) fail('The Digital Mockups catalog is temporarily unavailable.', 503, 'catalog_unavailable');
  const garments = [...new Set((options || []).map(row => row.garment_type).filter(Boolean))].sort();
  const colors = [...new Set((options || []).map(row => row.color_name).filter(Boolean))].sort();
  const viewTypes = [...new Set((options || []).map(row => row.view_type).filter(Boolean))].sort();
  const presentationTypes = [...new Set((options || []).map(row => row.presentation_type).filter(Boolean))].sort();
  let featured = (data || []).find(row => row.is_featured) || (data || [])[0] || null;
  if (settings?.featured_asset_id) {
    const featuredResult = await service.from('storefront_digital_mockups').select('*').eq('id', settings.featured_asset_id).maybeSingle();
    featured = featuredResult.data || featured;
  }
  return {
    items: data || [],
    page,
    per_page: perPage,
    total: count || 0,
    has_more: start + perPage < (count || 0),
    filters: { garment_types: garments, colors, view_types: viewTypes, presentation_types: presentationTypes },
    hero: { ...(settings || {}), featured },
  };
}

async function sendConfirmationEmail(service: ReturnType<typeof createClient>, order: Row, accessToken: string) {
  const { data: access } = await service.from('digital_mockup_order_access').select('*').eq('order_id', order.id).maybeSingle();
  if (!access || access.confirmation_email_status === 'accepted' || access.confirmation_email_status === 'sending') return access?.confirmation_email_status || 'missing';
  const { data: claimed } = await service.from('digital_mockup_order_access')
    .update({ confirmation_email_status: 'sending', confirmation_email_attempts: Number(access.confirmation_email_attempts || 0) + 1, confirmation_email_error: null })
    .eq('order_id', order.id).in('confirmation_email_status', ['pending', 'failed', 'not_configured']).select('order_id').maybeSingle();
  if (!claimed) return 'already_claimed';
  const apiKey = text(Deno.env.get('BREVO_API_KEY'), 500);
  const senderEmail = text(Deno.env.get('INVOICE_SENDER_EMAIL') || 'support@ilovehcapparel.net', 254);
  const senderName = text(Deno.env.get('INVOICE_SENDER_NAME') || 'HC Apparel', 120);
  if (!apiKey) {
    await service.from('digital_mockup_order_access').update({ confirmation_email_status: 'not_configured', confirmation_email_error: 'Brevo email delivery is not configured.' }).eq('order_id', order.id);
    return 'not_configured';
  }
  const accessUrl = `https://www.ilovehcapparel.net/MyDownloads?orderId=${encodeURIComponent(order.id)}&access=${encodeURIComponent(accessToken)}`;
  const itemLines = (Array.isArray(order.order_items) ? order.order_items : []).filter((item: Row) => item.product_type === 'digital').map((item: Row) => `<li>${htmlEscape(item.product_name)} — $${money(item.catalog_price ?? item.price).toFixed(2)}</li>`).join('');
  const discount = money(order.pricing_snapshot?.mockup_promotion?.discount_amount || 0);
  const promotionLine = discount > 0 ? `<p><strong>${MOCKUP_DEAL_NAME}:</strong> -$${discount.toFixed(2)}</p>` : '';
  const html = `<div style="font-family:Arial,sans-serif;color:#202126;line-height:1.55"><h1 style="color:#4a5e2a">Your HC Apparel mockups are ready</h1><p>Thank you for your purchase. Payment for order <strong>${htmlEscape(text(order.id, 80).slice(-8).toUpperCase())}</strong> has been confirmed.</p><ul>${itemLines}</ul>${promotionLine}<p><strong>Total paid:</strong> $${money(order.total_amount).toFixed(2)} USD</p><p><a href="${accessUrl}" style="display:inline-block;background:#4a5e2a;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">Access My Downloads</a></p><p>This secure page creates short-lived download links for the original, watermark-free files. Keep this email for future access.</p><p>Questions? Email support@ilovehcapparel.net.</p></div>`;
  try {
    const brevo = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ sender: { email: senderEmail, name: senderName }, to: [{ email: order.customer_email, name: order.customer_name }], subject: `Your HC Apparel mockups are ready — ${String(order.id).slice(-8).toUpperCase()}`, htmlContent: html }),
      signal: AbortSignal.timeout(15000),
    });
    const result = await brevo.json().catch(() => ({}));
    if (!brevo.ok) throw new Error(`Brevo rejected the confirmation email (${brevo.status}).`);
    await service.from('digital_mockup_order_access').update({ confirmation_email_status: 'accepted', confirmation_email_provider_id: text(result.messageId, 200) || null, confirmation_email_accepted_at: new Date().toISOString(), confirmation_email_error: null }).eq('order_id', order.id);
    return 'accepted';
  } catch (error) {
    const safe = text(error instanceof Error ? error.message : 'Email delivery failed.', 300);
    await service.from('digital_mockup_order_access').update({ confirmation_email_status: 'failed', confirmation_email_error: safe }).eq('order_id', order.id);
    return 'failed';
  }
}

async function finalizePayment(service: ReturnType<typeof createClient>, stripe: Stripe, session: Stripe.Checkout.Session, source: 'stripe_webhook' | 'stripe_verification', eventId: string, accessSecret: string) {
  const orderId = text(session.metadata?.internal_order_id, 100);
  const { data: order, error } = await service.from('orders').select('*').eq('id', orderId).maybeSingle();
  if (error || !order) fail('The paid order could not be found.', 404, 'order_not_found');
  const digitalOnly = order.checkout_source === 'digital_mockup_order' && session.metadata?.source === 'hc_apparel_digital_mockups';
  const mixed = order.checkout_source === 'mixed_storefront_order' && session.metadata?.source === 'hc_apparel_mixed_storefront';
  if (!digitalOnly && !mixed) fail('The payment session does not match this digital order.', 403, 'session_mismatch');
  if (session.payment_status !== 'paid') return { paid: false, order_id: order.id, payment_status: session.payment_status };
  if (session.currency !== 'usd' || Number(session.amount_total) !== Math.round(Number(order.total_amount) * 100)) fail('The paid amount does not match this order.', 409, 'amount_mismatch');
  if ((order.stripe_mode || 'test') !== (session.livemode ? 'live' : 'test')) fail('The Stripe mode does not match this order.', 409, 'mode_mismatch');
  if (order.payment_status !== 'paid') {
    const details = await stripePaymentDetails(stripe, session);
    const { error: updateError } = await service.rpc('digital_mockup_mark_paid', {
      p_order_id: order.id,
      p_payment_method: details.label,
      p_payment_method_type: details.type,
      p_actual_processing_cost: details.actualProcessingCost,
      p_confirmation_source: source,
      p_provider_event_id: eventId,
      p_session_id: session.id,
      p_payment_intent_id: String(session.payment_intent || ''),
    });
    if (updateError) fail('Payment was verified, but the order could not be updated.', 500, 'order_update_failed');
  }
  const digitalItems = (Array.isArray(order.order_items) ? order.order_items : []).filter((item: Row) => item.product_type === 'digital');
  if (!digitalItems.length) fail('The digital order has no downloadable items.', 409, 'missing_items');
  const entitlementRows = digitalItems.map((item: Row) => ({
    order_id: order.id,
    product_id: item.product_id,
    version_id: item.digital_mockup_version_id,
    owner_user_id: order.owner_user_id || null,
    customer_email: order.customer_email,
  }));
  const { error: entitlementError } = await service.from('digital_download_entitlements').upsert(entitlementRows, { onConflict: 'order_id,product_id,version_id', ignoreDuplicates: true });
  if (entitlementError) fail('Payment was verified, but download access could not be granted.', 500, 'entitlement_failed');
  if (mixed) {
    await service.from('digital_mockup_order_access').upsert({
      order_id: order.id,
      customer_email: order.customer_email,
      checkout_attempt_key: `mixed-${order.id}`,
      stripe_mode: session.livemode ? 'live' : 'test',
    }, { onConflict: 'order_id', ignoreDuplicates: true });
  }
  await service.from('digital_mockup_order_access').update({ delivery_status: 'available' }).eq('order_id', order.id);
  const token = await guestAccessToken(accessSecret, order.id, order.customer_email);
  const emailStatus = await sendConfirmationEmail(service, order, token);
  let testArchive: Row | null = null;
  if (order.is_sample === true) {
    const { data: archived, error: archiveError } = await service.rpc('archive_confirmed_test_order', {
      p_order_id: order.id,
      p_reason: 'Digital Mockups Stripe sandbox checkout verification',
      p_provenance: 'verified Stripe test checkout session',
      p_environment: 'test',
    });
    if (archiveError) {
      console.error('Digital Mockups test order archive failed', { order_id: order.id, code: archiveError.code || 'unknown' });
    } else {
      testArchive = archived;
    }
  }
  return { paid: true, order_id: order.id, email_status: emailStatus, access_token: token, total: money(order.total_amount), mockup_promotion: order.pricing_snapshot?.mockup_promotion || null, test_archive: testArchive };
}

Deno.serve(async request => {
  const origin = request.headers.get('origin') || '';
  if (request.method === 'OPTIONS') return response({}, 200, origin);
  if (request.method !== 'POST') return response({ error: 'Method not allowed.' }, 405, origin);
  try {
    const url = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = getSupabaseServiceKey();
    const publishableKey = getSupabasePublishableKey();
    if (!url || !serviceKey || !publishableKey) fail('Digital Mockups is not configured.', 503, 'configuration_missing');
    const service = createClient(url, serviceKey, { db: { schema: 'public' } });
    const contentType = request.headers.get('content-type') || '';
    const input: Row = contentType.includes('multipart/form-data') ? Object.fromEntries((await request.formData()).entries()) : await request.json();
    const action = text(input.action, 60);
    const accessSecret = Deno.env.get('DIGITAL_DOWNLOAD_SIGNING_SECRET')?.trim() || serviceKey;

    if (action === 'webhook_finalize') {
      if (request.headers.get('authorization') !== `Bearer ${serviceKey}`) fail('Service access denied.', 403, 'service_denied');
      const sessionId = text(input.session_id, 200);
      const eventId = text(input.event_id, 200);
      const stripeMode = modeFromCheckoutSessionId(sessionId);
      if (!stripeMode || stripeMode !== input.stripe_mode) fail('Stripe session mode is invalid.', 400, 'mode_mismatch');
      const credentials = getStripeCredentials(stripeMode);
      if (!credentials.configured || !credentials.secretKey) fail('Stripe is not configured.', 503, 'stripe_unavailable');
      const stripe = new Stripe(credentials.secretKey);
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      return response(await finalizePayment(service, stripe, session, 'stripe_webhook', eventId, accessSecret), 200, origin);
    }

    if (action === 'catalog') return response(await loadCatalog(service, input), 200, origin);
    if (action === 'detail') {
      const slug = text(input.slug, 100);
      const { data, error } = await service.from('storefront_digital_mockups').select('*').eq('slug', slug).maybeSingle();
      if (error || !data) fail('This digital mockup is not available.', 404, 'not_found');
      const { data: settings } = await service.from('digital_mockup_settings').select('license_terms,license_status').eq('id', true).single();
      return response({ item: data, terms: settings }, 200, origin);
    }

    if (action === 'admin_upload') {
      const admin = await requireAdmin(request, url, publishableKey);
      const original = input.original;
      const preview = input.preview;
      if (!(original instanceof File) || !(preview instanceof File)) fail('Choose a PNG original to upload.', 400, 'file_required');
      if (original.size > 60 * 1024 * 1024) fail('The original exceeds the 60 MB upload limit.', 413, 'file_too_large');
      if (preview.size > 8 * 1024 * 1024) fail('The watermarked preview exceeds 8 MB.', 413, 'preview_too_large');
      const bytes = new Uint8Array(await original.arrayBuffer());
      const dimensions = pngDimensions(bytes);
      const digest = await sha256(bytes);
      const { data: duplicate } = await service.from('digital_mockup_versions').select('asset_id,original_file_name,pixel_width,pixel_height').eq('original_sha256', digest).maybeSingle();
      if (duplicate) {
        const { data: asset } = await service.from('digital_mockup_assets').select('id,slug,sku,product_id,publication_status').eq('id', duplicate.asset_id).single();
        return response({ duplicate: true, asset, version: duplicate, message: 'This exact file is already in Digital Mockups. No duplicate was created.' }, 200, origin);
      }
      const metadata = JSON.parse(text(input.metadata, 8000) || '{}');
      const selectedViewType = viewType(metadata.view_type);
      const selectedPresentationType = presentationType(metadata.presentation_type);
      const { data: priceSettings } = await service.from('digital_mockup_settings').select('single_view_price,front_back_price').eq('id', true).single();
      const assetId = crypto.randomUUID();
      const productId = crypto.randomUUID();
      const versionId = crypto.randomUUID();
      const title = text(metadata.title, 180) || `Blank ${text(metadata.color_name, 80) || 'Apparel'} T-Shirt Mockup`;
      const sku = text(metadata.sku, 80).toUpperCase().replace(/[^A-Z0-9-]+/g, '-') || `HCM-${digest.slice(0, 10).toUpperCase()}`;
      const slug = `${slugify(text(metadata.slug, 100) || title)}-${digest.slice(0, 7)}`;
      const description = text(metadata.description, 2000) || (selectedViewType === 'front_back'
        ? `${title}. Front and back views included in one PNG. Digital image download. No physical garment included.`
        : `${title}. Full-resolution PNG digital image download for presenting your artwork. Digital image download. No physical garment included.`);
      const priceOverride = metadata.price_override === null || metadata.price_override === undefined || String(metadata.price_override).trim() === '' ? null : validPrice(metadata.price_override, 'price override');
      const price = configuredPrice(priceSettings, selectedViewType, priceOverride);
      const originalPath = `${assetId}/v1/${digest}.png`;
      const previewPath = `digital-mockups/${assetId}/v1-preview.png`;
      const [originalUpload, previewUpload] = await Promise.all([
        service.storage.from('digital-mockup-originals').upload(originalPath, bytes, { contentType: 'image/png', upsert: false }),
        service.storage.from('storefront-assets').upload(previewPath, new Uint8Array(await preview.arrayBuffer()), { contentType: preview.type || 'image/png', upsert: false }),
      ]);
      if (originalUpload.error || previewUpload.error) {
        await Promise.all([service.storage.from('digital-mockup-originals').remove([originalPath]), service.storage.from('storefront-assets').remove([previewPath])]);
        fail('The file could not be stored. Retry is safe.', 503, 'storage_failed');
      }
      const previewUrl = publicPreviewUrl(url, previewPath);
      const tags = Array.isArray(metadata.tags) ? metadata.tags.map((tag: unknown) => text(tag, 60)).filter(Boolean).slice(0, 20) : [];
      const { error: productError } = await service.rpc('digital_mockup_create_product', {
        p_id: productId, p_owner_user_id: admin.id, p_created_by_email: admin.email,
        p_name: title, p_description: description, p_price: price,
        p_image_url: previewUrl, p_tags: tags, p_supplier_sku: sku,
      });
      if (productError) {
        await Promise.all([service.storage.from('digital-mockup-originals').remove([originalPath]), service.storage.from('storefront-assets').remove([previewPath])]);
        // This branch is admin-only. Include the database's safe diagnostic text so
        // production catalog drift is actionable without exposing credentials or
        // leaving operators with an unhelpful generic upload failure.
        fail(`The product record could not be created: ${text(productError.message, 500)} Retry is safe.`, 500, `product_save_failed:${text(productError.code, 60)}`);
      }
      const { error: assetError } = await service.from('digital_mockup_assets').insert({
        id: assetId, product_id: productId, slug, sku,
        garment_type: text(metadata.garment_type, 80) || 't_shirt', color_name: text(metadata.color_name, 80) || 'Unspecified',
        tags, view_type: selectedViewType, presentation_type: selectedPresentationType, price_override: priceOverride, publication_status: 'draft', created_by: admin.id,
      });
      const { error: versionError } = assetError ? { error: assetError } : await service.from('digital_mockup_versions').insert({
        id: versionId, asset_id: assetId, version_number: 1, original_storage_path: originalPath,
        preview_storage_path: previewPath, preview_url: previewUrl, original_file_name: text(original.name, 255),
        original_sha256: digest, mime_type: 'image/png', file_extension: 'png', pixel_width: dimensions.width,
        pixel_height: dimensions.height, file_size_bytes: original.size, created_by: admin.id,
      });
      if (assetError || versionError) {
        await service.rpc('digital_mockup_hide_orphan_product', { p_product_id: productId });
        await Promise.all([service.storage.from('digital-mockup-originals').remove([originalPath]), service.storage.from('storefront-assets').remove([previewPath])]);
        fail('The mockup metadata could not be saved. Retry is safe.', 500, 'metadata_save_failed');
      }
      await service.from('digital_mockup_assets').update({ current_version_id: versionId }).eq('id', assetId);
      return response({ created: true, duplicate: false, asset_id: assetId, product_id: productId, version_id: versionId, slug, sku, view_type: selectedViewType, presentation_type: selectedPresentationType, price, dimensions, file_size_bytes: original.size, preview_url: previewUrl }, 201, origin);
    }

    if (action === 'admin_list') {
      await requireAdmin(request, url, publishableKey);
      const { data: assets, error } = await service.from('digital_mockup_assets').select('*').order('created_at', { ascending: false }).limit(500);
      const { data: settings } = await service.from('digital_mockup_settings').select('*').eq('id', true).single();
      if (error) fail(`The Digital Mockups admin catalog could not be loaded: ${text(error.message, 500)}`, 500, `admin_catalog_failed:${text(error.code, 60)}`);
      const assetRows = assets || [];
      const productIds = assetRows.map(asset => asset.product_id);
      const assetIds = assetRows.map(asset => asset.id);
      const [{ data: products, error: productsError }, { data: versions, error: versionsError }] = await Promise.all([
        productIds.length ? service.from('products').select('*').in('id', productIds) : { data: [], error: null },
        assetIds.length ? service.from('digital_mockup_versions').select('*').in('asset_id', assetIds) : { data: [], error: null },
      ]);
      if (productsError || versionsError) fail(`The Digital Mockups admin catalog details could not be loaded: ${text(productsError?.message || versionsError?.message, 500)}`, 500, 'admin_catalog_details_failed');
      const productMap = new Map((products || []).map(product => [product.id, product]));
      const hydrated = assetRows.map(asset => ({
        ...asset,
        products: productMap.get(asset.product_id) || null,
        digital_mockup_versions: (versions || []).filter(version => version.asset_id === asset.id),
      }));
      return response({ assets: hydrated, settings }, 200, origin);
    }

    if (action === 'admin_original_source') {
      await requireAdmin(request, url, publishableKey);
      const assetId = text(input.asset_id, 80);
      const { data: asset } = await service.from('digital_mockup_assets').select('id,current_version_id').eq('id', assetId).maybeSingle();
      if (!asset?.current_version_id) fail('Mockup original not found.', 404, 'not_found');
      const { data: version } = await service.from('digital_mockup_versions').select('id,original_storage_path,original_file_name,pixel_width,pixel_height').eq('id', asset.current_version_id).maybeSingle();
      if (!version) fail('Mockup original not found.', 404, 'not_found');
      const { data: signed, error } = await service.storage.from('digital-mockup-originals').createSignedUrl(version.original_storage_path, 300);
      if (error || !signed?.signedUrl) fail('A temporary source link could not be created.', 503, 'source_link_failed');
      return response({ source_url: signed.signedUrl, original_file_name: version.original_file_name, pixel_width: version.pixel_width, pixel_height: version.pixel_height, expires_in: 300 }, 200, origin);
    }

    if (action === 'admin_replace_derivatives') {
      const admin = await requireAdmin(request, url, publishableKey);
      const assetId = text(input.asset_id, 80);
      const preview = input.preview;
      const hero = input.hero;
      if (!(preview instanceof File)) fail('Choose a generated product preview.', 400, 'preview_required');
      if (preview.size > 8 * 1024 * 1024) fail('The product preview exceeds 8 MB.', 413, 'preview_too_large');
      if (hero !== undefined && !(hero instanceof File)) fail('The hero derivative is invalid.', 400, 'hero_invalid');
      if (hero instanceof File && hero.size > 12 * 1024 * 1024) fail('The hero derivative exceeds 12 MB.', 413, 'hero_too_large');
      const { data: asset } = await service.from('digital_mockup_assets').select('id,product_id,current_version_id').eq('id', assetId).maybeSingle();
      if (!asset?.current_version_id) fail('Mockup not found.', 404, 'not_found');
      const { data: version } = await service.from('digital_mockup_versions').select('id,version_number,pixel_width,pixel_height').eq('id', asset.current_version_id).maybeSingle();
      if (!version) fail('The current mockup version is missing.', 409, 'version_missing');
      const previewBytes = new Uint8Array(await preview.arrayBuffer());
      const previewDimensions = pngDimensions(previewBytes);
      if (Math.max(previewDimensions.width, previewDimensions.height) > 1200) fail('The product preview is larger than the protected-preview limit.', 400, 'preview_dimensions_invalid');
      const originalRatio = Number(version.pixel_width) / Number(version.pixel_height);
      if (Math.abs(previewDimensions.width / previewDimensions.height - originalRatio) > 0.01) fail('The product preview proportions do not match the original.', 400, 'preview_ratio_mismatch');
      const previewDigest = await sha256(previewBytes);
      const previewPath = `digital-mockups/${asset.id}/v${version.version_number}-preview-clean-v2-${previewDigest.slice(0, 12)}.png`;
      const { error: previewUploadError } = await service.storage.from('storefront-assets').upload(previewPath, previewBytes, { contentType: 'image/png', upsert: true });
      if (previewUploadError) fail('The product preview could not be stored.', 503, 'preview_storage_failed');
      const previewUrl = publicPreviewUrl(url, previewPath);
      let heroValues: Row = {};
      if (hero instanceof File) {
        const heroBytes = new Uint8Array(await hero.arrayBuffer());
        const heroDimensions = pngDimensions(heroBytes);
        if (Math.max(heroDimensions.width, heroDimensions.height) > 1600) fail('The hero derivative is larger than the public-hero limit.', 400, 'hero_dimensions_invalid');
        if (Math.abs(heroDimensions.width / heroDimensions.height - originalRatio) > 0.01) fail('The hero proportions do not match the original.', 400, 'hero_ratio_mismatch');
        const heroDigest = await sha256(heroBytes);
        const heroPath = `digital-mockups/${asset.id}/v${version.version_number}-hero-clean-v1-${heroDigest.slice(0, 12)}.png`;
        const { error: heroUploadError } = await service.storage.from('storefront-assets').upload(heroPath, heroBytes, { contentType: 'image/png', upsert: true });
        if (heroUploadError) fail('The public hero image could not be stored.', 503, 'hero_storage_failed');
        heroValues = { hero_preview_storage_path: heroPath, hero_preview_url: publicPreviewUrl(url, heroPath), hero_preview_width: heroDimensions.width, hero_preview_height: heroDimensions.height };
      }
      const [{ error: versionError }, { error: productError }] = await Promise.all([
        service.from('digital_mockup_versions').update({ preview_storage_path: previewPath, preview_url: previewUrl, ...heroValues }).eq('id', version.id),
        service.rpc('digital_mockup_replace_preview', { p_product_id: asset.product_id, p_image_url: previewUrl }),
      ]);
      if (versionError || productError) fail('The regenerated public preview could not be linked to the existing product.', 500, 'preview_link_failed');
      if (heroValues.hero_preview_url) {
        const { data: settings } = await service.from('digital_mockup_settings').select('featured_asset_id').eq('id', true).single();
        if (settings?.featured_asset_id === asset.id) {
          await service.from('digital_mockup_settings').update({ hero_image_url: heroValues.hero_preview_url, hero_image_width: heroValues.hero_preview_width, hero_image_height: heroValues.hero_preview_height, updated_by: admin.id }).eq('id', true);
        }
      }
      return response({ saved: true, preview_url: previewUrl, preview_dimensions: previewDimensions, hero: heroValues.hero_preview_url ? { url: heroValues.hero_preview_url, width: heroValues.hero_preview_width, height: heroValues.hero_preview_height } : null }, 200, origin);
    }

    if (action === 'admin_update') {
      const admin = await requireAdmin(request, url, publishableKey);
      const assetId = text(input.asset_id, 80);
      const { data: asset } = await service.from('digital_mockup_assets').select('*').eq('id', assetId).maybeSingle();
      if (!asset) fail('Mockup not found.', 404, 'not_found');
      const { data: product } = await service.from('products').select('*').eq('id', asset.product_id).maybeSingle();
      if (!product) fail('The mockup product record is missing.', 409, 'product_missing');
      const status = ['draft', 'published', 'unpublished', 'archived'].includes(input.publication_status) ? input.publication_status : asset.publication_status;
      const title = text(input.title, 180) || product.name;
      const description = text(input.description, 2000) || product.description;
      const selectedViewType = viewType(input.view_type ?? asset.view_type);
      const selectedPresentationType = presentationType(input.presentation_type ?? asset.presentation_type);
      const priceOverride = input.price_override === null || input.price_override === undefined || String(input.price_override).trim() === '' ? null : validPrice(input.price_override, 'price override');
      const { data: priceSettings } = await service.from('digital_mockup_settings').select('single_view_price,front_back_price').eq('id', true).single();
      const price = configuredPrice(priceSettings, selectedViewType, priceOverride);
      const tags = Array.isArray(input.tags) ? input.tags.map((tag: unknown) => text(tag, 60)).filter(Boolean).slice(0, 20) : asset.tags;
      const visibility = status === 'published' ? 'public' : status === 'archived' ? 'admin_archive' : 'draft';
      const [{ error: productError }, { error: assetError }] = await Promise.all([
        service.rpc('digital_mockup_update_product', {
          p_product_id: asset.product_id, p_name: title, p_description: description,
          p_price: price, p_visibility: visibility,
          p_is_active: status === 'published', p_tags: tags,
        }),
        service.from('digital_mockup_assets').update({ garment_type: text(input.garment_type, 80) || asset.garment_type, color_name: text(input.color_name, 80) || asset.color_name, tags, view_type: selectedViewType, presentation_type: selectedPresentationType, price_override: priceOverride, publication_status: status, published_at: status === 'published' ? (asset.published_at || new Date().toISOString()) : asset.published_at }).eq('id', asset.id),
      ]);
      if (productError || assetError) fail('The mockup changes could not be saved.', 500, 'update_failed');
      if (input.is_featured === true) {
        await service.from('digital_mockup_assets').update({ is_featured: false }).neq('id', asset.id);
        await service.from('digital_mockup_assets').update({ is_featured: true }).eq('id', asset.id);
        const { data: featuredVersion } = await service.from('digital_mockup_versions').select('hero_preview_url,hero_preview_width,hero_preview_height').eq('id', asset.current_version_id).maybeSingle();
        await service.from('digital_mockup_settings').update({ featured_asset_id: asset.id, hero_image_url: featuredVersion?.hero_preview_url || null, hero_image_width: featuredVersion?.hero_preview_width || null, hero_image_height: featuredVersion?.hero_preview_height || null, updated_by: admin.id }).eq('id', true);
      }
      return response({ saved: true }, 200, origin);
    }

    if (action === 'admin_update_hero') {
      const admin = await requireAdmin(request, url, publishableKey);
      const values: Row = { updated_by: admin.id };
      for (const key of ['heading', 'description', 'button_label', 'supporting_text', 'right_headline', 'quality_label', 'launch_detail', 'license_terms']) {
        if (input[key] !== undefined) values[key] = text(input[key], key === 'license_terms' ? 5000 : 1000);
      }
      if (input.license_status && ['proposed', 'approved'].includes(input.license_status)) values.license_status = input.license_status;
      if (input.single_view_price !== undefined) values.single_view_price = validPrice(input.single_view_price, 'single-view price');
      if (input.front_back_price !== undefined) values.front_back_price = validPrice(input.front_back_price, 'front-and-back price');
      if (input.default_price !== undefined) values.default_price = validPrice(input.default_price, 'legacy default price');
      if (values.single_view_price !== undefined) values.default_price = values.single_view_price;
      const { error } = await service.from('digital_mockup_settings').update(values).eq('id', true);
      if (error) fail('Hero settings could not be saved.', 500, 'settings_failed');
      return response({ saved: true }, 200, origin);
    }

    if (action === 'admin_test_readiness') {
      await requireAdmin(request, url, publishableKey);
      const [{ count: publishedCount }, { data: firstVersion }, bucketResult] = await Promise.all([
        service.from('digital_mockup_assets').select('id', { count: 'exact', head: true }).eq('publication_status', 'published'),
        service.from('digital_mockup_versions').select('original_storage_path').order('created_at', { ascending: true }).limit(1).maybeSingle(),
        service.storage.getBucket('digital-mockup-originals'),
      ]);
      let anonymousStatus: number | null = null;
      if (firstVersion?.original_storage_path) {
        const publicOriginalUrl = `${url}/storage/v1/object/public/digital-mockup-originals/${firstVersion.original_storage_path.split('/').map(encodeURIComponent).join('/')}`;
        const anonymousCheck = await fetch(publicOriginalUrl, { method: 'HEAD', signal: AbortSignal.timeout(10000) }).catch(() => null);
        anonymousStatus = anonymousCheck?.status ?? null;
      }
      const testStripe = getStripeCredentials('test');
      return response({
        published_count: publishedCount || 0,
        private_originals: bucketResult.data?.public === false && anonymousStatus !== 200,
        original_bucket_public: bucketResult.data?.public ?? null,
        anonymous_original_http_status: anonymousStatus,
        stripe_test_checkout_ready: testStripe.configured && testStripe.secretKeyFormatValid,
        stripe_test_webhook_ready: testStripe.webhookSecretFormatValid,
        brevo_ready: Boolean(text(Deno.env.get('BREVO_API_KEY'), 500)),
        checked_at: new Date().toISOString(),
      }, 200, origin);
    }

    if (action === 'admin_create_test_checkout') {
      const admin = await requireAdmin(request, url, publishableKey);
      const testStripe = getStripeCredentials('test');
      if (!testStripe.configured || !testStripe.secretKey) fail('Stripe test checkout requires its server key and signed webhook secret.', 503, 'stripe_test_unavailable');
      if (!validEmail(safeEmail(admin.email))) fail('Your admin account needs a valid email address for the confirmation-email test.', 409, 'admin_email_required');
      const requestedIds = Array.isArray(input.product_ids) ? [...new Set(input.product_ids.map((id: unknown) => text(id, 80)).filter(Boolean))] : [];
      if (requestedIds.length !== 3) fail('Choose exactly three published $0.99 mockups for the deal test.', 400, 'test_products_required');
      const [{ data: assets, error: assetError }, { data: products, error: productError }] = await Promise.all([
        service.from('digital_mockup_assets').select('id,product_id,current_version_id,publication_status,view_type').in('product_id', requestedIds).eq('publication_status', 'published'),
        service.from('products').select('id,name,price,sale_price,visibility,is_active,product_type').in('id', requestedIds),
      ]);
      if (assetError || productError || assets?.length !== 3 || products?.length !== 3) fail('All three test mockups must be published and available.', 409, 'test_product_missing');
      const assetMap = new Map((assets || []).map(asset => [asset.product_id, asset]));
      const rawItems = requestedIds.map(id => {
        const product = (products || []).find(row => row.id === id);
        const asset = assetMap.get(id);
        const price = money(product?.sale_price ?? product?.price);
        if (!product || !asset?.current_version_id || product.product_type !== 'digital' || product.visibility !== 'public' || !product.is_active || Math.round(price * 100) !== 99) fail('Each deal-test mockup must be an available $0.99 digital product.', 409, 'test_product_unavailable');
        return { product_id: product.id, product_name: product.name, quantity: 1, price, product_type: 'digital', digital_mockup_asset_id: asset.id, digital_mockup_version_id: asset.current_version_id, view_type: viewType(asset.view_type), delivery: 'secure_download' };
      });
      const pricing = priceMockupDeal(rawItems);
      if (pricing.groups !== 1 || money(pricing.subtotal) !== 2) fail('The sandbox deal calculation did not produce $2.00.', 500, 'test_deal_failed');
      const orderId = crypto.randomUUID();
      const customerEmail = safeEmail(admin.email);
      const customerName = 'HC Apparel QA';
      const attemptKey = `admin-qa-${crypto.randomUUID()}`;
      const token = await guestAccessToken(accessSecret, orderId, customerEmail);
      const { error: orderError } = await service.rpc('digital_mockup_create_order', { p_order: {
        id: orderId,
        owner_user_id: admin.id,
        customer_email: customerEmail,
        customer_name: customerName,
        order_items: pricing.items,
        total_amount: pricing.subtotal,
        product_subtotal: pricing.subtotal,
        sales_tax_amount: 0,
        sales_tax_rate_percent: 0,
        billing_address: { city: 'QA fixture', state: 'NY', zip: '10001', country: 'USA' },
        stripe_mode: 'test',
        is_sample: true,
        pricing_snapshot: { digital_product: true, shipping: 0, tax: { method: 'isolated admin QA fixture' }, server_validated_prices: true, is_sample: true, mockup_promotion: { name: MOCKUP_DEAL_NAME, eligible_count: pricing.eligibleCount, groups: pricing.groups, catalog_subtotal: pricing.catalogSubtotal, discount_amount: pricing.discount, subtotal_after_discount: pricing.subtotal, allocation: 'deterministic_product_id_32_32_33_cents' } },
      } });
      if (orderError) fail('The isolated test order could not be prepared.', 500, 'test_order_create_failed');
      const { error: accessError } = await service.from('digital_mockup_order_access').insert({ order_id: orderId, customer_email: customerEmail, checkout_attempt_key: attemptKey, stripe_mode: 'test' });
      if (accessError) {
        await service.rpc('digital_mockup_fail_checkout', { p_order_id: orderId, p_reason: 'Digital Mockups QA checkout registration failed' });
        fail('The isolated test checkout could not be prepared. Retry is safe.', 409, 'test_attempt_conflict');
      }
      const stripe = new Stripe(testStripe.secretKey);
      const metadata = { app_name: 'HC Apparel', source: 'hc_apparel_digital_mockups', internal_order_id: orderId, owner_user_id: admin.id, stripe_mode: 'test', is_sample: 'true' };
      let session: Stripe.Checkout.Session;
      try {
        session = await stripe.checkout.sessions.create({
          mode: 'payment',
          customer_email: customerEmail,
          billing_address_collection: 'required',
          client_reference_id: orderId,
          line_items: stripeMockupLines(pricing, true),
          success_url: `${allowedOrigins.has(origin) ? origin : 'https://www.ilovehcapparel.net'}/DigitalOrderConfirmation?orderId=${encodeURIComponent(orderId)}&session_id={CHECKOUT_SESSION_ID}&access=${encodeURIComponent(token)}`,
          cancel_url: `${allowedOrigins.has(origin) ? origin : 'https://www.ilovehcapparel.net'}/AdminDigitalMockups`,
          metadata,
          payment_intent_data: { description: `HC Apparel Digital Mockups QA ${orderId}`, metadata },
        }, { idempotencyKey: `hc-digital-mockups-${attemptKey}` });
      } catch {
        await service.rpc('digital_mockup_fail_checkout', { p_order_id: orderId, p_reason: 'Digital Mockups QA Stripe session failed to start' });
        fail('Stripe test checkout could not be started.', 502, 'stripe_test_session_failed');
      }
      if (!session.url || session.livemode) fail('Stripe did not return a test-mode checkout session.', 502, 'invalid_test_session');
      await service.rpc('digital_mockup_set_checkout_session', { p_order_id: orderId, p_session_id: session.id, p_payment_method: 'Stripe-hosted checkout (test)' });
      return response({ order_id: orderId, checkout_url: session.url, session_id: session.id, access_token: token, amount: pricing.subtotal, catalog_subtotal: pricing.catalogSubtotal, discount: pricing.discount, stripe_mode: 'test', is_sample: true }, 201, origin);
    }

    if (action === 'create_checkout') {
      const email = safeEmail(input.customer_email);
      const name = text(input.customer_name, 120);
      const attemptKey = text(input.checkout_attempt_key, 120);
      const state = text(input.billing_state, 2).toUpperCase();
      const zip = text(input.billing_zip, 12);
      const city = text(input.billing_city, 100);
      if (!validEmail(email) || !name) fail('Enter your name and a valid email address.', 400, 'customer_required');
      if (!/^[A-Z]{2}$/.test(state) || !/^\d{5}(?:-\d{4})?$/.test(zip) || (state === 'GA' && !city)) fail('Enter a valid billing city, state, and ZIP code.', 400, 'billing_required');
      if (attemptKey.length < 16) fail('Refresh the checkout and try again.', 400, 'attempt_required');
      const user = await currentUser(request, url, publishableKey);
      const rawIds = Array.isArray(input.product_ids) ? input.product_ids.map((id: unknown) => text(id, 80)).filter(Boolean) : [];
      const productIds = [...new Set(rawIds)];
      if (!productIds.length || productIds.length > 30) fail('Choose between 1 and 30 different mockups.', 400, 'invalid_cart');
      const { data: existingAccess } = await service.from('digital_mockup_order_access').select('order_id,customer_email,stripe_mode').eq('checkout_attempt_key', attemptKey).maybeSingle();
      if (existingAccess) {
        if (existingAccess.customer_email !== email) fail('This checkout attempt belongs to a different email.', 409, 'attempt_conflict');
        const { data: existingOrder } = await service.from('orders').select('id,stripe_session_id').eq('id', existingAccess.order_id).single();
        if (existingOrder?.stripe_session_id) {
          const credentials = getStripeCredentials(existingAccess.stripe_mode);
          if (credentials.secretKey) {
            const stripe = new Stripe(credentials.secretKey);
            const session = await stripe.checkout.sessions.retrieve(existingOrder.stripe_session_id);
            const token = await guestAccessToken(accessSecret, existingOrder.id, email);
            return response({ order_id: existingOrder.id, checkout_url: session.url, session_id: session.id, access_token: token, reused: true }, 200, origin);
          }
        }
      }
      const { data: products, error: productError } = await service.from('products').select('id,name,description,price,sale_price,visibility,is_active,product_type').in('id', productIds);
      const [{ data: assets }, { data: priceSettings }] = await Promise.all([
        service.from('digital_mockup_assets').select('id,product_id,current_version_id,publication_status,view_type,price_override').in('product_id', productIds),
        service.from('digital_mockup_settings').select('single_view_price,front_back_price').eq('id', true).single(),
      ]);
      if (productError || !products || products.length !== productIds.length || !assets || assets.length !== productIds.length) fail('One or more mockups are no longer available.', 409, 'product_unavailable');
      const byProduct = new Map(assets.map(asset => [asset.product_id, asset]));
      const items = productIds.map(id => {
        const product = products.find(row => row.id === id);
        const asset = byProduct.get(id);
        if (!product || product.product_type !== 'digital' || product.visibility !== 'public' || !product.is_active || asset?.publication_status !== 'published' || !asset.current_version_id) fail('One or more mockups are no longer available.', 409, 'product_unavailable');
        const price = money(product.sale_price ?? product.price);
        const expectedPrice = configuredPrice(priceSettings, viewType(asset.view_type), asset.price_override);
        if (price !== expectedPrice) fail('A mockup price changed while you were shopping. Refresh the catalog and try again.', 409, 'price_mismatch');
        return { product_id: product.id, product_name: product.name, quantity: 1, price, product_type: 'digital', digital_mockup_asset_id: asset.id, digital_mockup_version_id: asset.current_version_id, view_type: viewType(asset.view_type), delivery: 'secure_download' };
      });
      const pricing = priceMockupDeal(items);
      const subtotal = money(pricing.subtotal);
      let tax = 0;
      let taxDetail: Row = { state, method: state === 'GA' ? 'Georgia destination rate' : 'No Georgia destination tax outside Georgia' };
      if (state === 'GA') {
        const { data: rate, error: rateError } = await service.rpc('get_georgia_checkout_tax_rate', { destination_zip: zip, destination_city: city, calculation_date: new Date().toISOString().slice(0, 10) });
        if (rateError || !rate?.ok) fail('Sales tax could not be verified for this billing ZIP code.', 409, 'tax_lookup_failed');
        tax = money(subtotal * Number(rate.rate_percent || 0) / 100);
        taxDetail = rate;
      }
      const total = money(subtotal + tax);
      const { data: paymentSettings } = await service.from('payment_settings').select('payment_mode,stripe_mode').order('updated_date', { ascending: false }).limit(1).maybeSingle();
      if (paymentSettings?.payment_mode !== 'stripe') fail('Online checkout is not enabled.', 503, 'checkout_unavailable');
      const stripeMode = normalizeStripeMode(paymentSettings.stripe_mode);
      const credentials = getStripeCredentials(stripeMode);
      if (!credentials.configured || !credentials.secretKey) fail('Online checkout is not configured.', 503, 'checkout_unavailable');
      const orderId = crypto.randomUUID();
      const token = await guestAccessToken(accessSecret, orderId, email);
      const { error: orderError } = await service.rpc('digital_mockup_create_order', { p_order: {
        id: orderId, owner_user_id: user?.id || null, customer_email: email, customer_name: name,
        order_items: pricing.items, total_amount: total, product_subtotal: subtotal,
        sales_tax_amount: tax, sales_tax_rate_percent: Number(taxDetail.rate_percent || 0),
        sales_tax_jurisdiction_code: taxDetail.jurisdiction_code || null,
        sales_tax_jurisdiction_name: taxDetail.jurisdiction_name || null,
        sales_tax_rate_source: taxDetail.rate_source || null,
        billing_address: { city, state, zip, country: 'USA' }, stripe_mode: stripeMode,
        pricing_snapshot: { digital_product: true, shipping: 0, tax: taxDetail, server_validated_prices: true, mockup_promotion: { name: MOCKUP_DEAL_NAME, eligible_count: pricing.eligibleCount, groups: pricing.groups, catalog_subtotal: pricing.catalogSubtotal, discount_amount: pricing.discount, subtotal_after_discount: pricing.subtotal, allocation: 'deterministic_product_id_32_32_33_cents' } },
      } });
      if (orderError) fail('The secure order could not be prepared.', 500, 'order_create_failed');
      const { error: accessError } = await service.from('digital_mockup_order_access').insert({ order_id: orderId, customer_email: email, checkout_attempt_key: attemptKey, stripe_mode: stripeMode });
      if (accessError) {
        await service.rpc('digital_mockup_fail_checkout', { p_order_id: orderId, p_reason: 'Digital checkout attempt registration failed' });
        fail('The secure checkout could not be prepared. Retry is safe.', 409, 'attempt_conflict');
      }
      const stripe = new Stripe(credentials.secretKey);
      const metadata = { app_name: 'HC Apparel', source: 'hc_apparel_digital_mockups', internal_order_id: orderId, owner_user_id: user?.id || '', stripe_mode: stripeMode };
      const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = stripeMockupLines(pricing);
      if (tax > 0) lineItems.push({ price_data: { currency: 'usd', product_data: { name: 'Sales tax' }, unit_amount: Math.round(tax * 100) }, quantity: 1 });
      let session: Stripe.Checkout.Session;
      try {
        session = await stripe.checkout.sessions.create({
          mode: 'payment', customer_email: email, billing_address_collection: 'required', client_reference_id: orderId,
          line_items: lineItems,
          success_url: `${allowedOrigins.has(origin) ? origin : 'https://www.ilovehcapparel.net'}/DigitalOrderConfirmation?orderId=${encodeURIComponent(orderId)}&session_id={CHECKOUT_SESSION_ID}&access=${encodeURIComponent(token)}`,
          cancel_url: `${allowedOrigins.has(origin) ? origin : 'https://www.ilovehcapparel.net'}/Checkout`,
          metadata, payment_intent_data: { description: `HC Apparel digital mockups ${orderId}`, metadata },
        }, { idempotencyKey: `hc-digital-mockups-${attemptKey}` });
      } catch (error) {
        await service.rpc('digital_mockup_fail_checkout', { p_order_id: orderId, p_reason: 'Digital checkout session failed to start' });
        fail('Payment checkout could not be started.', 502, 'stripe_session_failed');
      }
      if (!session.url || session.livemode !== (stripeMode === 'live')) fail('Payment checkout returned an invalid session.', 502, 'invalid_stripe_session');
      await service.rpc('digital_mockup_set_checkout_session', { p_order_id: orderId, p_session_id: session.id, p_payment_method: 'Stripe-hosted checkout' });
      return response({ order_id: orderId, checkout_url: session.url, session_id: session.id, access_token: token, catalog_subtotal: pricing.catalogSubtotal, discount: pricing.discount, subtotal, tax, total, shipping: 0, reused: false }, 201, origin);
    }

    if (action === 'verify_payment') {
      const sessionId = text(input.session_id, 200);
      const orderId = text(input.order_id, 100);
      const access = text(input.access, 200);
      const stripeMode = modeFromCheckoutSessionId(sessionId);
      if (!stripeMode) fail('The payment session is invalid.', 400, 'invalid_session');
      const credentials = getStripeCredentials(stripeMode);
      if (!credentials.configured || !credentials.secretKey) fail('Payment verification is unavailable.', 503, 'stripe_unavailable');
      const stripe = new Stripe(credentials.secretKey);
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.metadata?.internal_order_id !== orderId) fail('The payment session does not match this order.', 403, 'session_mismatch');
      const { data: order } = await service.from('orders').select('customer_email').eq('id', orderId).maybeSingle();
      if (!order) fail('Order not found.', 404, 'not_found');
      const expected = await guestAccessToken(accessSecret, orderId, order.customer_email);
      const user = await currentUser(request, url, publishableKey);
      if (access !== expected && (!user || user.email.toLowerCase() !== order.customer_email.toLowerCase())) fail('Order access denied.', 403, 'access_denied');
      return response(await finalizePayment(service, stripe, session, 'stripe_verification', session.id, accessSecret), 200, origin);
    }

    if (action === 'downloads' || action === 'download') {
      const user = await currentUser(request, url, publishableKey);
      const orderId = text(input.order_id, 100);
      const access = text(input.access, 200);
      let query = service.from('digital_download_entitlements').select('*').is('revoked_at', null);
      let accessKind = 'account';
      if (orderId) {
        const { data: order } = await service.from('orders').select('id,customer_email,payment_status').eq('id', orderId).maybeSingle();
        if (!order || order.payment_status !== 'paid') fail('Paid download access was not found.', 404, 'not_paid');
        const expected = await guestAccessToken(accessSecret, order.id, order.customer_email);
        if (access !== expected && (!user || user.email.toLowerCase() !== order.customer_email.toLowerCase())) fail('Download access denied.', 403, 'access_denied');
        query = query.eq('order_id', order.id);
        accessKind = access === expected ? 'guest' : 'account';
      } else {
        if (!user) fail('Sign in or use the secure link from your purchase email.', 401, 'authentication_required');
        query = query.or(`owner_user_id.eq.${user.id},customer_email.eq.${user.email.toLowerCase()}`);
      }
      const { data: entitlements, error } = await query.order('granted_at', { ascending: false }).limit(500);
      if (error) fail('Downloads could not be loaded.', 500, 'downloads_failed');
      const requestedId = text(input.entitlement_id, 80);
      if (action === 'download') {
        const entitlement = (entitlements || []).find(row => row.id === requestedId);
        if (!entitlement) fail('This download is not included in the paid order.', 403, 'entitlement_missing');
        const [{ data: version }, { data: product }] = await Promise.all([
          service.from('digital_mockup_versions').select('original_storage_path,original_file_name,file_extension,mime_type').eq('id', entitlement.version_id).single(),
          service.from('products').select('name').eq('id', entitlement.product_id).single(),
        ]);
        if (!version) fail('The purchased file version is unavailable.', 404, 'version_missing');
        if (!product?.name) fail('The purchased product title is unavailable.', 404, 'product_missing');
        const downloadFileName = customerDownloadFileName(product.name, version.original_file_name, version.file_extension);
        const expiresIn = 120;
        const { data: signed, error: signedError } = await service.storage.from('digital-mockup-originals').createSignedUrl(version.original_storage_path, expiresIn, { download: downloadFileName });
        if (signedError || !signed?.signedUrl) fail('A secure download link could not be created.', 503, 'signed_url_failed');
        const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
        await service.from('digital_download_audit').insert({ entitlement_id: entitlement.id, order_id: entitlement.order_id, requested_by: user?.id || null, access_kind: accessKind, signed_url_expires_at: expiresAt });
        return response({ download_url: signed.signedUrl, expires_at: expiresAt, file_name: downloadFileName }, 200, origin);
      }
      const productIds = [...new Set((entitlements || []).map(row => row.product_id))];
      const versionIds = [...new Set((entitlements || []).map(row => row.version_id))];
      const [{ data: products }, { data: assets }, { data: versions }] = await Promise.all([
        productIds.length ? service.from('products').select('id,name,image_url').in('id', productIds) : { data: [] },
        productIds.length ? service.from('digital_mockup_assets').select('id,product_id,slug').in('product_id', productIds) : { data: [] },
        versionIds.length ? service.from('digital_mockup_versions').select('id,original_file_name,pixel_width,pixel_height,file_extension,file_size_bytes').in('id', versionIds) : { data: [] },
      ]);
      return response({ downloads: (entitlements || []).map(row => ({
        ...row,
        product: (products || []).find(product => product.id === row.product_id),
        asset: (assets || []).find(asset => asset.product_id === row.product_id),
        file: (versions || []).find(version => version.id === row.version_id),
      })) }, 200, origin);
    }

    return response({ error: 'Unknown Digital Mockups action.' }, 400, origin);
  } catch (error) {
    const appError = error as AppError;
    console.error('Digital Mockups request failed', { action_error: appError.code || 'unknown', status: appError.status || 500, name: appError.name });
    return response({ error: appError.message || 'Digital Mockups request failed.', code: appError.code || 'request_failed' }, appError.status || 500, origin);
  }
});
