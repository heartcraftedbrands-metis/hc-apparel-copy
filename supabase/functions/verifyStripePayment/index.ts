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

    const { sessionId } = await request.json();
    if (!sessionId) return json({ error: 'Stripe session ID is required' }, 400);

    const stripe = new Stripe(stripeSecretKey);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const orderId = session.metadata?.internal_order_id;
    if (!orderId || session.metadata?.owner_user_id !== user.id) {
      return json({ error: 'Payment session does not belong to this customer' }, 403);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: order, error: orderError } = await admin
      .from('orders')
      .select('id,owner_user_id,total_amount,payment_status')
      .eq('id', orderId)
      .single();
    if (orderError || !order || order.owner_user_id !== user.id) {
      return json({ error: 'Customer order not found' }, 404);
    }

    if (session.payment_status !== 'paid') {
      return json({ paid: false, payment_status: session.payment_status, order_id: order.id });
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
      }).eq('id', order.id);
      if (updateError) throw updateError;
      // The database trigger now creates the private vendor draft and notification drafts.
    }

    return json({
      paid: true,
      order_id: order.id,
      amount: order.total_amount,
      vendor_draft_prepared_by_database: true,
      live_ss_submission_enabled: false,
      zerotouch_live_submission_enabled: false,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unable to verify payment' }, 500);
  }
});
