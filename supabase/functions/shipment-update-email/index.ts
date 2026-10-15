import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type' };
const INVOICE_ID = 'invoice-fab32c15-3fa9-44f8-b059-516e02c6a6d0';
const TRACKING = '9505506617716287884250';
const SUBJECT = 'Your HC Apparel Order — Tracking Details';
const TRACKING_URL = `https://tools.usps.com/go/TrackConfirmAction?tLabels=${TRACKING}`;
const STORE_URL = 'https://www.ilovehcapparel.net/';
const LOGO_URL = 'https://bxsdajpldrdesnvjiubt.supabase.co/storage/v1/object/public/storefront-assets/legacy/8498fd234f415ff5_4bf10d633_1.png';
const OPERATION_KEY = `shipment-update:${INVOICE_ID}:USPS:${TRACKING}`;
const safe = (value: unknown, max = 500) => String(value || '').trim().slice(0, max);
const email = (value: unknown) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safe(value, 254).toLowerCase()) ? safe(value, 254).toLowerCase() : '';
const esc = (value: unknown) => String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

async function authorized(request: Request, admin: ReturnType<typeof createClient>, serviceRole: string, supabaseUrl: string) {
  const token = safe(request.headers.get('authorization')).replace(/^Bearer\s+/i, '');
  if (!token) return false;
  if (token === serviceRole) return true;
  const caller = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') || '', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const role = await caller.rpc('ops_verified_calling_role');
  if (!role.error && role.data === 'service_role') return true;
  const user = await admin.auth.getUser(token);
  if (!user.data.user) return false;
  const profile = await admin.from('profiles').select('role').eq('id', user.data.user.id).maybeSingle();
  return profile.data?.role === 'admin';
}

function content(name: string, shipment: Record<string, any>) {
  const live = shipment.status_source === 'USPS Tracking 3.2' && shipment.shipment_status !== 'tracking_refresh_failed';
  const estimate = live && shipment.expected_delivery_date ? `<p style="margin:0 0 18px"><strong>Estimated delivery:</strong> ${esc(shipment.expected_delivery_date)} <span style="color:#6b675e">(USPS estimate)</span></p>` : '';
  const status = live && shipment.status_summary ? `<div style="margin:18px 0;padding:14px 16px;background:#f8f4ee;border-left:4px solid #e8a910"><strong>Latest USPS update</strong><br>${esc(shipment.status_summary)}</div>` : '';
  const textEstimate = live && shipment.expected_delivery_date ? `\nEstimated delivery (USPS estimate): ${shipment.expected_delivery_date}` : '';
  const textStatus = live && shipment.status_summary ? `\nLatest USPS update: ${shipment.status_summary}` : '';
  return {
    html: `<!doctype html><html><body style="margin:0;background:#f8f4ee;font-family:Arial,Helvetica,sans-serif;color:#202018"><div style="display:none;max-height:0;overflow:hidden">USPS tracking details for HC Apparel invoice HCA-2026-0002.</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8f4ee"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #c9a47a;border-radius:14px;overflow:hidden"><tr><td align="center" style="background:#4a5e2a;padding:24px"><a href="${STORE_URL}"><img src="${LOGO_URL}" width="220" alt="HC Apparel logo" style="display:block;max-width:100%;height:auto;border:0"></a></td></tr><tr><td style="padding:30px 26px"><p style="margin:0 0 16px;font-size:17px;line-height:1.6">Hello ${esc(name || 'Tina')},</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6">Thank you for supporting HC Apparel! Your order has been shipped, and your USPS tracking details are below.</p><div style="background:#f8f4ee;border:1px solid #e6d8c5;border-radius:10px;padding:18px;margin:20px 0"><p style="margin:0 0 8px"><strong>Invoice:</strong> HCA-2026-0002</p><p style="margin:0 0 8px"><strong>Carrier:</strong> USPS</p><p style="margin:0 0 8px"><strong>Service:</strong> Priority Mail Padded Flat Rate Envelope</p><p style="margin:0"><strong>Tracking number:</strong> ${TRACKING}</p></div>${status}${estimate}<p style="text-align:center;margin:28px 0"><a href="${TRACKING_URL}" style="display:inline-block;background:#4a5e2a;color:#ffffff;padding:14px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Track Your Package</a></p><p style="margin:0 0 16px;font-size:16px;line-height:1.6">Thank you again for choosing HC Apparel. We truly appreciate your support.</p><p style="margin:0;font-size:15px;line-height:1.6">Warmly,<br><strong style="color:#4a5e2a">HC Apparel</strong><br><a href="${STORE_URL}" style="color:#4a5e2a">ilovehcapparel.net</a></p></td></tr><tr><td style="background:#c9a47a;height:8px;font-size:0">&nbsp;</td></tr></table></td></tr></table></body></html>`,
    text: `Hello ${name || 'Tina'},\n\nThank you for supporting HC Apparel! Your order has been shipped.\n\nInvoice: HCA-2026-0002\nCarrier: USPS\nService: Priority Mail Padded Flat Rate Envelope\nTracking number: ${TRACKING}${textStatus}${textEstimate}\n\nTrack your package: ${TRACKING_URL}\n\nThank you again for choosing HC Apparel. We truly appreciate your support.\n\nHC Apparel\n${STORE_URL}`,
  };
}

