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

export const getSupabaseServiceKey = () =>
  readDefaultKey('SUPABASE_SECRET_KEYS')
  || Deno.env.get('SUPABASE_SECRET_KEY')?.trim()
  || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
