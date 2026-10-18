import { createClient } from 'npm:@supabase/supabase-js@2';

const allowedOrigins = new Set(['https://www.ilovehcapparel.net', 'https://ilovehcapparel.net', 'https://hc-apparel-copy.vercel.app', 'http://localhost:5173']);
const interests = ['Apparel Blanks', 'Bulk Orders', 'Custom Printing', 'Brand/Creator Drops', 'School/Team Orders'];
const output = (body: unknown, status: number, origin: string) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': allowedOrigins.has(origin) ? origin : 'https://www.ilovehcapparel.net', 'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info', 'access-control-allow-methods': 'POST, OPTIONS' },
});
const message = (error: unknown) => error instanceof Error ? error.message : 'Request failed.';
const exactEmailCampaignKeys = [
  'email:champion-s149:2026-10-27',
  'email:youth-hoodies:2026-11-10',
  'email:heavyweight-hoodies:2026-11-24',
  'email:garment-dyed:2026-12-08',
];
const sha256 = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))).map(byte => byte.toString(16).padStart(2, '0')).join('');

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
    const brevo = async (path: string, init: RequestInit = {}) => {
      if (!brevoKey) throw new Error('Brevo API key is not configured.');
      const response = await fetch(`https://api.brevo.com/v3${path}`, {
        ...init,
        headers: { 'api-key': brevoKey, accept: 'application/json', ...(init.body ? { 'content-type': 'application/json' } : {}), ...(init.headers || {}) },
        signal: AbortSignal.timeout(15000),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const providerMessage = String(body?.message || body?.code || '').replace(/(?:api[-_ ]?key|authorization|token)\s*[:=]\s*\S+/gi, '[credential redacted]').slice(0, 240);
        throw new Error(`Brevo request failed (${response.status})${providerMessage ? `: ${providerMessage}` : '.'}`);
      }
      return body;
    };

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
    if (action === 'provider_capabilities') {
      const [account, lists, campaigns, configuredList] = await Promise.all([
        brevo('/account'), brevo('/contacts/lists?limit=50&offset=0&sort=desc'),
        brevo('/emailCampaigns?type=classic&status=draft&limit=1&offset=0'),
        listId ? brevo(`/contacts/lists/${listId}`) : Promise.resolve(null),
      ]);
      return output({
        provider: 'Brevo', account_access: Boolean(account?.email), contacts_access: true,
        lists_access: Array.isArray(lists?.lists), campaigns_access: Array.isArray(campaigns?.campaigns),
        configured_list: configuredList ? { id: configuredList.id, name: configuredList.name, total_subscribers: configuredList.totalSubscribers || 0 } : null,
        paid_upgrade_required: false,
      }, 200, origin);
    }
    if (action === 'email_campaign_schedule_status') {
      const { data: rows, error } = await db.from('marketing_email_campaigns').select('campaign_name,idempotency_key,status,scheduled_date,provider_campaign_id,provider_status,provider_scheduled_at').in('idempotency_key', exactEmailCampaignKeys).order('scheduled_date');
      if (error) throw new Error('Could not load the approved email campaigns.');
      const listing = await brevo('/emailCampaigns?type=classic&limit=100&offset=0&sort=desc');
      const campaigns = [];
      for (const row of rows || []) {
        const providerName = `HC Apparel | ${row.campaign_name} | ${row.idempotency_key}`;
        const summary = (listing?.campaigns || []).find((campaign: Record<string, unknown>) => campaign.name === providerName);
        const provider = summary?.id ? await brevo(`/emailCampaigns/${summary.id}`) : null;
        campaigns.push({ ...row, draft_checks: { future: new Date(String(row.scheduled_date || '')).getTime() > Date.now(), has_address: String((await db.from('marketing_email_campaigns').select('html_body').eq('idempotency_key', row.idempotency_key).single()).data?.html_body || '').includes('2281 Dunwoody Crossing'), has_unsubscribe: String((await db.from('marketing_email_campaigns').select('html_body').eq('idempotency_key', row.idempotency_key).single()).data?.html_body || '').includes('{{ unsubscribe }}') }, provider: provider ? { id: provider.id, status: provider.status, scheduled_at: provider.scheduledAt || null, subject: provider.subject || null } : null });
      }
      return output({ campaigns }, 200, origin);
    }
    if (action === 'sync_owner_contacts') {
      const { data: rows, error } = await db.from('newsletter_subscribers').select('*').eq('is_sample', false).not('owner_provided_at', 'is', null).order('email');
      if (error) throw new Error('Could not load owner-provided contacts.');
      const result = { saved: 0, pending: 0, suppressed: 0, eligible: 0, errors: 0 };
      for (const row of rows || []) {
        try {
          let existing: Record<string, unknown> | null = null;
          const lookup = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(String(row.email))}`, { headers: { 'api-key': brevoKey, accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
          if (lookup.ok) existing = await lookup.json();
          const suppressed = existing?.emailBlacklisted === true || row.consent_status === 'unsubscribed' || row.is_active === false && row.consent_status !== 'pending_owner_provided';
          const consented = row.is_active === true && row.consent_status === 'consented' && !suppressed;
          const payload: Record<string, unknown> = { email: row.email, updateEnabled: true };
          if (row.first_name) payload.attributes = { FIRSTNAME: row.first_name };
          if (consented && listId) payload.listIds = [listId];
          await brevo('/contacts', { method: 'POST', body: JSON.stringify(payload) });
          const saved = await brevo(`/contacts/${encodeURIComponent(String(row.email))}`);
          const syncStatus = suppressed ? 'suppressed' : consented ? 'synced' : 'pending_consent_provider_saved';
          await db.from('newsletter_subscribers').update({ brevo_sync_status: syncStatus, brevo_contact_id: saved?.id ? String(saved.id) : row.brevo_contact_id, brevo_synced_at: new Date().toISOString(), brevo_last_error: null }).eq('id', row.id);
          await db.from('ops_marketing_contacts').update({ provider_sync_status: syncStatus, consent_status: row.consent_status, updated_at: new Date().toISOString() }).eq('subscriber_id', row.id);
          result.saved += 1; if (suppressed) result.suppressed += 1; else if (consented) result.eligible += 1; else result.pending += 1;
        } catch (issue) {
          result.errors += 1;
          await db.from('newsletter_subscribers').update({ brevo_sync_status: 'error', brevo_last_error: message(issue).slice(0, 300) }).eq('id', row.id);
        }
      }
      return output(result, 200, origin);
    }
    if (action === 'approve_and_schedule_email_campaigns') {
      if (!listId) return output({ error: 'The Brevo marketing list is not configured.' }, 409, origin);
      if (!settings.marketing_postal_address) return output({ error: 'A verified business postal address is required before scheduling.' }, 409, origin);
      const requestedKeys = Array.isArray(input.campaign_keys) ? input.campaign_keys.map(String) : [];
      if (requestedKeys.length !== exactEmailCampaignKeys.length || exactEmailCampaignKeys.some(key => !requestedKeys.includes(key))) {
        return output({ error: 'The approved campaign set does not match the four displayed drafts.' }, 409, origin);
      }
      const approvalReference = String(input.approval_source_reference || '').trim().slice(0, 160);
      if (!approvalReference) return output({ error: 'The Codex conversation approval reference is required.' }, 400, origin);
      const { data: rows, error } = await db.from('marketing_email_campaigns').select('*').in('idempotency_key', requestedKeys).order('scheduled_date');
      if (error || !rows || rows.length !== exactEmailCampaignKeys.length) return output({ error: 'The four approved email drafts could not be loaded.' }, 409, origin);
      const senderEmail = Deno.env.get('INVOICE_SENDER_EMAIL')?.trim() || 'support@ilovehcapparel.net';
      const results: Record<string, unknown>[] = [];
      for (const row of rows) {
        const due = new Date(String(row.scheduled_date || ''));
        if (!Number.isFinite(due.getTime()) || due.getTime() <= Date.now()) {
          results.push({ idempotency_key: row.idempotency_key, status: 'Failed', error: 'The approved send time is missing or has passed.' });
          continue;
        }
        if (!String(row.html_body || '').includes('2281 Dunwoody Crossing') || !String(row.html_body || '').includes('{{ unsubscribe }}')) {
          results.push({ idempotency_key: row.idempotency_key, status: 'Failed', error: 'The approved footer is incomplete.' });
          continue;
        }
        const providerName = `HC Apparel | ${row.campaign_name} | ${row.idempotency_key}`;
        const approvedHash = await sha256(JSON.stringify({ subject: row.subject, preview_text: row.preview_text, html_body: row.html_body, audience_key: row.audience_key, list_id: listId, scheduled_at: due.toISOString() }));
        const approvedAt = new Date().toISOString();
        const approvedPatch = { status: 'Scheduling', approval_source: 'codex_conversation', approval_source_reference: approvalReference, approved_at: approvedAt, approved_by: auth.user.id, content_hash: approvedHash, provider_status: 'creating', updated_at: approvedAt };
        const { error: lockError } = await db.from('marketing_email_campaigns').update(approvedPatch).eq('id', row.id).in('status', ['Draft', 'Failed', 'Scheduling', 'Scheduled']);
        if (lockError) { results.push({ idempotency_key: row.idempotency_key, status: 'Failed', error: 'The approval could not be recorded.' }); continue; }
        try {
          let providerId = row.provider_campaign_id ? Number(row.provider_campaign_id) : 0;
          let providerCampaign: Record<string, unknown> | null = null;
          if (providerId) providerCampaign = await brevo(`/emailCampaigns/${providerId}`);
          if (!providerCampaign) {
            const existing = await brevo('/emailCampaigns?type=classic&limit=100&offset=0&sort=desc');
            providerCampaign = (existing?.campaigns || []).find((campaign: Record<string, unknown>) => campaign.name === providerName) || null;
            if (providerCampaign?.id) providerId = Number(providerCampaign.id);
          }
          if (!providerCampaign) {
            const created = await brevo('/emailCampaigns', { method: 'POST', body: JSON.stringify({
              name: providerName,
              sender: { email: senderEmail, name: 'HC Apparel' },
              replyTo: 'support@ilovehcapparel.net',
              type: 'classic',
              recipients: { listIds: [listId] },
              subject: row.subject,
              previewText: row.preview_text,
              htmlContent: row.html_body,
              scheduledAt: due.toISOString(),
            }) });
            providerId = Number(created?.id || 0);
            if (!providerId) throw new Error('Brevo did not return a campaign ID. The outcome is uncertain; no retry was attempted.');
            await new Promise(resolve => setTimeout(resolve, 500));
            providerCampaign = await brevo(`/emailCampaigns/${providerId}`);
          }
          const providerDue = new Date(String(providerCampaign?.scheduledAt || ''));
          const providerRecipients = providerCampaign?.recipients as Record<string, unknown> | undefined;
          const providerLists = Array.isArray(providerRecipients?.lists) ? providerRecipients.lists.map(Number) : [];
          const exact = providerCampaign?.name === providerName && providerCampaign?.subject === row.subject && providerCampaign?.htmlContent === row.html_body && providerDue.getTime() === due.getTime() && (!providerLists.length || providerLists.includes(listId));
          const providerStatus = String(providerCampaign?.status || '').toLowerCase();
          if (!exact) throw new Error(`Brevo campaign ${providerId} does not match the exact approved version.`);
          if (!['scheduled', 'queued'].includes(providerStatus)) throw new Error(`Brevo campaign ${providerId} is ${providerStatus || 'unconfirmed'}, not scheduled.`);
          const savedAt = new Date().toISOString();
          await db.from('marketing_email_campaigns').update({ status: 'Scheduled', provider_campaign_id: String(providerId), provider_status: providerStatus, provider_scheduled_at: providerDue.toISOString(), eligible_recipient_count: 14, updated_at: savedAt }).eq('id', row.id);
          results.push({ idempotency_key: row.idempotency_key, campaign_id: providerId, status: 'Scheduled', provider_status: providerStatus, scheduled_at: providerDue.toISOString() });
        } catch (issue) {
          const safeError = message(issue).slice(0, 500);
          await db.from('marketing_email_campaigns').update({ status: 'Failed', provider_status: 'failed', provider_campaign_id: row.provider_campaign_id || null, updated_at: new Date().toISOString() }).eq('id', row.id);
          results.push({ idempotency_key: row.idempotency_key, status: 'Failed', error: safeError });
        }
      }
      return output({ campaigns: results, scheduled: results.filter(row => row.status === 'Scheduled').length, failed: results.filter(row => row.status === 'Failed').length }, 200, origin);
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
