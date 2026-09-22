import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';
import { getSupabaseServiceKey } from '../_shared/supabaseCredentials.ts';
import {
  getStripeCredentials,
  type StripeMode,
} from '../_shared/stripeCredentials.ts';
import { stripePaymentDetails } from '../_shared/stripePaymentMethod.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return json({ error: 'Webhook is not configured' }, 503);
  }

  const rawBody = await request.text();
  let verified: { event: Stripe.Event; mode: StripeMode; stripe: Stripe } | null = null;
  for (const mode of ['test', 'live'] as const) {
    const credentials = getStripeCredentials(mode);
    if (!credentials.configured || !credentials.secretKey || !credentials.webhookSecret) continue;
    try {
      const stripe = new Stripe(credentials.secretKey);
      const event = await stripe.webhooks.constructEventAsync(
        rawBody,
        signature,
        credentials.webhookSecret,
        undefined,
        Stripe.createSubtleCryptoProvider(),
      );
      verified = { event, mode, stripe };
      break;
    } catch {
      // A shared endpoint may receive test and live webhooks. Try the other isolated secret.
    }
  }
  if (!verified) {
    return json({ error: 'Invalid webhook signature' }, 400);
  }
  const { event, mode: stripeMode, stripe } = verified;
  if (event.livemode !== (stripeMode === 'live')) {
    return json({ error: 'Webhook mode does not match its signing secret' }, 400);
  }

  if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
    return json({ received: true, processed: false });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  if (session.payment_status !== 'paid') {
    return json({ received: true, processed: false });
  }

  const orderId = session.metadata?.internal_order_id;
  const ownerUserId = session.metadata?.owner_user_id;
  if (
    session.metadata?.source !== 'hc_apparel_customized_small_order'
    || session.metadata?.stripe_mode !== stripeMode
    || !orderId
    || !ownerUserId
  ) {
    return json({ error: 'Checkout metadata is invalid' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = getSupabaseServiceKey();
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Supabase is not configured' }, 503);

  const admin = createClient(supabaseUrl, serviceRoleKey, { db: { schema: 'public' } });
  const { data: order, error: orderError } = await admin
    .from('orders')
    .select('id,owner_user_id,total_amount,payment_status,checkout_source,stripe_mode,payment_processing_estimate,pricing_snapshot')
    .eq('id', orderId)
    .maybeSingle();
  if (orderError) {
    console.error('Stripe webhook order lookup failed', {
      code: orderError.code,
      message: orderError.message,
    });
    return json({ error: 'Unable to load customer order' }, 500);
  }
  if (!order) return json({ error: 'Customer order not found' }, 404);
  if (
    order.owner_user_id !== ownerUserId
    || order.checkout_source !== 'customized_small_order'
    || (order.stripe_mode || 'test') !== stripeMode
  ) {
    return json({ error: 'Checkout session does not match the order' }, 403);
  }
  if (session.currency !== 'usd' || session.amount_total !== Math.round(Number(order.total_amount) * 100)) {
    return json({ error: 'Checkout amount does not match the order' }, 409);
  }

  if (order.payment_status !== 'paid') {
    const paymentDetails = await stripePaymentDetails(stripe, session);
    const methods = order.pricing_snapshot?.payment_method_costs || {};
    const rate = methods[paymentDetails.type] || methods.card || {};
    const estimatedProcessingCost = Math.round((Number(order.total_amount) * Number(rate.percentage || 0) / 100 + Number(rate.fixed_fee || 0)) * 100) / 100;
    const { error: updateError } = await admin.from('orders').update({
      payment_status: 'paid',
      status: 'paid',
      payment_method: paymentDetails.label,
      payment_method_type: paymentDetails.type,
      estimated_processing_cost: estimatedProcessingCost,
      actual_processing_cost: paymentDetails.actualProcessingCost,
      processing_rate_used: { method: paymentDetails.type, label: paymentDetails.label, percentage: Number(rate.percentage || 0), fixed_fee: Number(rate.fixed_fee || 0) },
      amount_paid: order.total_amount,
      balance_due: 0,
      payment_date: new Date().toISOString(),
      stripe_session_id: session.id,
      stripe_payment_intent_id: String(session.payment_intent || ''),
      stripe_mode: stripeMode,
    }).eq('id', order.id).neq('payment_status', 'paid');
    if (updateError) return json({ error: 'Unable to confirm payment' }, 500);
    // The existing database trigger prepares protected vendor and notification drafts.
  }

  const { data: paymentSettings } = await admin
    .from('payment_settings')
    .select('id')
    .order('updated_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (paymentSettings?.id) {
    await admin.from('payment_settings').update({
      last_stripe_event_id: event.id,
      last_stripe_event_type: event.type,
      last_stripe_event_mode: stripeMode,
      last_stripe_event_at: new Date().toISOString(),
    }).eq('id', paymentSettings.id);
  }

  return json({ received: true, processed: true, order_id: order.id, stripe_mode: stripeMode });
});
