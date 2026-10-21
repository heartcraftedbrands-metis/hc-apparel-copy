import { createClient } from 'npm:@supabase/supabase-js@2';
import { getSupabaseServiceKey } from '../_shared/supabaseCredentials.ts';

type Row = Record<string, any>;

const DTF_ORDER_ID = '8dce655c-e9a0-4abf-a65b-e1e372425ace';
const CUSTOMER_ORDER_ID = '3e3ed8ef-df83-4382-9feb-12fe4eaaad2d';
const RECIPIENT = 'heartfamilyco@gmail.com';
const SENDER = 'support@ilovehcapparel.net';
const SUBJECT = '[TEST ORDER — NO FULFILLMENT] DTF Prints order details';
const OPERATION_KEY = `dtf-test-order-details-v2:${CUSTOMER_ORDER_ID}`;
const LOGO_URL = 'https://bxsdajpldrdesnvjiubt.supabase.co/storage/v1/object/public/storefront-assets/legacy/8498fd234f415ff5_4bf10d633_1.png';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

const esc = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const money = (value: unknown) => Number(value || 0).toFixed(2);
const eventKey = (value: unknown) => String(value || '').toLowerCase().replaceAll('_', '').replaceAll('-', '');
const sameMessage = (left: unknown, right: unknown) => String(left || '').replace(/^<|>$/g, '') === String(right || '').replace(/^<|>$/g, '');

function deliveryFromEvents(events: Row[]) {
  const keys = events.map(event => eventKey(event.event));
  if (keys.some(key => key === 'delivered')) return 'delivered';
  if (keys.some(key => key.includes('hardbounce'))) return 'bounced';
  if (keys.some(key => key === 'blocked' || key === 'invalid')) return 'blocked';
  if (keys.some(key => key === 'deferred' || key.includes('softbounce'))) return 'deferred';
  if (keys.some(key => key === 'requests' || key === 'request' || key === 'sent')) return 'accepted';
  return 'unknown';
}

