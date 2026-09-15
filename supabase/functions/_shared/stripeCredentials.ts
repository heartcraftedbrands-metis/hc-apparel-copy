export type StripeMode = 'test' | 'live';

export type StripeCredentials = {
  mode: StripeMode;
  secretKey?: string;
  webhookSecret?: string;
  secretKeySource: string | null;
  webhookSecretSource: string | null;
  secretKeyFormatValid: boolean;
  webhookSecretFormatValid: boolean;
  configured: boolean;
};

// Supabase stores the value exactly as entered. Normalize the two common copy/paste
// forms (quoted values and NAME=value) without ever logging or returning the value.
const value = (name: string) => {
  let secret = Deno.env.get(name)?.trim();
  if (!secret) return undefined;
  if (secret.startsWith(`${name}=`)) secret = secret.slice(name.length + 1).trim();
  if (
    secret.length >= 2
    && ((secret.startsWith('"') && secret.endsWith('"'))
      || (secret.startsWith("'") && secret.endsWith("'")))
  ) {
    secret = secret.slice(1, -1).trim();
  }
  return secret || undefined;
};

const modeFromSecretKey = (key?: string): StripeMode | null => {
  if (key?.startsWith('sk_test_')) return 'test';
  if (key?.startsWith('sk_live_')) return 'live';
  return null;
};

export const normalizeStripeMode = (mode: unknown): StripeMode =>
  String(mode || '').toLowerCase() === 'live' ? 'live' : 'test';

export const modeFromCheckoutSessionId = (sessionId: string): StripeMode | null => {
  if (sessionId.startsWith('cs_test_')) return 'test';
  if (sessionId.startsWith('cs_live_')) return 'live';
  return null;
};

export const getStripeCredentials = (requestedMode: StripeMode): StripeCredentials => {
  const explicitSecretName = requestedMode === 'live'
    ? 'STRIPE_LIVE_SECRET_KEY'
    : 'STRIPE_TEST_SECRET_KEY';
  const explicitWebhookName = requestedMode === 'live'
    ? 'STRIPE_LIVE_WEBHOOK_SECRET'
    : 'STRIPE_TEST_WEBHOOK_SECRET';
  const explicitSecret = value(explicitSecretName);
  const explicitWebhook = value(explicitWebhookName);
  const legacySecret = value('STRIPE_SECRET_KEY');
  const legacyMode = modeFromSecretKey(legacySecret);
  const legacyWebhook = value('STRIPE_WEBHOOK_SECRET');

  const secretKey = explicitSecret || (legacyMode === requestedMode ? legacySecret : undefined);
  const webhookSecret = explicitWebhook || (
    legacyMode === requestedMode && legacyWebhook?.startsWith('whsec_')
      ? legacyWebhook
      : undefined
  );
  const secretKeySource = explicitSecret
    ? explicitSecretName
    : secretKey
      ? 'STRIPE_SECRET_KEY'
      : null;
  const webhookSecretSource = explicitWebhook
    ? explicitWebhookName
    : webhookSecret
      ? 'STRIPE_WEBHOOK_SECRET'
      : null;
  const expectedPrefix = requestedMode === 'live' ? 'sk_live_' : 'sk_test_';
  const secretKeyFormatValid = Boolean(secretKey?.startsWith(expectedPrefix));
  const webhookSecretFormatValid = Boolean(webhookSecret?.startsWith('whsec_'));

  return {
    mode: requestedMode,
    secretKey,
    webhookSecret,
    secretKeySource,
    webhookSecretSource,
    secretKeyFormatValid,
    webhookSecretFormatValid,
    configured: secretKeyFormatValid && webhookSecretFormatValid,
  };
};

export const getStripeCredentialStatus = () => ({
  test: getStripeCredentials('test'),
  live: getStripeCredentials('live'),
});
