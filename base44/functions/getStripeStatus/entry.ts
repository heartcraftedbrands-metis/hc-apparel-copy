import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Validates Stripe key format: pk_test_, pk_live_, sk_test_, sk_live_
const isValidStripeKey = (key, prefix) => {
  if (!key || typeof key !== 'string') return false;
  return key.startsWith(prefix);
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    
    const publishableKey = Deno.env.get('STRIPE_PUBLISHABLE_KEY');
    const secretKey = Deno.env.get('STRIPE_SECRET_KEY');

    // Validate key formats
    const publishableKeyValid = isValidStripeKey(publishableKey, 'pk_test_') || isValidStripeKey(publishableKey, 'pk_live_');
    const secretKeyValid = isValidStripeKey(secretKey, 'sk_test_') || isValidStripeKey(secretKey, 'sk_live_');
    
    const isLiveMode = publishableKey?.startsWith('pk_live_');
    
    const stripeReady = publishableKeyValid && secretKeyValid;

    const response = {
      publishable_key_valid: publishableKeyValid,
      secret_key_valid: secretKeyValid,
      stripe_ready: stripeReady,
      mode: isLiveMode ? 'Live' : 'Test',
      disabled_reason: stripeReady ? null : (!secretKeyValid ? 'Missing STRIPE_SECRET_KEY' : 'Missing STRIPE_PUBLISHABLE_KEY')
    };

    // Only return full details to admins
    if (user?.role === 'admin') {
      response.admin_details = {
        publishable_key_format: publishableKey ? (publishableKeyValid ? 'valid' : 'invalid_format') : 'missing',
        secret_key_format: secretKey ? (secretKeyValid ? 'valid' : 'invalid_format') : 'missing'
      };
    }

    return Response.json(response);
  } catch (error) {
    return Response.json({ 
      error: error.message,
      stripe_ready: false,
      disabled_reason: 'Error checking Stripe status'
    }, { status: 500 });
  }
});