export type StripeMode = 'test' | 'live';

export type StripeCredentials = {
  mode: StripeMode;
  secretKey?: string;
  webhookSecret?: string;
  secretKeySource: string | null;
  webhookSecretSource: string | null;
  serverKeyType: 'secret' | 'restricted' | 'publishable' | 'unknown' | null;
  secretKeyFormatValid: boolean;
  webhookSecretFormatValid: boolean;
  configured: boolean;
};

// Supabase stores the value exactly as entered. Normalize the two common copy/paste
// forms (quoted values and NAME=value) without ever logging or returning the value.
const value = (name: string) => {
  let secret = Deno.env.get(name)?.trim();
  if (!secret) return undefined;
  const unwrap = (input: string) => (
    input.length >= 2
    && ((input.startsWith('"') && input.endsWith('"'))
      || (input.startsWith("'") && input.endsWith("'")))
      ? input.slice(1, -1).trim()
      : input
  );
  secret = unwrap(secret);
  const assignment = new RegExp(`^${name}\\s*=\\s*`);
  secret = unwrap(secret.replace(assignment, '').trim());
  return secret || undefined;
};

const modeFromSecretKey = (key?: string): StripeMode | null => {
  if (key?.startsWith('sk_test_') || key?.startsWith('rk_test_')) return 'test';
  if (key?.startsWith('sk_live_') || key?.startsWith('rk_live_')) return 'live';
  return null;
};

const serverKeyMatchesMode = (key: string | undefined, mode: StripeMode) => {
  const suffix = mode === 'live' ? 'live_' : 'test_';
  return Boolean(key?.startsWith(`sk_${suffix}`) || key?.startsWith(`rk_${suffix}`));
};

const serverKeyType = (key?: string): StripeCredentials['serverKeyType'] => {
  if (!key) return null;
  if (key.startsWith('sk_')) return 'secret';
  if (key.startsWith('rk_')) return 'restricted';
  if (key.startsWith('pk_')) return 'publishable';
  return 'unknown';
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
  const secretKeyFormatValid = serverKeyMatchesMode(secretKey, requestedMode);
  const webhookSecretFormatValid = Boolean(webhookSecret?.startsWith('whsec_'));

  return {
    mode: requestedMode,
    secretKey,
    webhookSecret,
    secretKeySource,
    webhookSecretSource,
    serverKeyType: serverKeyType(secretKey),
    secretKeyFormatValid,
    webhookSecretFormatValid,
    configured: secretKeyFormatValid && webhookSecretFormatValid,
  };
};

export const getStripeCredentialStatus = () => ({
  test: getStripeCredentials('test'),
  live: getStripeCredentials('live'),
});
