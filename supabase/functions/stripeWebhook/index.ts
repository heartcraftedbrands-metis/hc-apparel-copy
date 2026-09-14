import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';
import { getSupabaseServiceKey } from '../_shared/supabaseCredentials.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  const signature = request.headers.get('stripe-signature');
  if (!stripeSecretKey || !webhookSecret || !signature) {
    return json({ error: 'Webhook is not configured' }, 503);
  }

  const stripe = new Stripe(stripeSecretKey);
  const cryptoProvider = Stripe.createSubtleCryptoProvider();
  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      webhookSecret,
      undefined,
      cryptoProvider,
    );
  } catch {
    return json({ error: 'Invalid webhook signature' }, 400);
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
  if (session.metadata?.source !== 'hc_apparel_customized_small_order' || !orderId || !ownerUserId) {
    return json({ error: 'Checkout metadata is invalid' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = getSupabaseServiceKey();
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Supabase is not configured' }, 503);

  const admin = createClient(supabaseUrl, serviceRoleKey, { db: { schema: 'public' } });
  const { data: order, error: orderError } = await admin
    .from('orders')
    .select('id,owner_user_id,total_amount,payment_status,checkout_source')
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
  if (order.owner_user_id !== ownerUserId || order.checkout_source !== 'customized_small_order') {
    return json({ error: 'Checkout session does not match the order' }, 403);
  }
  if (session.currency !== 'usd' || session.amount_total !== Math.round(Number(order.total_amount) * 100)) {
    return json({ error: 'Checkout amount does not match the order' }, 409);
  }

  if (order.payment_status !== 'paid') {
    const { error: updateError } = await admin.from('orders').update({
      payment_status: 'paid',
      status: 'paid',
      payment_method: 'Stripe',
      amount_paid: order.total_amount,
      balance_due: 0,
      payment_date: new Date().toISOString(),
      stripe_session_id: session.id,
      stripe_payment_intent_id: String(session.payment_intent || ''),
    }).eq('id', order.id).neq('payment_status', 'paid');
    if (updateError) return json({ error: 'Unable to confirm payment' }, 500);
    // The existing database trigger prepares protected vendor and notification drafts.
  }

  return json({ received: true, processed: true, order_id: order.id });
});
