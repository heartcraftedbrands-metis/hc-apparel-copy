import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';
import { getSupabaseServiceKey } from '../_shared/supabaseCredentials.ts';
import {
  getStripeCredentials,
  type StripeMode,
} from '../_shared/stripeCredentials.ts';
import { orderNetMargin, stripePaymentDetails } from '../_shared/stripePaymentMethod.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

const htmlEscape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character] || character));

const money = (value: unknown) => Number(value || 0).toFixed(2);

async function sendDtfSandboxOwnerNotification(
  admin: ReturnType<typeof createClient>,
  supabaseUrl: string,
  order: Record<string, any>,
  event: Stripe.Event,
  session: Stripe.Checkout.Session,
) {
  const recipient = 'heartfamilyco@gmail.com';
  const subject = '[TEST ORDER — NO FULFILLMENT] DTF Prints order details';
  const { data: dtfRows, error: dtfError } = await admin.from('dtf_transfer_orders')
    .select('id,order_reference,width_inches,height_inches,quantity,production_options,artwork_storage_path,artwork_original_name,shipping_address,customer_total,supplier_shipping,is_sample,test_label,stripe_mode,payment_status,created_at')
    .eq('linked_customer_order_id', order.id);
  if (dtfError || !dtfRows || dtfRows.length !== 1) throw new Error('DTF notification requires exactly one linked transfer record');
  const dtf = dtfRows[0];
  if (!dtf.is_sample || dtf.stripe_mode !== 'test' || dtf.payment_status !== 'paid') {
    throw new Error('DTF notification is restricted to paid sandbox test orders');
  }

  const { data: existing } = await admin.from('dtf_test_order_email_ledger')
    .select('delivery_status,provider_message_id').eq('customer_order_id', order.id).maybeSingle();
  if (existing) return { status: existing.delivery_status, providerMessageId: existing.provider_message_id, duplicate: true };

  const { error: claimError } = await admin.from('dtf_test_order_email_ledger').insert({
    customer_order_id: order.id, dtf_order_id: dtf.id, stripe_event_id: event.id,
    recipient_email: recipient, subject, delivery_status: 'sending',
  });
  if (claimError?.code === '23505') return { status: 'duplicate_claim', duplicate: true };
  if (claimError) throw new Error('Unable to reserve the DTF test notification');

  const brevoKey = Deno.env.get('BREVO_API_KEY');
  if (!brevoKey) {
    await admin.from('dtf_test_order_email_ledger').update({ delivery_status: 'provider_rejected', provider_response: { error: 'provider_not_configured' }, updated_at: new Date().toISOString() }).eq('customer_order_id', order.id);
    return { status: 'provider_rejected', duplicate: false };
  }

  let artworkDataUri = '';
  const { data: artworkBlob } = await admin.storage.from('dtf-artwork').download(dtf.artwork_storage_path);
  if (artworkBlob && artworkBlob.type.startsWith('image/') && artworkBlob.size <= 4_000_000) {
    const bytes = new Uint8Array(await artworkBlob.arrayBuffer());
    let binary = '';
    for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    artworkDataUri = `data:${artworkBlob.type};base64,${btoa(binary)}`;
  }

  const orderNumber = String(order.id).slice(-8).toUpperCase();
  const options = dtf.production_options || {};
  const shipping = dtf.shipping_address || {};
  const tax = Number(order.sales_tax_amount || 0);
  const subtotal = Number(order.product_subtotal ?? dtf.customer_total ?? 0);
  const freight = Number(order.shipping_amount ?? order.shipping_charged_to_customer ?? dtf.supplier_shipping ?? 0);
  const total = Number(order.total_amount || 0);
  const timestamp = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', dateStyle: 'long', timeStyle: 'short' }).format(new Date());
  const adminLink = `https://www.ilovehcapparel.net/AdminDTFTransfers?order=${encodeURIComponent(dtf.id)}`;
  const thumbnail = artworkDataUri
    ? `<img src="${artworkDataUri}" alt="Private test artwork thumbnail" style="display:block;max-width:220px;max-height:220px;width:auto;height:auto;border-radius:12px;border:1px solid #d9c9a7;background:#fffdf5">`
    : `<div style="width:220px;min-height:120px;border-radius:12px;border:1px solid #d9c9a7;background:#f4efe4;display:flex;align-items:center;justify-content:center;text-align:center;color:#526258">Private artwork preview<br>${htmlEscape(dtf.artwork_original_name)}</div>`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4efe4;font-family:Arial,Helvetica,sans-serif;color:#263518"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#fffdf5;border-radius:18px;overflow:hidden;border:1px solid #d9c9a7"><tr><td style="background:#263518;color:#fff;padding:24px 28px"><div style="font-size:30px;font-weight:800">HC Apparel</div><div style="color:#ffd973;margin-top:4px">DTF Prints test-order notification</div></td></tr><tr><td style="padding:28px"><h1 style="font-size:24px;margin:0 0 8px">TEST ORDER — NO FULFILLMENT</h1><p style="margin:0 0 22px;color:#526258">Stripe confirmed this controlled sandbox payment. No real charge occurred and no supplier order should be placed.</p>${thumbnail}<p><strong>Artwork:</strong> ${htmlEscape(dtf.artwork_original_name)}<br><a href="${adminLink}" style="color:#526b2d;font-weight:700">Open the secure admin order</a></p><table role="presentation" width="100%" cellspacing="0" cellpadding="7" style="border-collapse:collapse;margin-top:16px"><tr><td><strong>Test customer</strong></td><td>${htmlEscape(order.customer_name)} (test data)</td></tr><tr><td><strong>Test customer email</strong></td><td>${htmlEscape(order.customer_email)}</td></tr><tr><td><strong>Customer order</strong></td><td>${htmlEscape(orderNumber)}</td></tr><tr><td><strong>DTF reference</strong></td><td>${htmlEscape(dtf.order_reference)}</td></tr><tr><td><strong>Specifications</strong></td><td>${htmlEscape(dtf.width_inches)} × ${htmlEscape(dtf.height_inches)} in · Qty ${htmlEscape(dtf.quantity)} · Pre-cut: ${options.precut ? 'Yes' : 'No'}</td></tr><tr><td><strong>Other options</strong></td><td>Order type: ${htmlEscape(options.mode || 'size')}</td></tr><tr><td><strong>Unit price</strong></td><td>$${money(subtotal / Number(dtf.quantity || 1))}</td></tr><tr><td><strong>Quantity discount</strong></td><td>${Number(dtf.quantity) >= 15 ? 'Approved quantity tier applied' : 'None'}</td></tr><tr><td><strong>Transfer subtotal</strong></td><td>$${money(subtotal)}</td></tr><tr><td><strong>Shipping</strong></td><td>$${money(freight)}</td></tr><tr><td><strong>Tax</strong></td><td>$${money(tax)}</td></tr><tr><td><strong>Total</strong></td><td><strong>$${money(total)}</strong></td></tr><tr><td><strong>Delivery</strong></td><td>Standard transfer fulfillment · ${htmlEscape(shipping.street)}, ${htmlEscape(shipping.city)}, ${htmlEscape(shipping.state)} ${htmlEscape(shipping.zip)}</td></tr><tr><td><strong>Payment</strong></td><td>Stripe-confirmed test payment · ${htmlEscape(String(session.payment_intent || ''))}</td></tr><tr><td><strong>Order timestamp</strong></td><td>${htmlEscape(timestamp)} America/New_York</td></tr></table><div style="margin-top:22px;padding:16px;border-radius:12px;background:#fff2c8;border-left:5px solid #d89a00"><strong>TEST DATA ONLY.</strong> Exclude this order from live sales, fulfillment, and supplier submission. No real charge occurred.</div></td></tr><tr><td style="background:#263518;color:#fff;padding:20px 28px;font-size:13px"><a href="https://www.ilovehcapparel.net" style="color:#ffd973">ilovehcapparel.net</a> · <a href="mailto:support@ilovehcapparel.net" style="color:#ffd973">support@ilovehcapparel.net</a><br>HC Apparel · 2281 Dunwoody Crossing, Atlanta, GA 30338</td></tr></table></td></tr></table></body></html>`;
  const text = `HC Apparel\n\nTEST ORDER — NO FULFILLMENT\nStripe confirmed this controlled sandbox payment. No real charge occurred and no supplier order should be placed.\n\nTest customer: ${order.customer_name} (test data) <${order.customer_email}>\nCustomer order: ${orderNumber}\nDTF reference: ${dtf.order_reference}\nArtwork: ${dtf.artwork_original_name}\nSecure admin order: ${adminLink}\nSpecifications: ${dtf.width_inches} x ${dtf.height_inches} in; quantity ${dtf.quantity}; pre-cut ${options.precut ? 'Yes' : 'No'}; type ${options.mode || 'size'}\nUnit price: $${money(subtotal / Number(dtf.quantity || 1))}\nQuantity discount: ${Number(dtf.quantity) >= 15 ? 'Approved quantity tier applied' : 'None'}\nSubtotal: $${money(subtotal)}\nShipping: $${money(freight)}\nTax: $${money(tax)}\nTotal: $${money(total)}\nShip to: ${shipping.street}, ${shipping.city}, ${shipping.state} ${shipping.zip}\nDelivery: Standard transfer fulfillment\nPayment: Stripe-confirmed test payment ${String(session.payment_intent || '')}\nTimestamp: ${timestamp} America/New_York\n\nTEST DATA ONLY. Exclude from live sales, fulfillment, and supplier submission.`;

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { accept: 'application/json', 'api-key': brevoKey, 'content-type': 'application/json' }, body: JSON.stringify({ sender: { name: 'HC Apparel Support', email: 'support@ilovehcapparel.net' }, to: [{ email: recipient, name: 'HC Apparel' }], subject, htmlContent: html, textContent: text, headers: { 'X-HC-Test-Order-Id': order.id } }), signal: AbortSignal.timeout(20000) });
    const provider = await response.json().catch(() => ({}));
    const providerMessageId = typeof provider?.messageId === 'string' ? provider.messageId : null;
    const status = response.ok ? 'provider_accepted' : 'provider_rejected';
    await admin.from('dtf_test_order_email_ledger').update({ delivery_status: status, provider_message_id: providerMessageId, provider_response: { http_status: response.status }, accepted_at: response.ok ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq('customer_order_id', order.id);
    return { status, providerMessageId, duplicate: false };
  } catch {
    await admin.from('dtf_test_order_email_ledger').update({ delivery_status: 'unknown', provider_response: { error: 'provider_outcome_unknown_no_automatic_retry' }, updated_at: new Date().toISOString() }).eq('customer_order_id', order.id);
    return { status: 'unknown', providerMessageId: null, duplicate: false };
  }
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return json({ error: 'Webhook is not configured' }, 503);
  }

  const rawBody = await request.text();
  let verified: { event: Stripe.Event; mode: StripeMode; stripe: Stripe } | null = null;
  for (const mode of ['test', 'live'] as const) {
    const credentials = getStripeCredentials(mode);
    if (!credentials.configured || !credentials.secretKey || !credentials.webhookSecret) continue;
    try {
      const stripe = new Stripe(credentials.secretKey);
      const event = await stripe.webhooks.constructEventAsync(
        rawBody,
        signature,
        credentials.webhookSecret,
        undefined,
        Stripe.createSubtleCryptoProvider(),
      );
      verified = { event, mode, stripe };
      break;
    } catch {
      // A shared endpoint may receive test and live webhooks. Try the other isolated secret.
    }
  }
  if (!verified) {
    return json({ error: 'Invalid webhook signature' }, 400);
  }
  const { event, mode: stripeMode, stripe } = verified;
  if (event.livemode !== (stripeMode === 'live')) {
    return json({ error: 'Webhook mode does not match its signing secret' }, 400);
  }

  if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
    return json({ received: true, processed: false });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  if (session.payment_status !== 'paid') {
    return json({ received: true, processed: false });
  }

  const orderId = session.metadata?.internal_order_id;
  const ownerUserId = session.metadata?.owner_user_id;
  const checkoutSource = session.metadata?.source;
  if (
    !['hc_apparel_customized_small_order', 'hc_apparel_digital_mockups', 'hc_apparel_mixed_storefront', 'hc_apparel_dtf_transfer'].includes(String(checkoutSource || ''))
    || session.metadata?.stripe_mode !== stripeMode
    || !orderId
    || (checkoutSource === 'hc_apparel_customized_small_order' && !ownerUserId)
  ) {
    return json({ error: 'Checkout metadata is invalid' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = getSupabaseServiceKey();
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Supabase is not configured' }, 503);

  const admin = createClient(supabaseUrl, serviceRoleKey, { db: { schema: 'public' } });
  const { error: eventInsertError } = await admin.from('stripe_webhook_events').insert({
    event_id: event.id,
    event_type: event.type,
    stripe_mode: stripeMode,
    order_id: orderId,
    processing_status: 'processing',
  });
  if (eventInsertError?.code === '23505') {
    const { data: existingEvent } = await admin.from('stripe_webhook_events')
      .select('processing_status,received_at,attempt_count')
      .eq('event_id', event.id)
      .maybeSingle();
    const receivedAt = existingEvent?.received_at ? new Date(existingEvent.received_at).getTime() : 0;
    if (existingEvent?.processing_status === 'processed' || (existingEvent?.processing_status === 'processing' && Date.now() - receivedAt < 300_000)) {
      return json({ received: true, processed: existingEvent.processing_status === 'processed', duplicate: true, order_id: orderId });
    }
    await admin.from('stripe_webhook_events').update({
      processing_status: 'processing',
      attempt_count: Number(existingEvent?.attempt_count || 1) + 1,
      received_at: new Date().toISOString(),
      last_error: null,
    }).eq('event_id', event.id);
  } else if (eventInsertError) {
    console.error('Stripe webhook event ledger unavailable', { code: eventInsertError.code });
    return json({ error: 'Unable to record payment event' }, 500);
  }
  const failEvent = async (message: string) => {
    await admin.from('stripe_webhook_events').update({
      processing_status: 'failed',
      last_error: message,
    }).eq('event_id', event.id);
  };

  if (checkoutSource === 'hc_apparel_digital_mockups' || checkoutSource === 'hc_apparel_mixed_storefront') {
    try {
      const finalize = await fetch(`${supabaseUrl}/functions/v1/digital-mockups`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          action: 'webhook_finalize',
          session_id: session.id,
          event_id: event.id,
          stripe_mode: stripeMode,
        }),
        signal: AbortSignal.timeout(20000),
      });
      const result = await finalize.json().catch(() => ({}));
      if (!finalize.ok || result?.paid !== true) {
        await failEvent(String(result?.error || 'Digital entitlement finalization failed'));
        return json({ error: 'Unable to finalize digital delivery' }, 502);
      }
      await admin.from('stripe_webhook_events').update({
        processing_status: 'processed', processed_at: new Date().toISOString(), last_error: null,
      }).eq('event_id', event.id);
      return json({ received: true, processed: true, duplicate: false, order_id: orderId, digital_delivery: true, email_status: result.email_status });
    } catch (error) {
      await failEvent(error instanceof Error ? error.message : 'Digital entitlement finalization failed');
      return json({ error: 'Unable to finalize digital delivery' }, 502);
    }
  }

  const { data: order, error: orderError } = await admin
    .from('orders')
    .select('id,owner_user_id,total_amount,product_subtotal,shipping_amount,shipping_charged_to_customer,sales_tax_amount,vendor_cost_estimate,actual_s_and_s_shipping,actual_vendor_shipping,actual_shipping_cost,estimated_s_and_s_shipping,estimated_vendor_shipping,printing_cost_estimate,other_vendor_fees,payment_status,checkout_source,stripe_mode,payment_processing_estimate,pricing_snapshot')
    .eq('id', orderId)
    .maybeSingle();
  if (orderError) {
    console.error('Stripe webhook order lookup failed', {
      code: orderError.code,
      message: orderError.message,
    });
    await failEvent('Order lookup failed');
    return json({ error: 'Unable to load customer order' }, 500);
  }
  if (!order) { await failEvent('Customer order not found'); return json({ error: 'Customer order not found' }, 404); }
  if (
    order.owner_user_id !== ownerUserId
    || !['customized_small_order','mixed_storefront_order','dtf_transfer_order'].includes(order.checkout_source)
    || (order.stripe_mode || 'test') !== stripeMode
  ) {
    await failEvent('Checkout session does not match the order');
    return json({ error: 'Checkout session does not match the order' }, 403);
  }
  if (session.currency !== 'usd' || session.amount_total !== Math.round(Number(order.total_amount) * 100)) {
    await failEvent('Checkout amount does not match the order');
    return json({ error: 'Checkout amount does not match the order' }, 409);
  }

  if (order.payment_status !== 'paid') {
    const paymentDetails = await stripePaymentDetails(stripe, session);
    const methods = order.pricing_snapshot?.payment_method_costs || {};
    const rate = methods[paymentDetails.type] || methods.card || {};
    const estimatedProcessingCost = Math.round((Number(order.total_amount) * Number(rate.percentage || 0) / 100 + Number(rate.fixed_fee || 0)) * 100) / 100;
    const appliedProcessingCost = paymentDetails.actualProcessingCost ?? estimatedProcessingCost;
    const { error: updateError } = await admin.from('orders').update({
      payment_status: 'paid',
      status: 'awaiting_fulfillment',
      payment_method: paymentDetails.label,
      payment_method_type: paymentDetails.type,
      estimated_processing_cost: estimatedProcessingCost,
      actual_processing_cost: paymentDetails.actualProcessingCost,
      processing_rate_used: { method: paymentDetails.type, label: paymentDetails.label, percentage: Number(rate.percentage || 0), fixed_fee: Number(rate.fixed_fee || 0) },
      final_net_margin: orderNetMargin(order, appliedProcessingCost),
      amount_paid: order.total_amount,
      balance_due: 0,
      payment_date: new Date().toISOString(),
      payment_confirmed_at: new Date().toISOString(),
      payment_confirmation_source: 'stripe_webhook',
      payment_provider_event_id: event.id,
      stripe_session_id: session.id,
      stripe_payment_intent_id: String(session.payment_intent || ''),
      stripe_mode: stripeMode,
    }).eq('id', order.id).neq('payment_status', 'paid');
    if (updateError) { await failEvent('Order payment update failed'); return json({ error: 'Unable to confirm payment' }, 500); }
    if (order.checkout_source === 'dtf_transfer_order') {
      const { data: dtfReconciliation, error: dtfUpdateError } = await admin.rpc('reconcile_paid_dtf_order', {
        p_customer_order_id: order.id,
        p_test_mode: stripeMode === 'test',
      });
      if (dtfUpdateError) { await failEvent('DTF payment state update failed'); return json({ error: 'Unable to confirm transfer payment' }, 500); }
      if (Number(dtfReconciliation?.linked_count || 0) !== 1) { await failEvent('DTF payment link count invalid'); return json({ error: 'Unable to confirm transfer payment' }, 409); }
    }
    // The existing database trigger prepares protected vendor and notification drafts.
    if (order.checkout_source === 'dtf_transfer_order' && stripeMode === 'test') {
      await sendDtfSandboxOwnerNotification(admin, supabaseUrl, order, event, session);
    }
  }

  const { data: paymentSettings } = await admin
    .from('payment_settings')
    .select('id')
    .order('updated_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (paymentSettings?.id) {
    await admin.from('payment_settings').update({
      last_stripe_event_id: event.id,
      last_stripe_event_type: event.type,
      last_stripe_event_mode: stripeMode,
      last_stripe_event_at: new Date().toISOString(),
    }).eq('id', paymentSettings.id);
  }

  await admin.from('stripe_webhook_events').update({
    processing_status: 'processed',
    processed_at: new Date().toISOString(),
    last_error: null,
  }).eq('event_id', event.id);

  return json({ received: true, processed: true, duplicate: false, order_id: order.id, stripe_mode: stripeMode });
});
