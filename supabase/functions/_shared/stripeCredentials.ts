export type StripeMode = 'test' | 'live';

export type StripeCredentials = {
  mode: StripeMode;
  secretKey?: string;
  webhookSecret?: string;
  secretKeySource: string | null;
  webhookSecretSource: string | null;
  configured: boolean;
};

const value = (name: string) => Deno.env.get(name)?.trim() || undefined;

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

  return {
    mode: requestedMode,
    secretKey,
    webhookSecret,
    secretKeySource,
    webhookSecretSource,
    configured: Boolean(secretKey?.startsWith(expectedPrefix) && webhookSecret?.startsWith('whsec_')),
  };
};

export const getStripeCredentialStatus = () => ({
  test: getStripeCredentials('test'),
  live: getStripeCredentials('live'),
});
