import { supabase } from '@/api/supabaseClient';

export async function marketingAdmin(action, payload = {}) {
  const { data, error } = await supabase.functions.invoke('marketing-foundation', { body: { action, ...payload } });
  if (error || data?.error) throw new Error(data?.error || error?.message || 'Marketing request failed.');
  return data;
}

export const csvCell = value => `"${String(Array.isArray(value) ? value.join('; ') : value ?? '').replaceAll('"', '""')}"`;
