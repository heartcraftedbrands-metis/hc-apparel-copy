import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';
import {
  getStripeCredentials,
  getStripeCredentialStatus,
  modeFromCheckoutSessionId,
  normalizeStripeMode,
} from '../_shared/stripeCredentials.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

const getPublishableKey = () => {
  const legacyKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (legacyKey) return legacyKey;
  const keys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}');
  return keys.default;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = await request.json().catch(() => ({}));
    const credentials = getStripeCredentialStatus();
    console.info('[getStripeStatus] credential readiness', JSON.stringify({
      test: {
        server_key_source: credentials.test.secretKeySource,
        webhook_secret_source: credentials.test.webhookSecretSource,
        ready: credentials.test.configured,
      },
      live: {
        server_key_source: credentials.live.secretKeySource,
        server_key_type: credentials.live.serverKeyType,
        server_key_format_valid: credentials.live.secretKeyFormatValid,
        webhook_secret_source: credentials.live.webhookSecretSource,
        webhook_format_valid: credentials.live.webhookSecretFormatValid,
        ready: credentials.live.configured,
      },
    }));

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const publishableKey = getPublishableKey();
    if (!supabaseUrl || !publishableKey) return json({ error: 'Supabase is not configured' }, 503);

    const authorization = request.headers.get('Authorization') || '';
    const userClient = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: 'Authentication required' }, 401);

    const { data: isAdmin, error: adminError } = await userClient.rpc('is_admin');
    if (adminError || !isAdmin) return json({ error: 'Administrator access required' }, 403);

    if (body?.orderId) {
      const { data: order, error: orderError } = await userClient.from('orders')
        .select('id,created_date,total_amount,payment_status,amount_paid,balance_due,stripe_session_id,stripe_payment_intent_id,stripe_mode,payment_date,payment_confirmation_source,payment_provider_event_id,archived_at')
        .eq('id', String(body.orderId))
        .maybeSingle();
      if (orderError) return json({ error: 'Unable to load order for reconciliation' }, 500);
      if (!order) return json({ error: 'Order not found' }, 404);
      if (!order.stripe_session_id) return json({ order_id: order.id, provider_session: null, message: 'No Stripe Checkout Session is attached.' });

      const mode = modeFromCheckoutSessionId(order.stripe_session_id);
      if (!mode) return json({ error: 'Stored Stripe Checkout Session ID is invalid' }, 409);
      const selectedCredentials = getStripeCredentials(mode);
      if (!selectedCredentials.secretKey) return json({ error: `Stripe ${mode} reconciliation is not configured` }, 503);

      const stripe = new Stripe(selectedCredentials.secretKey);
      const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
      const created = Math.max(0, Number(session.created || 0) - 300);
      const eventPage = await stripe.events.list({ created: { gte: created, lte: created + 172800 }, limit: 100 });
      const providerEvents = eventPage.data.filter((candidate) => {
        const object = candidate.data.object as Record<string, unknown>;
        return object.id === session.id || object.id === session.payment_intent
          || object.payment_intent === session.payment_intent || object.client_reference_id === order.id;
      }).map((candidate) => ({ id: candidate.id, type: candidate.type, created: candidate.created, livemode: candidate.livemode }));

      return json({
        order_id: order.id,
        archived_at: order.archived_at,
        database_payment: {
          status: order.payment_status,
          amount_paid: order.amount_paid,
          balance_due: order.balance_due,
          payment_date: order.payment_date,
          confirmation_source: order.payment_confirmation_source,
          provider_event_id: order.payment_provider_event_id,
        },
        provider_session: {
          id: session.id,
          mode,
          status: session.status,
          payment_status: session.payment_status,
          amount_total: session.amount_total,
          currency: session.currency,
          payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || null,
          created: session.created,
          expires_at: session.expires_at,
        },
        provider_events: providerEvents,
        read_only: true,
      });
    }

    const { data: settings, error: settingsError } = await userClient
      .from('payment_settings')
      .select('stripe_mode,last_stripe_event_id,last_stripe_event_type,last_stripe_event_mode,last_stripe_event_at')
      .order('updated_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (settingsError) return json({ error: 'Unable to load Stripe settings' }, 500);

    const selectedMode = normalizeStripeMode(settings?.stripe_mode);
    const selected = credentials[selectedMode];
    const publicStatus = (mode: 'test' | 'live') => ({
      server_key_detected: Boolean(credentials[mode].secretKey),
      server_key_format_valid: credentials[mode].secretKeyFormatValid,
      webhook_configured: Boolean(credentials[mode].webhookSecret),
      webhook_format_valid: credentials[mode].webhookSecretFormatValid,
      server_key_source: credentials[mode].secretKeySource,
      server_key_type: credentials[mode].serverKeyType,
      webhook_secret_source: credentials[mode].webhookSecretSource,
      ready: credentials[mode].configured,
      checkout_enabled: credentials[mode].configured,
    });

    return json({
      mode: selectedMode,
      server_key_detected: Boolean(selected.secretKey),
      webhook_configured: Boolean(selected.webhookSecret),
      checkout_enabled: selected.configured,
      modes: {
        test: publicStatus('test'),
        live: publicStatus('live'),
      },
      last_event: settings?.last_stripe_event_id ? {
        id: settings.last_stripe_event_id,
        type: settings.last_stripe_event_type,
        mode: settings.last_stripe_event_mode,
        received_at: settings.last_stripe_event_at,
      } : null,
    });
  } catch {
    return json({ error: 'Unable to check Stripe configuration' }, 500);
  }
});