async function delivery(apiKey: string, messageId: string) {
  const response = await fetch(`https://api.brevo.com/v3/smtp/statistics/events?messageId=${encodeURIComponent(messageId)}&limit=50`, { headers: { 'api-key': apiKey, accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Brevo delivery lookup failed (${response.status}).`);
  const events = Array.isArray(body.events) ? body.events : [];
  const delivered = events.find((item: any) => item.event === 'delivered');
  const failed = events.find((item: any) => ['hardBounces', 'softBounces', 'blocked', 'invalid', 'error'].includes(item.event));
  return { events, status: delivered ? 'delivered' : failed ? 'failed' : events.length ? 'accepted' : 'pending', deliveredAt: delivered?.date || null, error: failed?.reason || failed?.event || '' };
}

async function recordInvoiceEmail(admin: ReturnType<typeof createClient>, details: Record<string, unknown>) {
  const current = await admin.from('ops_shared_records').select('payload').eq('id', INVOICE_ID).eq('record_type', 'invoice').single();
  if (current.error || !current.data) throw new Error('The shipment email could not be recorded against the invoice.');
  const update = await admin.from('ops_shared_records').update({
    payload: { ...(current.data.payload || {}), shipmentEmail: { ...((current.data.payload || {}).shipmentEmail || {}), ...details }, updatedAt: new Date().toISOString() },
    sync_state: 'synced',
  }).eq('id', INVOICE_ID).eq('record_type', 'invoice');
  if (update.error) throw update.error;
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const admin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
  if (!await authorized(request, admin, serviceRole, supabaseUrl)) return json({ error: 'Shipment email operation is not authorized.' }, 403);
  const input = await request.json().catch(() => ({}));
  const apiKey = safe(Deno.env.get('BREVO_API_KEY'), 500);
  const senderEmail = email(Deno.env.get('INVOICE_SENDER_EMAIL') || 'support@ilovehcapparel.net');
  if (!apiKey || !senderEmail) return json({ error: 'Brevo shipment email delivery is not configured.' }, 424);
  const shipmentResult = await admin.from('ops_shipments').select('*').eq('shared_record_id', INVOICE_ID).eq('tracking_number', TRACKING).single();
  if (shipmentResult.error || !shipmentResult.data) return json({ error: 'The verified Tina Dunn shipment was not found.' }, 404);
  const shipment = shipmentResult.data;
  if (input.action === 'status') {
    if (!shipment.shipment_email_provider_message_id) return json({ error: 'No accepted shipment email is available for delivery lookup.' }, 409);
    const result = await delivery(apiKey, shipment.shipment_email_provider_message_id);
    await admin.from('ops_shipments').update({ shipment_email_status: result.status, shipment_email_delivered_at: result.deliveredAt, shipment_email_last_checked_at: new Date().toISOString(), shipment_email_error: result.error, shipment_email_events: result.events }).eq('id', shipment.id);
    await recordInvoiceEmail(admin, { operationKey: OPERATION_KEY, provider: 'Brevo', providerMessageId: shipment.shipment_email_provider_message_id, recipient: shipment.shipment_email_recipient, subject: SUBJECT, status: result.status, acceptedAt: shipment.shipment_email_accepted_at, deliveredAt: result.deliveredAt, lastCheckedAt: new Date().toISOString(), error: result.error });
    return json({ messageId: shipment.shipment_email_provider_message_id, recipient: shipment.shipment_email_recipient, ...result });
  }
  if (shipment.shipment_email_operation_key === OPERATION_KEY && ['sending', 'accepted', 'delivered', 'pending', 'unknown'].includes(shipment.shipment_email_status)) return json({ duplicate: true, status: shipment.shipment_email_status, messageId: shipment.shipment_email_provider_message_id, recipient: shipment.shipment_email_recipient });
  const invoiceResult = await admin.from('ops_shared_records').select('payload').eq('id', INVOICE_ID).eq('record_type', 'invoice').single();
  if (invoiceResult.error || !invoiceResult.data) return json({ error: 'The verified Tina Dunn invoice was not found.' }, 404);
  const invoice = invoiceResult.data.payload || {};
  const crmResult = await admin.from('ops_shared_records').select('payload').eq('record_type', 'crm').eq('business_id', 'hc-apparel');
  const candidates = new Set<string>();
  const invoiceEmail = email(invoice.customerEmail); if (invoiceEmail) candidates.add(invoiceEmail);
  for (const row of crmResult.data || []) if (safe(row.payload?.name).toLowerCase() === safe(invoice.customerName).toLowerCase()) { const value = email(row.payload?.email); if (value) candidates.add(value); }
  if (candidates.size !== 1) return json({ error: candidates.size ? 'Conflicting recipient emails were found for Tina Dunn.' : 'No verified recipient email was found.', candidateCount: candidates.size }, 409);
  const recipient = [...candidates][0];
  const logo = await fetch(LOGO_URL, { method: 'HEAD', signal: AbortSignal.timeout(15000) }).catch(() => null);
  if (!logo?.ok || !String(logo.headers.get('content-type') || '').startsWith('image/')) return json({ error: 'The public HC Apparel logo could not be verified.' }, 424);
  const requestedAt = new Date().toISOString();
  await admin.from('ops_shipments').update({ shipment_email_operation_key: OPERATION_KEY, shipment_email_recipient: recipient, shipment_email_subject: SUBJECT, shipment_email_status: 'sending', shipment_email_provider: 'Brevo', shipment_email_requested_at: requestedAt, shipment_email_error: null }).eq('id', shipment.id);
  const body = content(safe(invoice.customerName, 120) || 'Tina', shipment);
  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'api-key': apiKey, accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify({ sender: { email: senderEmail, name: 'HC Apparel' }, to: [{ email: recipient, name: safe(invoice.customerName, 120) || 'Tina Dunn' }], replyTo: { email: senderEmail, name: 'HC Apparel' }, subject: SUBJECT, htmlContent: body.html, textContent: body.text, tags: ['shipment-update', 'hca-2026-0002'] }), signal: AbortSignal.timeout(20000) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.messageId) {
      const reason = `Brevo rejected the shipment email (${response.status}).`;
      await admin.from('ops_shipments').update({ shipment_email_status: 'failed', shipment_email_error: reason, shipment_email_last_checked_at: new Date().toISOString() }).eq('id', shipment.id);
      return json({ error: reason }, 502);
    }
    const acceptedAt = new Date().toISOString();
    await admin.from('ops_shipments').update({ shipment_email_status: 'accepted', shipment_email_provider_message_id: result.messageId, shipment_email_accepted_at: acceptedAt, shipment_email_last_checked_at: acceptedAt, shipment_email_error: null }).eq('id', shipment.id);
    await recordInvoiceEmail(admin, { operationKey: OPERATION_KEY, provider: 'Brevo', providerMessageId: result.messageId, recipient, subject: SUBJECT, status: 'accepted', acceptedAt, deliveredAt: null, lastCheckedAt: acceptedAt, error: '' });
    return json({ accepted: true, duplicate: false, status: 'accepted', messageId: result.messageId, recipient, acceptedAt, subject: SUBJECT });
  } catch (error) {
    const reason = safe((error as Error)?.message || error, 300);
    await admin.from('ops_shipments').update({ shipment_email_status: 'unknown', shipment_email_error: `Provider response uncertain: ${reason}`, shipment_email_last_checked_at: new Date().toISOString() }).eq('id', shipment.id);
    return json({ error: 'The provider response was uncertain. The email will not be resent automatically.', status: 'unknown' }, 502);
  }
});
