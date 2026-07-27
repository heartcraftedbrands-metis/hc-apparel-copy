import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    let publishableKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!publishableKey) {
      const publishableKeys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}');
      publishableKey = publishableKeys.default;
    }
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!supabaseUrl || !publishableKey || !serviceRoleKey || !stripeSecretKey) {
      return json({ error: 'Payment service is not configured' }, 503);
    }

    const authorization = request.headers.get('Authorization') || '';
    const userClient = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: 'Authentication required' }, 401);

    const { orderId, successUrl, cancelUrl } = await request.json();
    if (!orderId || !successUrl || !cancelUrl) {
      return json({ error: 'Order ID, success URL, and cancel URL are required' }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: order, error: orderError } = await admin
      .from('orders')
      .select('id,owner_user_id,customer_email,order_items,total_amount,payment_status,checkout_source')
      .eq('id', orderId)
      .single();
    if (orderError || !order) return json({ error: 'Order not found' }, 404);
    if (order.owner_user_id !== user.id) return json({ error: 'Order access denied' }, 403);
    if (order.checkout_source !== 'customized_small_order') {
      return json({ error: 'Unsupported checkout order' }, 400);
    }
    if (order.payment_status === 'paid') return json({ error: 'Order is already paid' }, 409);

    const items = Array.isArray(order.order_items) ? order.order_items : [];
    if (!items.length || Number(order.total_amount) <= 0) {
      return json({ error: 'Order does not have valid payable items' }, 400);
    }

    const stripe = new Stripe(stripeSecretKey);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: order.customer_email,
      line_items: items.map((item: Record<string, unknown>) => ({
        price_data: {
          currency: 'usd',
          product_data: { name: String(item.product_name || 'HC Apparel customized garment') },
          unit_amount: Math.round(Number(item.price) * 100),
        },
        quantity: Number(item.quantity),
      })),
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        source: 'hc_apparel_customized_small_order',
        internal_order_id: order.id,
        owner_user_id: user.id,
      },
    });

    await admin.from('orders').update({
      stripe_session_id: session.id,
      payment_method: 'Stripe',
    }).eq('id', order.id);

    return json({
      checkout_url: session.url,
      session_id: session.id,
      payment_status: 'awaiting_payment',
      live_ss_submission_enabled: false,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unable to create payment session' }, 500);
  }
});
