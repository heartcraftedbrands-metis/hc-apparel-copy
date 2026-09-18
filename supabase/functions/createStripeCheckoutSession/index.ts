import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';
import {
  getSupabasePublishableKey,
  getSupabaseServiceCredential,
} from '../_shared/supabaseCredentials.ts';
import {
  getStripeCredentials,
  normalizeStripeMode,
} from '../_shared/stripeCredentials.ts';

const allowedOrigins = ['https://www.ilovehcapparel.net', 'https://ilovehcapparel.net', 'http://localhost:5173'];
const corsHeaders = (origin: string) => ({
  'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-retry-count, traceparent, tracestate, baggage',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': 'x-checkout-request-id',
  'Vary': 'Origin',
  'Cache-Control': 'no-store',
});

const json = (body: unknown, status: number, origin: string, requestId: string) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders(origin), 'Content-Type': 'application/json', 'x-checkout-request-id': requestId },
});

const checkoutFailureReason = 'Stripe checkout session failed to start';

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin') || '';
  const requestId = crypto.randomUUID();
  let stage = 'request';
  const respond = (body: unknown, status = 200) => {
    console.info('Stripe checkout request', { request_id: requestId, stage, status, origin: allowedOrigins.includes(origin) ? origin : 'unrecognized' });
    return json(body, status, origin, requestId);
  };
  if (request.method === 'OPTIONS') return respond({ ok: true });
  if (request.method !== 'POST') return respond({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' }, 405);

  try {
    stage = 'configuration';
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const publishableKey = getSupabasePublishableKey();
    const serviceCredential = getSupabaseServiceCredential();
    const serviceRoleKey = serviceCredential.key;
    console.info('Supabase service credential configuration', {
      selected: serviceCredential.source,
      present: serviceCredential.present,
    });
    if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
      return respond({ error: 'Payment service is not configured', code: 'CONFIG_UNAVAILABLE' }, 503);
    }

    stage = 'authentication';
    const authorization = request.headers.get('Authorization') || '';
    const userClient = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return respond({ error: 'Authentication required', code: 'AUTH_REQUIRED' }, 401);

    stage = 'validation';
    let body;
    try { body = await request.json(); }
    catch { return respond({ error: 'Invalid checkout request', code: 'INVALID_REQUEST' }, 400); }
    const { orderId, successUrl, cancelUrl, adminRetry, adminHealthCheck } = body || {};
    if (!adminHealthCheck && (typeof orderId !== 'string' || !orderId.trim())) {
      return respond({ error: 'A valid order ID is required', code: 'INVALID_REQUEST' }, 400);
    }
    if (!adminHealthCheck && (typeof successUrl !== 'string' || !successUrl || typeof cancelUrl !== 'string' || !cancelUrl)) {
      return respond({ error: 'Order ID, success URL, and cancel URL are required', code: 'INVALID_REQUEST' }, 400);
    }
    if (!adminHealthCheck) {
      try {
        if (![successUrl, cancelUrl].every(url => allowedOrigins.includes(new URL(url).origin))) {
          return respond({ error: 'Checkout return URL is invalid', code: 'INVALID_RETURN_URL' }, 400);
        }
      } catch {
        return respond({ error: 'Checkout return URL is invalid', code: 'INVALID_RETURN_URL' }, 400);
      }
    }
    if (adminRetry || adminHealthCheck) {
      const { data: isAdmin, error: adminError } = await userClient.rpc('is_admin');
      if (adminError || !isAdmin) return respond({ error: 'Administrator access required', code: 'ADMIN_REQUIRED' }, 403);
    }

    stage = 'payment_settings';
    const admin = createClient(supabaseUrl, serviceRoleKey, { db: { schema: 'public' } });
    let failureOwnerId = user.id;
    const markStartFailed = async () => {
      const { error: failureUpdateError } = await admin.from('orders').update({
        status: 'checkout_failed',
        payment_status: 'checkout_failed',
        checkout_failure_reason: checkoutFailureReason,
        checkout_failure_at: new Date().toISOString(),
        checkout_issue_resolved_at: null,
        checkout_issue_archived_at: null,
      }).eq('id', orderId.trim()).eq('checkout_source', 'customized_small_order')
        .is('stripe_session_id', null).in('payment_status', ['checkout_pending', 'checkout_failed', 'awaiting_payment'])
        .eq('owner_user_id', failureOwnerId);
      if (failureUpdateError) console.error('Checkout failure state update failed', { request_id: requestId, code: failureUpdateError.code });
    };
    const { data: paymentSettings, error: settingsError } = await admin
      .from('payment_settings')
      .select('payment_mode,stripe_mode')
      .order('updated_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (settingsError) {
      console.error('Checkout payment settings lookup failed', { request_id: requestId, code: settingsError.code });
      if (!adminRetry && !adminHealthCheck) await markStartFailed();
      return respond({ error: 'Unable to load payment configuration', code: 'PAYMENT_SETTINGS_UNAVAILABLE' }, 500);
    }
    if (paymentSettings?.payment_mode !== 'stripe') {
      if (!adminRetry && !adminHealthCheck) await markStartFailed();
      return respond({ error: 'Stripe checkout is not enabled', code: 'STRIPE_NOT_SELECTED' }, 409);
    }

    const stripeMode = normalizeStripeMode(paymentSettings?.stripe_mode);
    const stripeCredentials = getStripeCredentials(stripeMode);
    console.info('Stripe checkout credential configuration', {
      mode: stripeMode,
      secret_key_source: stripeCredentials.secretKeySource,
      webhook_secret_source: stripeCredentials.webhookSecretSource,
      configured: stripeCredentials.configured,
    });
    if (!stripeCredentials.configured || !stripeCredentials.secretKey) {
      if (!adminRetry && !adminHealthCheck) await markStartFailed();
      return respond({ error: 'Payment checkout could not be started', code: 'STRIPE_UNAVAILABLE' }, 503);
    }
    if (adminHealthCheck) return respond({ ready: true, stripe_mode: stripeMode, creates_order: false, creates_session: false });
    stage = 'order_lookup';
    const { data: order, error: orderError } = await admin
      .from('orders')
      .select('id,owner_user_id,customer_email,order_items,total_amount,payment_status,checkout_source')
      .eq('id', orderId.trim())
      .maybeSingle();
    if (orderError) {
      console.error('Stripe checkout order lookup failed', {
        code: orderError.code,
        request_id: requestId,
      });
      return respond({ error: 'Unable to load customer order', code: 'ORDER_LOOKUP_FAILED' }, 500);
    }
    if (!order) return respond({ error: 'Order not found', code: 'ORDER_NOT_FOUND' }, 404);
    if (order.owner_user_id !== user.id && !adminRetry) return respond({ error: 'Order access denied', code: 'ORDER_ACCESS_DENIED' }, 403);
    failureOwnerId = order.owner_user_id;
    if (adminRetry && !['checkout_pending', 'checkout_failed'].includes(order.payment_status)) {
      return respond({ error: 'This order is not a checkout issue', code: 'NOT_CHECKOUT_ISSUE' }, 409);
    }
    if (order.checkout_source !== 'customized_small_order') {
      return respond({ error: 'Unsupported checkout order', code: 'UNSUPPORTED_ORDER' }, 400);
    }
    if (order.payment_status === 'paid') return respond({ error: 'Order is already paid', code: 'ORDER_ALREADY_PAID' }, 409);

    const items = Array.isArray(order.order_items) ? order.order_items : [];
    if (!items.length || Number(order.total_amount) <= 0) {
      return respond({ error: 'Order does not have valid payable items', code: 'INVALID_ITEMS' }, 400);
    }

    const stripe = new Stripe(stripeCredentials.secretKey);
    const stripeOrderMetadata = {
      app_name: 'HC Apparel',
      source: 'hc_apparel_customized_small_order',
      internal_order_id: order.id,
      owner_user_id: order.owner_user_id,
      stripe_mode: stripeMode,
    };
    stage = 'stripe_session';
    let session;
    try { session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: order.customer_email,
      client_reference_id: order.id,
      line_items: items.map((item: Record<string, unknown>) => ({
        price_data: {
          currency: 'usd',
          product_data: {
            name: String(item.product_name || 'HC Apparel garment'),
            description: 'HC Apparel storefront order',
            metadata: {
              app_name: 'HC Apparel',
              internal_order_id: order.id,
            },
          },
          unit_amount: Math.round(Number(item.price) * 100),
        },
        quantity: Number(item.quantity),
      })),
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: stripeOrderMetadata,
      payment_intent_data: {
        description: `HC Apparel order ${order.id}`,
        metadata: stripeOrderMetadata,
      },
    }, { idempotencyKey: `hc-apparel-order-${order.id}` }); }
    catch (stripeError) {
      console.error('Stripe session creation failed', { request_id: requestId, error_name: stripeError instanceof Error ? stripeError.name : 'Unknown' });
      await markStartFailed();
      return respond({ error: checkoutFailureReason, code: 'STRIPE_SESSION_FAILED' }, 502);
    }
    if (!session.url || session.livemode !== (stripeMode === 'live')) {
      console.error('Stripe session response invalid', { request_id: requestId, has_url: Boolean(session.url), mode_matches: session.livemode === (stripeMode === 'live') });
      try { await stripe.checkout.sessions.expire(session.id); }
      catch { /* Do not return an invalid session URL to the customer. */ }
      await markStartFailed();
      return respond({ error: checkoutFailureReason, code: 'INVALID_STRIPE_SESSION' }, 502);
    }

    stage = 'order_update';
    const { error: updateError } = await admin.from('orders').update({
      stripe_session_id: session.id,
      payment_method: 'Stripe',
      stripe_mode: stripeMode,
      status: 'awaiting_payment',
      payment_status: 'awaiting_payment',
      checkout_failure_reason: null,
      checkout_failure_at: null,
      checkout_issue_resolved_at: null,
      checkout_issue_archived_at: null,
    }).eq('id', order.id);
    if (updateError) {
      console.error('Checkout session order update failed', { request_id: requestId, code: updateError.code });
      try { await stripe.checkout.sessions.expire(session.id); }
      catch (expireError) { console.error('Checkout session expiry failed', { request_id: requestId, error_name: expireError instanceof Error ? expireError.name : 'Unknown' }); }
      await markStartFailed();
      return respond({ error: checkoutFailureReason, code: 'ORDER_UPDATE_FAILED' }, 502);
    }

    return respond({
      checkout_url: session.url,
      session_id: session.id,
      payment_status: 'awaiting_payment',
      stripe_mode: stripeMode,
      live_ss_submission_enabled: false,
    });
  } catch (error) {
    console.error('Stripe checkout failure', { request_id: requestId, stage, error_name: error instanceof Error ? error.name : 'Unknown' });
    return respond({ error: 'Payment checkout could not be started', code: stage === 'stripe_session' ? 'STRIPE_SESSION_FAILED' : 'CHECKOUT_FAILED' }, 502);
  }
});