async function brevoJson(apiKey: string, path: string) {
  const response = await fetch(`https://api.brevo.com/v3${path}`, {
    headers: { 'api-key': apiKey, accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 404) return { __error: `Brevo lookup failed (${response.status})`, __status: response.status, __body: body };
  return response.status === 404 ? null : body;
}

async function inspectBrevo(apiKey: string, knownMessageId?: string | null) {
  const encodedEmail = encodeURIComponent(RECIPIENT);
  const [emailsResult, eventsResult, blockedResult, contactResult] = await Promise.all([
    brevoJson(apiKey, `/smtp/emails?email=${encodedEmail}&sort=desc&limit=100&offset=0`),
    brevoJson(apiKey, `/smtp/statistics/events?email=${encodedEmail}&days=30&sort=desc&limit=100&offset=0`),
    brevoJson(apiKey, '/smtp/blockedContacts?limit=50&offset=0&sort=desc'),
    brevoJson(apiKey, `/contacts/${encodedEmail}`),
  ]);
  const emails = Array.isArray(emailsResult?.transactionalEmails) ? emailsResult.transactionalEmails : [];
  const subjectMatches = emails.filter((email: Row) => email.email?.toLowerCase() === RECIPIENT && email.subject === SUBJECT);
  const providerMessageId = knownMessageId || subjectMatches[0]?.messageId || null;
  const selectedEmail = (providerMessageId ? subjectMatches.find((email: Row) => sameMessage(email.messageId, providerMessageId)) : null) || subjectMatches[0];
  const contentResult = selectedEmail?.uuid ? await brevoJson(apiKey, `/smtp/emails/${encodeURIComponent(selectedEmail.uuid)}`) : null;
  const storedBody = String(contentResult?.body || '');
  const contentChecks = {
    artworkFilename: storedBody.includes('1-Photo-1.jpg'),
    dimensions: /10(?:\.0)?\s*(?:×|x|&times;)\s*10(?:\.0)?/i.test(storedBody),
    quantity: /quantity[^0-9]{0,30}15/i.test(storedBody),
    unitPrice: storedBody.includes('$7.14'),
    transferSubtotal: storedBody.includes('$107.10'),
    shipping: storedBody.includes('$13.50'),
    total: storedBody.includes('$246.57'),
    customerOrder: storedBody.includes(CUSTOMER_ORDER_ID),
    dtfReference: storedBody.includes('DTF-42BB159D98'),
    stripePayment: storedBody.includes('pi_3UT0TlEdNsb7X8RS1XuzR5PM'),
    noFulfillment: /no real charge/i.test(storedBody) && /do not (?:place a supplier order|fulfill)/i.test(storedBody),
    artworkImage: /<img[^>]+(?:1-Photo-1\.jpg|dtf-artwork)/i.test(storedBody),
  };
  const events = (Array.isArray(eventsResult?.events) ? eventsResult.events : [])
    .filter((event: Row) => providerMessageId ? sameMessage(event.messageId, providerMessageId) : false);
  const blockedContacts = Array.isArray(blockedResult?.contacts)
    ? blockedResult.contacts.filter((contact: Row) => String(contact.email || '').toLowerCase() === RECIPIENT)
    : [];
  const emailBlacklisted = contactResult?.emailBlacklisted === true;
  const suppressed = emailBlacklisted || blockedContacts.length > 0;
  const lookupErrors = [
    ['emails', emailsResult], ['events', eventsResult], ['blockedContacts', blockedResult], ['contact', contactResult],
  ].filter(([, result]) => result?.__error).map(([lookup, result]) => ({ lookup, status: result.__status, error: result.__error }));
  return {
    subjectMatches: subjectMatches.map((email: Row) => ({ date: email.date, email: email.email, messageId: email.messageId, subject: email.subject, uuid: email.uuid })),
    providerMessageId,
    events: events.map((event: Row) => ({ date: event.date, email: event.email, event: event.event, from: event.from, messageId: event.messageId, reason: event.reason || null })),
    deliveryStatus: deliveryFromEvents(events),
    suppression: { checked: !lookupErrors.some(item => item.lookup === 'blockedContacts' || item.lookup === 'contact'), suppressed, emailBlacklisted, blockedContacts },
    lookupErrors,
    contentAudit: {
      available: Boolean(storedBody),
      complete: Boolean(storedBody) && Object.values(contentChecks).every(Boolean),
      checks: contentChecks,
    },
  };
}

function renderEmail(dtf: Row, order: Row, artworkUrl: string) {
  const transferItem = (Array.isArray(order.order_items) ? order.order_items : []).find((item: Row) => item.dtf_order_id === dtf.id) || {};
  const transferSubtotal = Number(dtf.customer_total || transferItem.price || 0);
  const unitPrice = transferSubtotal / Number(dtf.quantity || 1);
  const oneToFourteenUnit = 7.81;
  const perUnitDiscount = Math.max(0, oneToFourteenUnit - unitPrice);
  const totalDiscount = perUnitDiscount * Number(dtf.quantity || 0);
  const discountPercent = oneToFourteenUnit > 0 ? perUnitDiscount / oneToFourteenUnit * 100 : 0;
  const created = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', dateStyle: 'long', timeStyle: 'short' }).format(new Date(order.created_date));
  const payment = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', dateStyle: 'long', timeStyle: 'short' }).format(new Date(order.payment_confirmed_at));
  const options = `Transfers by size; pre-cut: ${dtf.production_options?.precut === true ? 'Yes' : 'No'}`;
  const address = `${order.shipping_address?.street || ''}, ${order.shipping_address?.city || ''}, ${order.shipping_address?.state || ''} ${order.shipping_address?.zip || ''}`;
  const adminUrl = `https://www.ilovehcapparel.net/AdminDTFTransfers?order=${encodeURIComponent(dtf.id)}`;
  const itemRows = (Array.isArray(order.order_items) ? order.order_items : []).map((item: Row) => {
    const quantity = item.product_type === 'transfer' ? Number(item.transfer_quantity || dtf.quantity) : Number(item.quantity || 1);
    const detail = item.product_type === 'transfer' ? `${dtf.width_inches} × ${dtf.height_inches} in · ${options}` : `${esc(item.color || '')}${item.size ? ` · Size ${esc(item.size)}` : ''}`;
    const lineTotal = item.product_type === 'transfer' ? transferSubtotal : Number(item.price || 0) * Number(item.quantity || 1);
    return `<tr><td style="padding:9px;border-bottom:1px solid #e8dfcf;"><strong>${esc(item.product_name)}</strong><br><span style="color:#6a7067;font-size:13px;">${detail}</span></td><td align="center" style="padding:9px;border-bottom:1px solid #e8dfcf;">${quantity}</td><td align="right" style="padding:9px;border-bottom:1px solid #e8dfcf;">$${money(lineTotal)}</td></tr>`;
  }).join('');

  const html = `<!doctype html><html><body style="margin:0;background:#f8f4ee;color:#202227;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8f4ee;"><tr><td align="center" style="padding:24px 12px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#fff;border:1px solid #ded5c4;border-radius:18px;overflow:hidden;">
  <tr><td align="center" style="background:#4a5e2a;padding:20px 24px;"><a href="https://www.ilovehcapparel.net/"><img src="${LOGO_URL}" width="150" alt="HC Apparel" style="display:block;width:150px;max-width:100%;height:auto;border:0;margin:auto;"></a></td></tr>
  <tr><td style="padding:28px 28px 10px;"><p style="margin:0 0 8px;color:#8a6b25;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Test order — no fulfillment</p><h1 style="margin:0;color:#26351f;font-size:30px;line-height:1.15;">DTF Prints order details</h1><p style="margin:14px 0 0;background:#fff2cc;border:1px solid #e0b84c;border-radius:10px;padding:12px;color:#4d3c0d;font-weight:700;">This is controlled test data. No real charge occurred. Do not place a supplier order or fulfill any item.</p></td></tr>
  <tr><td style="padding:10px 28px 28px;color:#41463d;font-size:15px;line-height:1.55;">
  <h2 style="color:#26351f;margin:10px 0;">Test customer</h2><p><strong>Name:</strong> HC Apparel controlled DTF test customer<br><strong>Email:</strong> ${esc(order.customer_email)}<br><strong>Shipping:</strong> ${esc(address)}<br><strong>Delivery method:</strong> Verified S&amp;S/Ninja transfer-cart freight fixture (test only)</p>
  <h2 style="color:#26351f;margin:20px 0 10px;">Order references</h2><p><strong>Customer order:</strong> ${esc(order.id)}<br><strong>DTF reference:</strong> ${esc(dtf.order_reference)}<br><strong>DTF record:</strong> ${esc(dtf.id)}<br><strong>Order timestamp:</strong> ${esc(created)} Eastern<br><strong>Payment confirmed:</strong> ${esc(payment)} Eastern</p>
  <h2 style="color:#26351f;margin:20px 0 10px;">Artwork and transfer specifications</h2><p><img src="${esc(artworkUrl)}" width="260" alt="Private thumbnail of ${esc(dtf.artwork_original_name)}" style="display:block;max-width:100%;height:auto;border:1px solid #ded5c4;border-radius:12px;"></p><p><strong>Filename:</strong> ${esc(dtf.artwork_original_name)}<br><strong>Dimensions:</strong> ${esc(dtf.width_inches)} × ${esc(dtf.height_inches)} inches<br><strong>Quantity:</strong> ${esc(dtf.quantity)}<br><strong>Options:</strong> ${esc(options)}<br><a href="${adminUrl}" style="color:#4a5e2a;font-weight:700;">Open the secure admin order and original artwork</a></p>
  <h2 style="color:#26351f;margin:20px 0 10px;">Pricing</h2><p><strong>Approved DTF unit price:</strong> $${money(unitPrice)}<br><strong>Quantity tier:</strong> 15–49 transfers<br><strong>Quantity discount:</strong> $${money(perUnitDiscount)} per transfer / $${money(totalDiscount)} total (${discountPercent.toFixed(2)}% versus the approved 1–14 unit tier)<br><strong>DTF transfer subtotal:</strong> $${money(transferSubtotal)}<br><strong>Order merchandise subtotal:</strong> $${money(order.product_subtotal)}<br><strong>Shipping:</strong> $${money(order.shipping_amount)}<br><strong>Tax:</strong> $${money(order.sales_tax_amount)}<br><strong>Total:</strong> $${money(order.total_amount)}</p>
  <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:12px;"><thead><tr style="background:#f3eddf;color:#26351f;"><th align="left" style="padding:9px;">Item</th><th style="padding:9px;">Qty</th><th align="right" style="padding:9px;">Line total</th></tr></thead><tbody>${itemRows}</tbody></table>
  <h2 style="color:#26351f;margin:20px 0 10px;">Stripe test confirmation</h2><p><strong>Status:</strong> Confirmed paid in Stripe test mode<br><strong>Payment intent:</strong> ${esc(order.stripe_payment_intent_id)}<br><strong>Checkout session:</strong> ${esc(order.stripe_session_id)}<br><strong>Webhook event:</strong> ${esc(order.payment_provider_event_id)}</p>
  <p style="margin-top:22px;background:#eef2e8;border-left:4px solid #4a5e2a;padding:12px;"><strong>No fulfillment:</strong> Both linked records remain marked as sample/test data. The DTF supplier-submission safeguard remains active.</p>
  </td></tr><tr><td style="background:#26351f;padding:22px 24px;text-align:center;color:#f8f4ee;font-size:12px;line-height:1.7;"><a href="https://www.ilovehcapparel.net/" style="color:#ffd973;">ilovehcapparel.net</a><br><a href="mailto:support@ilovehcapparel.net" style="color:#ffd973;">support@ilovehcapparel.net</a></td></tr></table></td></tr></table></body></html>`;
  const text = `TEST ORDER — NO FULFILLMENT\n\nThis is controlled test data. No real charge occurred. Do not place a supplier order or fulfill any item.\n\nTest customer: HC Apparel controlled DTF test customer <${order.customer_email}>\nShipping: ${address}\nCustomer order: ${order.id}\nDTF reference: ${dtf.order_reference}\nArtwork: ${dtf.artwork_original_name}\nDimensions: ${dtf.width_inches} x ${dtf.height_inches} inches\nQuantity: ${dtf.quantity}\nOptions: ${options}\nUnit price: $${money(unitPrice)}\nQuantity discount: $${money(perUnitDiscount)} each / $${money(totalDiscount)} total (${discountPercent.toFixed(2)}%)\nDTF subtotal: $${money(transferSubtotal)}\nMerchandise subtotal: $${money(order.product_subtotal)}\nShipping: $${money(order.shipping_amount)}\nTax: $${money(order.sales_tax_amount)}\nTotal: $${money(order.total_amount)}\nStripe test payment: confirmed\nPayment intent: ${order.stripe_payment_intent_id}\nWebhook: ${order.payment_provider_event_id}\nOrder timestamp: ${created} Eastern\n\nSecure admin order: ${adminUrl}\n\nNo real charge occurred and no supplier fulfillment should be placed.`;
  return { html, text };
}

Deno.serve(async request => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const expectedSecret = Deno.env.get('DTF_TEST_NOTIFICATION_SECRET') || '';
  const suppliedSecret = request.headers.get('x-dtf-test-notification-secret') || '';
  if (!expectedSecret || suppliedSecret !== expectedSecret) return json({ error: 'Not authorized' }, 401);
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = getSupabaseServiceKey();
  const brevoKey = Deno.env.get('BREVO_API_KEY') || '';
  if (!supabaseUrl || !serviceKey || !brevoKey) return json({ error: 'Required service configuration is unavailable' }, 503);
  const service = createClient(supabaseUrl, serviceKey, { db: { schema: 'public' } });
  const { action = 'inspect' } = await request.json().catch(() => ({}));

  const [{ data: dtf }, { data: order }, { data: ledger }] = await Promise.all([
    service.from('dtf_transfer_orders').select('*').eq('id', DTF_ORDER_ID).eq('linked_customer_order_id', CUSTOMER_ORDER_ID).maybeSingle(),
    service.from('orders').select('*').eq('id', CUSTOMER_ORDER_ID).maybeSingle(),
    service.from('ops_email_delivery_ledger').select('*').eq('operation_key', OPERATION_KEY).maybeSingle(),
  ]);
  if (!dtf || !order) return json({ error: 'Existing linked DTF test order was not found' }, 404);
  if (dtf.is_sample !== true || dtf.stripe_mode !== 'test' || dtf.payment_status !== 'paid'
    || order.is_sample !== true || order.stripe_mode !== 'test' || order.payment_status !== 'paid'
    || order.customer_email?.toLowerCase() !== RECIPIENT || dtf.status !== 'draft'
    || dtf.supplier_order_number || dtf.supplier_submitted_at) {
    return json({ error: 'The linked records do not satisfy the isolated paid-test safeguards' }, 409);
  }

  let provider = await inspectBrevo(brevoKey, ledger?.provider_message_id);
  if (provider.providerMessageId && (ledger?.provider_message_id || provider.contentAudit.complete)) {
    const mapped = provider.deliveryStatus === 'delivered' ? 'delivered' : provider.deliveryStatus === 'accepted' ? 'accepted' : 'unknown';
    if (!ledger || ledger.provider_message_id !== provider.providerMessageId || ledger.delivery_status !== mapped) {
      await service.from('ops_email_delivery_ledger').upsert({
        operation_key: OPERATION_KEY, recipient: RECIPIENT, subject: SUBJECT, provider: 'brevo',
        provider_message_id: provider.providerMessageId, delivery_status: mapped,
        accepted_at: ledger?.accepted_at || provider.subjectMatches[0]?.date || null,
        delivered_at: provider.deliveryStatus === 'delivered' ? provider.events.find((event: Row) => eventKey(event.event) === 'delivered')?.date || null : null,
        last_error: ['blocked', 'bounced', 'deferred'].includes(provider.deliveryStatus) ? provider.events[0]?.reason || provider.deliveryStatus : null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'operation_key' });
    }
  }

  if (action === 'inspect') {
    return json({ sent: false, order_id: order.id, dtf_order_id: dtf.id, recipient: RECIPIENT, sender: SENDER, subject: SUBJECT, ledger, provider });
  }
  if (action !== 'send') return json({ error: 'Unsupported action' }, 400);
  if (provider.providerMessageId && provider.contentAudit.complete) return json({ sent: false, duplicate_prevented: true, reason: 'A complete matching Brevo message already exists', provider });
  if (!provider.suppression.checked) return json({ sent: false, blocked: true, reason: 'Brevo suppression status could not be verified', provider }, 503);
  if (provider.suppression.suppressed) return json({ sent: false, blocked: true, reason: 'Recipient is suppressed in Brevo; suppression was not removed', provider }, 409);
  if (ledger && ['sending', 'accepted', 'delivered'].includes(ledger.delivery_status)) {
    return json({ sent: false, duplicate_prevented: true, reason: `Ledger is already ${ledger.delivery_status}`, ledger, provider });
  }

  if (!ledger) {
    const { error: claimError } = await service.from('ops_email_delivery_ledger').insert({
      operation_key: OPERATION_KEY, recipient: RECIPIENT, subject: SUBJECT, provider: 'brevo', delivery_status: 'sending', updated_at: new Date().toISOString(),
    });
    if (claimError?.code === '23505') return json({ sent: false, duplicate_prevented: true, reason: 'Another sender already claimed this notification' }, 409);
    if (claimError) return json({ error: 'Unable to claim the notification ledger' }, 500);
  } else {
    const { data: claimed } = await service.from('ops_email_delivery_ledger').update({ delivery_status: 'sending', last_error: null, updated_at: new Date().toISOString() })
      .eq('operation_key', OPERATION_KEY).in('delivery_status', ['failed', 'unknown']).select('operation_key').maybeSingle();
    if (!claimed) return json({ sent: false, duplicate_prevented: true, reason: 'Notification retry was not claimable' }, 409);
  }

  const { data: signed, error: signedError } = await service.storage.from('dtf-artwork').createSignedUrl(dtf.artwork_storage_path, 60 * 60 * 24 * 7);
  if (signedError || !signed?.signedUrl) {
    await service.from('ops_email_delivery_ledger').update({ delivery_status: 'failed', last_error: 'Private artwork thumbnail could not be generated', updated_at: new Date().toISOString() }).eq('operation_key', OPERATION_KEY);
    return json({ error: 'Private artwork thumbnail could not be generated' }, 500);
  }
  const content = renderEmail(dtf, order, signed.signedUrl);
  const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': brevoKey, accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      sender: { email: SENDER, name: 'HC Apparel' }, to: [{ email: RECIPIENT, name: 'Heart Family Co' }],
      replyTo: { email: SENDER, name: 'HC Apparel Support' }, subject: SUBJECT,
      htmlContent: content.html, textContent: content.text,
      tags: ['dtf-test-order', 'no-fulfillment'], headers: { 'Idempotency-Key': OPERATION_KEY },
    }),
    signal: AbortSignal.timeout(20000),
  });
  const sendResult = await brevoResponse.json().catch(() => ({}));
  if (!brevoResponse.ok || !sendResult.messageId) {
    await service.from('ops_email_delivery_ledger').update({ delivery_status: 'failed', last_error: `Brevo rejected the message (${brevoResponse.status})`, updated_at: new Date().toISOString() }).eq('operation_key', OPERATION_KEY);
    return json({ error: 'Brevo rejected the test-order notification', provider_status: brevoResponse.status }, 502);
  }
  const acceptedAt = new Date().toISOString();
  await service.from('ops_email_delivery_ledger').update({ provider_message_id: sendResult.messageId, delivery_status: 'accepted', accepted_at: acceptedAt, last_error: null, updated_at: acceptedAt }).eq('operation_key', OPERATION_KEY);
  await service.from('stripe_webhook_events').update({ processing_status: 'processed', processed_at: acceptedAt, last_error: null })
    .eq('event_id', order.payment_provider_event_id).eq('order_id', order.id).eq('processing_status', 'processing');
  provider = await inspectBrevo(brevoKey, sendResult.messageId);
  return json({ sent: true, provider_accepted: true, provider_message_id: sendResult.messageId, accepted_at: acceptedAt, recipient: RECIPIENT, sender: SENDER, subject: SUBJECT, provider });
});
