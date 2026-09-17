import { supabase } from '@/api/supabaseClient';

export async function calendarAction(action, values = {}) {
  const { data, error } = await supabase.functions.invoke('productivity-calendar', { body: { action, ...values } });
  if (error || data?.error) throw new Error(data?.error || error?.message || 'Calendar request failed.');
  return data;
}

export async function adminRows(table, sort = 'created_at', limit = 100) {
  const { data, error } = await supabase.from(table).select('*').order(sort, { ascending: false }).limit(limit);
  if (error) throw error;
  return data || [];
}
