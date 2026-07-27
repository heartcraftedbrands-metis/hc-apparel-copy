const SUPABASE_URL_ENV_NAME = 'VITE_SUPABASE_URL';
const SUPABASE_KEY_ENV_NAME = 'VITE_SUPABASE_PUBLISHABLE_KEY';

export const REQUIRED_PUBLIC_ENV_VARS = [
  SUPABASE_URL_ENV_NAME,
  SUPABASE_KEY_ENV_NAME,
];

export function validatePublicRuntimeConfig(env = {}) {
  const supabaseUrl = String(env[SUPABASE_URL_ENV_NAME] || '').trim();
  const supabasePublishableKey = String(env[SUPABASE_KEY_ENV_NAME] || '').trim();
  const missingVariables = REQUIRED_PUBLIC_ENV_VARS.filter((name) => {
    return !String(env[name] || '').trim();
  });
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
      `${SUPABASE_KEY_ENV_NAME} must be a Supabase publishable key or legacy public anon key.`,
    );
  }

  return {
    isValid: missingVariables.length === 0 && errors.length === 0,
    missingVariables,
    errors,
    supabaseUrl,
    supabasePublishableKey,
  };
}

