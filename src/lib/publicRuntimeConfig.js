const SUPABASE_URL_ENV_NAME = 'VITE_SUPABASE_URL';
const SUPABASE_PUBLISHABLE_KEY_ENV_NAME = 'VITE_SUPABASE_PUBLISHABLE_KEY';
const SUPABASE_ANON_KEY_ENV_NAME = 'VITE_SUPABASE_ANON_KEY';
const SUPABASE_KEY_ENV_NAMES = [
  SUPABASE_PUBLISHABLE_KEY_ENV_NAME,
  SUPABASE_ANON_KEY_ENV_NAME,
];

export const REQUIRED_PUBLIC_ENV_VARS = [
  SUPABASE_URL_ENV_NAME,
  `${SUPABASE_PUBLISHABLE_KEY_ENV_NAME} or ${SUPABASE_ANON_KEY_ENV_NAME}`,
];

export function validatePublicRuntimeConfig(env = {}) {
  const supabaseUrl = String(env[SUPABASE_URL_ENV_NAME] || '').trim();
  const supabaseKeyEnvName = SUPABASE_KEY_ENV_NAMES.find(name => String(env[name] || '').trim());
  const supabasePublishableKey = String(env[supabaseKeyEnvName] || '').trim();
  const missingVariables = [];
  if (!supabaseUrl) missingVariables.push(SUPABASE_URL_ENV_NAME);
  if (!supabaseKeyEnvName) {
    missingVariables.push(
      `${SUPABASE_PUBLISHABLE_KEY_ENV_NAME} or ${SUPABASE_ANON_KEY_ENV_NAME}`,
    );
  }
  const errors = [];

  if (supabaseUrl) {
    try {
      const parsedUrl = new URL(supabaseUrl);
      if (parsedUrl.protocol !== 'https:' || !parsedUrl.hostname.endsWith('.supabase.co')) {
        errors.push(`${SUPABASE_URL_ENV_NAME} must be an HTTPS Supabase project URL.`);
      }
    } catch {
      errors.push(`${SUPABASE_URL_ENV_NAME} is not a valid URL.`);
    }
  }

  if (
    supabasePublishableKey
    && !supabasePublishableKey.startsWith('sb_publishable_')
    && !supabasePublishableKey.startsWith('eyJ')
  ) {
    errors.push(
      `${supabaseKeyEnvName || SUPABASE_PUBLISHABLE_KEY_ENV_NAME} must be a Supabase publishable key or legacy public anon key.`,
    );
  }

  return {
    isValid: missingVariables.length === 0 && errors.length === 0,
    missingVariables,
    errors,
    supabaseUrl,
    supabasePublishableKey,
    supabaseKeyEnvName,
  };
}
