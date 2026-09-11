import { createClient } from 'npm:@supabase/supabase-js@2';

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

    const stripeSecretKey = String(Deno.env.get('STRIPE_SECRET_KEY') || '');
    const webhookSecret = String(Deno.env.get('STRIPE_WEBHOOK_SECRET') || '');
    const mode = stripeSecretKey.startsWith('sk_test_')
      ? 'Test'
      : (stripeSecretKey.startsWith('sk_live_') ? 'Live' : 'Unknown');
    const serverKeyDetected = mode !== 'Unknown';
    const webhookConfigured = webhookSecret.startsWith('whsec_');

    return json({
      mode,
      server_key_detected: serverKeyDetected,
      webhook_configured: webhookConfigured,
      checkout_enabled: serverKeyDetected && webhookConfigured,
    });
  } catch {
    return json({ error: 'Unable to check Stripe configuration' }, 500);
  }
});
