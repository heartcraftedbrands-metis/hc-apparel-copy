import { createClient } from 'npm:@supabase/supabase-js@2';

const allowedOrigins = new Set(['https://www.ilovehcapparel.net', 'https://ilovehcapparel.net', 'https://hc-apparel-copy.vercel.app', 'http://localhost:5173']);
const interests = ['Apparel Blanks', 'Bulk Orders', 'Custom Printing', 'Brand/Creator Drops', 'School/Team Orders'];
const output = (body: unknown, status: number, origin: string) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': allowedOrigins.has(origin) ? origin : 'https://www.ilovehcapparel.net', 'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info', 'access-control-allow-methods': 'POST, OPTIONS' },
});
const message = (error: unknown) => error instanceof Error ? error.message : 'Request failed.';

Deno.serve(async request => {
  const origin = request.headers.get('origin') || '';
  if (request.method === 'OPTIONS') return output({}, 200, origin);
  if (request.method !== 'POST') return output({ error: 'Method not allowed.' }, 405, origin);
  try {
    const input = await request.json();
    const url = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    if (!url || !serviceKey || !anonKey) throw new Error('Supabase function credentials are missing.');
    const db = createClient(url, serviceKey);
    const action = String(input.action || '');
    const settingsResult = await db.from('marketing_settings').select('*').eq('id', true).single();
    if (settingsResult.error) throw new Error('Marketing migration is not applied.');
    const settings = settingsResult.data;
    const brevoKey = Deno.env.get('BREVO_API_KEY')?.trim() || '';
    const listText = Deno.env.get('BREVO_LIST_ID')?.trim() || '';
    const listId = /^\d+$/.test(listText) && Number(listText) > 0 ? Number(listText) : 0;

    async function syncSubscriber(row: Record<string, unknown>) {
      if (!brevoKey || !listId) {
        await db.from('newsletter_subscribers').update({ brevo_sync_status: 'skipped_unconfigured', brevo_last_error: null }).eq('id', row.id);
        return { status: 'skipped_unconfigured' };
      }
      if (!row.is_active || row.consent_status !== 'consented') throw new Error('Only active, consented subscribers can sync.');
      const body = { email: row.email, attributes: row.first_name ? { FIRSTNAME: row.first_name } : {}, listIds: [listId], updateEnabled: true };
      try {
        const response = await fetch('https://api.brevo.com/v3/contacts', { method: 'POST', headers: { 'api-key': brevoKey, 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error(`Brevo contact sync failed (${response.status}).`);
        const created = await response.json().catch(() => ({}));
        let contactId = created.id ? String(created.id) : null;
        if (!contactId) {
          const lookup = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(String(row.email))}`, { headers: { 'api-key': brevoKey, accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
          if (lookup.ok) contactId = String((await lookup.json()).id || '') || null;
        }
        await db.from('newsletter_subscribers').update({ brevo_sync_status: 'synced', brevo_contact_id: contactId, brevo_synced_at: new Date().toISOString(), brevo_last_error: null }).eq('id', row.id);
        return { status: 'synced', contact_id: contactId };
      } catch (error) {
        const safeError = message(error).slice(0, 300);
        await db.from('newsletter_subscribers').update({ brevo_sync_status: 'error', brevo_last_error: safeError }).eq('id', row.id);
        return { status: 'error', error: safeError };
      }
    }

    if (action === 'subscribe') {
      if (input.consent !== true) return output({ error: 'Consent is required.' }, 400, origin);
      const email = String(input.email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return output({ error: 'Enter a valid email address.' }, 400, origin);
      const firstName = String(input.first_name || '').trim().slice(0, 80);
      const tags = Array.isArray(input.interests) ? input.interests.filter((tag: unknown) => interests.includes(String(tag))) : [];
      const source = ['home', 'contact'].includes(input.source) ? input.source : 'unknown';
      const consentStatus = settings.double_opt_in ? 'pending_double_opt_in' : 'consented';
      const { data: row, error } = await db.from('newsletter_subscribers').upsert({ email, first_name: firstName, interests: [...new Set(tags)], source, consent_status: consentStatus, consent_at: new Date().toISOString(), is_active: true, brevo_sync_status: settings.double_opt_in ? 'pending_double_opt_in' : 'not_synced', brevo_last_error: null }, { onConflict: 'email' }).select().single();
      if (error || !row) {
        console.error('Newsletter signup save failed', { code: error?.code, message: error?.message, details: error?.details });
        throw new Error('Could not save your signup. Please try again.');
      }
      await db.from('marketing_events').insert({ event_name: 'newsletter_signup', source, dedupe_key: `newsletter_signup:${row.id}:${row.consent_at}` });
      const sync = settings.double_opt_in ? { status: 'pending_double_opt_in' } : await syncSubscriber(row);
      return output({ saved: true, sync_status: sync.status, note: settings.double_opt_in ? 'Signup saved locally. Double opt-in confirmation must be completed before Brevo sync.' : undefined }, 200, origin);
    }

    const jwt = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
    const userDb = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
    const { data: auth } = await userDb.auth.getUser(jwt);
    const { data: isAdmin } = auth.user ? await userDb.rpc('is_admin') : { data: false };
    if (!auth.user || !isAdmin) return output({ error: 'Admin access required.' }, 403, origin);

    if (action === 'status') {
      const { data: last } = await db.from('newsletter_subscribers').select('brevo_sync_status,brevo_last_error,brevo_synced_at,updated_date').eq('is_sample', false).eq('is_active', true).in('brevo_sync_status', ['synced', 'error', 'skipped_unconfigured']).order('updated_date', { ascending: false }).limit(1).maybeSingle();
      return output({ provider: 'Brevo', api_key_configured: Boolean(brevoKey), list_id_configured: Boolean(listId), double_opt_in: settings.double_opt_in, last_sync: last || null }, 200, origin);
    }
    if (action === 'subscribers') {
      const { data, error } = await db.from('newsletter_subscribers').select('id,email,first_name,interests,source,consent_status,consent_at,is_active,brevo_sync_status,brevo_contact_id,brevo_synced_at,brevo_last_error,created_date').eq('is_sample', false).order('created_date', { ascending: false }).limit(1000);
      if (error) throw new Error('Could not load subscribers.');
      return output({ subscribers: data || [] }, 200, origin);
    }
    if (action === 'retry_sync') {
      const { data: row } = await db.from('newsletter_subscribers').select('*').eq('id', String(input.id || '')).eq('is_active', true).eq('consent_status', 'consented').single();
      if (!row) return output({ error: 'Only active, consented subscribers can retry sync.' }, 400, origin);
      return output(await syncSubscriber(row), 200, origin);
    }
    if (action === 'mark_inactive') {
      const { error } = await db.from('newsletter_subscribers').update({ is_active: false, consent_status: 'unsubscribed', brevo_sync_status: 'inactive_local' }).eq('id', String(input.id || ''));
      if (error) throw new Error('Could not mark subscriber inactive.');
      return output({ updated: true, note: 'Marked inactive locally; Brevo contact was not changed.' }, 200, origin);
    }
    if (action === 'settings') {
      return output({ ga4_measurement_id: settings.ga4_measurement_id, pinterest_tag_id: settings.pinterest_tag_id, vercel_analytics_enabled: settings.vercel_analytics_enabled, internal_analytics_enabled: settings.internal_analytics_enabled, double_opt_in: settings.double_opt_in }, 200, origin);
    }
    if (action === 'update_settings') {
      const ga4 = String(input.ga4_measurement_id || '').trim();
      const pinterest = String(input.pinterest_tag_id || '').trim();
      if (ga4 && !/^G-[A-Z0-9]{4,20}$/.test(ga4)) return output({ error: 'Enter a valid GA4 Measurement ID.' }, 400, origin);
      if (pinterest && !/^\d{5,30}$/.test(pinterest)) return output({ error: 'Enter a valid Pinterest Tag ID.' }, 400, origin);
      const values = { ga4_measurement_id: ga4 || null, pinterest_tag_id: pinterest || null, vercel_analytics_enabled: input.vercel_analytics_enabled === true, internal_analytics_enabled: input.internal_analytics_enabled !== false, double_opt_in: input.double_opt_in === true, updated_at: new Date().toISOString() };
      const { error } = await db.from('marketing_settings').update(values).eq('id', true);
      if (error) throw new Error('Could not save marketing settings.');
      return output({ saved: true, settings: values }, 200, origin);
    }
    return output({ error: 'Unknown action.' }, 400, origin);
  } catch (error) {
    return output({ error: message(error) }, 500, origin);
  }
});
