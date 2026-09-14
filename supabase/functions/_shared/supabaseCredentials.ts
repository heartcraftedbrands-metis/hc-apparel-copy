const readDefaultKey = (environmentName: string) => {
  const rawValue = Deno.env.get(environmentName);
  if (!rawValue) return undefined;

  try {
    const keys = JSON.parse(rawValue) as { default?: unknown };
    return typeof keys.default === 'string' && keys.default.trim()
      ? keys.default.trim()
      : undefined;
  } catch {
    return undefined;
  }
};

export const getSupabasePublishableKey = () =>
  readDefaultKey('SUPABASE_PUBLISHABLE_KEYS')
  || Deno.env.get('SUPABASE_PUBLISHABLE_KEY')?.trim()
  || Deno.env.get('SUPABASE_ANON_KEY')?.trim();

export const getSupabaseServiceCredential = () => {
  const currentKeyMap = readDefaultKey('SUPABASE_SECRET_KEYS');
  const currentKey = Deno.env.get('SUPABASE_SECRET_KEY')?.trim();
  const legacyKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();

  return {
    key: currentKeyMap || currentKey || legacyKey,
    source: currentKeyMap
      ? 'SUPABASE_SECRET_KEYS.default'
      : currentKey
        ? 'SUPABASE_SECRET_KEY'
        : legacyKey
          ? 'SUPABASE_SERVICE_ROLE_KEY'
          : null,
    present: {
      SUPABASE_SECRET_KEYS: Boolean(Deno.env.get('SUPABASE_SECRET_KEYS')),
      SUPABASE_SECRET_KEY: Boolean(currentKey),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(legacyKey),
    },
  };
};

export const getSupabaseServiceKey = () => getSupabaseServiceCredential().key;
