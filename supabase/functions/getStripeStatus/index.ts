import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  getStripeCredentialStatus,
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

    const { data: settings, error: settingsError } = await userClient
      .from('payment_settings')
      .select('stripe_mode,last_stripe_event_id,last_stripe_event_type,last_stripe_event_mode,last_stripe_event_at')
      .order('updated_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (settingsError) return json({ error: 'Unable to load Stripe settings' }, 500);

    const selectedMode = normalizeStripeMode(settings?.stripe_mode);
    const credentials = getStripeCredentialStatus();
    const selected = credentials[selectedMode];
    const publicStatus = (mode: 'test' | 'live') => ({
      server_key_detected: Boolean(credentials[mode].secretKey),
      webhook_configured: Boolean(credentials[mode].webhookSecret),
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
