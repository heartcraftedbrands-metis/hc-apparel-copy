import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';
import { getSupabaseServiceKey } from '../_shared/supabaseCredentials.ts';
import {
  getStripeCredentials,
  type StripeMode,
} from '../_shared/stripeCredentials.ts';
import { orderNetMargin, stripePaymentDetails } from '../_shared/stripePaymentMethod.ts';

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
  const checkoutSource = session.metadata?.source;
  if (
    !['hc_apparel_customized_small_order', 'hc_apparel_digital_mockups', 'hc_apparel_mixed_storefront'].includes(String(checkoutSource || ''))
    || session.metadata?.stripe_mode !== stripeMode
    || !orderId
    || (checkoutSource === 'hc_apparel_customized_small_order' && !ownerUserId)
  ) {
    return json({ error: 'Checkout metadata is invalid' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = getSupabaseServiceKey();
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Supabase is not configured' }, 503);

  const admin = createClient(supabaseUrl, serviceRoleKey, { db: { schema: 'public' } });
  const { error: eventInsertError } = await admin.from('stripe_webhook_events').insert({
    event_id: event.id,
    event_type: event.type,
    stripe_mode: stripeMode,
    order_id: orderId,
    processing_status: 'processing',
  });
  if (eventInsertError?.code === '23505') {
    const { data: existingEvent } = await admin.from('stripe_webhook_events')
      .select('processing_status,received_at,attempt_count')
      .eq('event_id', event.id)
      .maybeSingle();
    const receivedAt = existingEvent?.received_at ? new Date(existingEvent.received_at).getTime() : 0;
    if (existingEvent?.processing_status === 'processed' || (existingEvent?.processing_status === 'processing' && Date.now() - receivedAt < 300_000)) {
      return json({ received: true, processed: existingEvent.processing_status === 'processed', duplicate: true, order_id: orderId });
    }
    await admin.from('stripe_webhook_events').update({
      processing_status: 'processing',
      attempt_count: Number(existingEvent?.attempt_count || 1) + 1,
      received_at: new Date().toISOString(),
      last_error: null,
    }).eq('event_id', event.id);
  } else if (eventInsertError) {
    console.error('Stripe webhook event ledger unavailable', { code: eventInsertError.code });
    return json({ error: 'Unable to record payment event' }, 500);
  }
  const failEvent = async (message: string) => {
    await admin.from('stripe_webhook_events').update({
      processing_status: 'failed',
      last_error: message,
    }).eq('event_id', event.id);
  };

  if (checkoutSource === 'hc_apparel_digital_mockups' || checkoutSource === 'hc_apparel_mixed_storefront') {
    try {
      const finalize = await fetch(`${supabaseUrl}/functions/v1/digital-mockups`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          action: 'webhook_finalize',
          session_id: session.id,
          event_id: event.id,
          stripe_mode: stripeMode,
        }),
        signal: AbortSignal.timeout(20000),
      });
      const result = await finalize.json().catch(() => ({}));
      if (!finalize.ok || result?.paid !== true) {
        await failEvent(String(result?.error || 'Digital entitlement finalization failed'));
        return json({ error: 'Unable to finalize digital delivery' }, 502);
      }
      await admin.from('stripe_webhook_events').update({
        processing_status: 'processed', processed_at: new Date().toISOString(), last_error: null,
      }).eq('event_id', event.id);
      return json({ received: true, processed: true, duplicate: false, order_id: orderId, digital_delivery: true, email_status: result.email_status });
    } catch (error) {
      await failEvent(error instanceof Error ? error.message : 'Digital entitlement finalization failed');
      return json({ error: 'Unable to finalize digital delivery' }, 502);
    }
  }

  const { data: order, error: orderError } = await admin
    .from('orders')
    .select('id,owner_user_id,total_amount,product_subtotal,shipping_amount,shipping_charged_to_customer,sales_tax_amount,vendor_cost_estimate,actual_s_and_s_shipping,actual_vendor_shipping,actual_shipping_cost,estimated_s_and_s_shipping,estimated_vendor_shipping,printing_cost_estimate,other_vendor_fees,payment_status,checkout_source,stripe_mode,payment_processing_estimate,pricing_snapshot')
    .eq('id', orderId)
    .maybeSingle();
  if (orderError) {
    console.error('Stripe webhook order lookup failed', {
      code: orderError.code,
      message: orderError.message,
    });
    await failEvent('Order lookup failed');
    return json({ error: 'Unable to load customer order' }, 500);
  }
  if (!order) { await failEvent('Customer order not found'); return json({ error: 'Customer order not found' }, 404); }
  if (
    order.owner_user_id !== ownerUserId
    || order.checkout_source !== 'customized_small_order'
    || (order.stripe_mode || 'test') !== stripeMode
  ) {
    await failEvent('Checkout session does not match the order');
    return json({ error: 'Checkout session does not match the order' }, 403);
  }
  if (session.currency !== 'usd' || session.amount_total !== Math.round(Number(order.total_amount) * 100)) {
    await failEvent('Checkout amount does not match the order');
    return json({ error: 'Checkout amount does not match the order' }, 409);
  }

  if (order.payment_status !== 'paid') {
    const paymentDetails = await stripePaymentDetails(stripe, session);
    const methods = order.pricing_snapshot?.payment_method_costs || {};
    const rate = methods[paymentDetails.type] || methods.card || {};
    const estimatedProcessingCost = Math.round((Number(order.total_amount) * Number(rate.percentage || 0) / 100 + Number(rate.fixed_fee || 0)) * 100) / 100;
    const appliedProcessingCost = paymentDetails.actualProcessingCost ?? estimatedProcessingCost;
    const { error: updateError } = await admin.from('orders').update({
      payment_status: 'paid',
      status: 'awaiting_fulfillment',
      payment_method: paymentDetails.label,
      payment_method_type: paymentDetails.type,
      estimated_processing_cost: estimatedProcessingCost,
      actual_processing_cost: paymentDetails.actualProcessingCost,
      processing_rate_used: { method: paymentDetails.type, label: paymentDetails.label, percentage: Number(rate.percentage || 0), fixed_fee: Number(rate.fixed_fee || 0) },
      final_net_margin: orderNetMargin(order, appliedProcessingCost),
      amount_paid: order.total_amount,
      balance_due: 0,
      payment_date: new Date().toISOString(),
      payment_confirmed_at: new Date().toISOString(),
      payment_confirmation_source: 'stripe_webhook',
      payment_provider_event_id: event.id,
      stripe_session_id: session.id,
      stripe_payment_intent_id: String(session.payment_intent || ''),
      stripe_mode: stripeMode,
    }).eq('id', order.id).neq('payment_status', 'paid');
    if (updateError) { await failEvent('Order payment update failed'); return json({ error: 'Unable to confirm payment' }, 500); }
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

  await admin.from('stripe_webhook_events').update({
    processing_status: 'processed',
    processed_at: new Date().toISOString(),
    last_error: null,
  }).eq('event_id', event.id);

  return json({ received: true, processed: true, duplicate: false, order_id: order.id, stripe_mode: stripeMode });
});
