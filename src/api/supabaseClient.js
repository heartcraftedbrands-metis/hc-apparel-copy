import { createClient } from '@supabase/supabase-js';
import { validatePublicRuntimeConfig } from '@/lib/publicRuntimeConfig';

const runtimeConfig = validatePublicRuntimeConfig({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
});

if (!runtimeConfig.isValid) {
  throw new Error('Invalid public Supabase runtime configuration');
}

const {
  supabaseUrl,
  supabasePublishableKey,
} = runtimeConfig;

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export { supabaseUrl };
