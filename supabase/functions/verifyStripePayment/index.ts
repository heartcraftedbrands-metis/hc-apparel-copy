import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';
import {
  getSupabasePublishableKey,
  getSupabaseServiceKey,
} from '../_shared/supabaseCredentials.ts';
import {
  getStripeCredentials,
  modeFromCheckoutSessionId,
} from '../_shared/stripeCredentials.ts';
import { orderNetMargin, stripePaymentDetails } from '../_shared/stripePaymentMethod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

const htmlEscape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character] || character));

const money = (value: unknown) => Number(value || 0).toFixed(2);

async function ensureDtfSandboxOwnerNotification(
  admin: ReturnType<typeof createClient>,
  order: Record<string, any>,
  session: Stripe.Checkout.Session,
) {
  const recipient = 'heartfamilyco@gmail.com';
  const subject = '[TEST ORDER — NO FULFILLMENT] DTF Prints order details';
  const { data: dtfRows, error: dtfError } = await admin.from('dtf_transfer_orders')
    .select('id,order_reference,width_inches,height_inches,quantity,production_options,artwork_storage_path,artwork_original_name,shipping_address,customer_total,customer_shipping_charge,is_sample,stripe_mode,payment_status')
    .eq('linked_customer_order_id', order.id);
  if (dtfError || !dtfRows || dtfRows.length !== 1) throw new Error('DTF notification requires exactly one linked transfer record');
  const dtf = dtfRows[0];
  if (!dtf.is_sample || dtf.stripe_mode !== 'test' || dtf.payment_status !== 'paid') throw new Error('DTF notification is restricted to paid sandbox test orders');

  const { data: existing } = await admin.from('dtf_test_order_email_ledger')
    .select('delivery_status,provider_message_id').eq('customer_order_id', order.id).maybeSingle();
  if (existing) return { status: existing.delivery_status, providerMessageId: existing.provider_message_id, duplicate: true };
  const { error: claimError } = await admin.from('dtf_test_order_email_ledger').insert({
    customer_order_id: order.id, dtf_order_id: dtf.id, stripe_event_id: session.id,
    recipient_email: recipient, subject, delivery_status: 'sending',
  });
  if (claimError?.code === '23505') return { status: 'duplicate_claim', providerMessageId: null, duplicate: true };
  if (claimError) throw new Error('Unable to reserve the DTF test notification');

  const brevoKey = Deno.env.get('BREVO_API_KEY');
  if (!brevoKey) {
    await admin.from('dtf_test_order_email_ledger').update({ delivery_status: 'provider_rejected', provider_response: { error: 'provider_not_configured' }, updated_at: new Date().toISOString() }).eq('customer_order_id', order.id);
    return { status: 'provider_rejected', providerMessageId: null, duplicate: false };
  }

  let artworkDataUri = '';
  const { data: artworkBlob } = await admin.storage.from('dtf-artwork').download(dtf.artwork_storage_path);
  if (artworkBlob && artworkBlob.type.startsWith('image/') && artworkBlob.size <= 4_000_000) {
    const bytes = new Uint8Array(await artworkBlob.arrayBuffer());
    let binary = '';
    for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    artworkDataUri = `data:${artworkBlob.type};base64,${btoa(binary)}`;
  }

  const options = dtf.production_options || {};
  const shipping = dtf.shipping_address || {};
  const transferSubtotal = Number(dtf.customer_total || 0);
  const merchandiseSubtotal = Number(order.product_subtotal || transferSubtotal);
  const freight = Number(order.shipping_amount ?? order.shipping_charged_to_customer ?? dtf.customer_shipping_charge ?? 0);
  const tax = Number(order.sales_tax_amount || 0);
  const total = Number(order.total_amount || 0);
  const orderNumber = String(order.id).slice(-8).toUpperCase();
  const timestamp = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', dateStyle: 'long', timeStyle: 'short' }).format(new Date());
  const adminLink = `https://www.ilovehcapparel.net/AdminDTFTransfers?order=${encodeURIComponent(dtf.id)}`;
  const thumbnail = artworkDataUri
    ? `<img src="${artworkDataUri}" alt="Private test artwork thumbnail" style="display:block;max-width:220px;max-height:220px;width:auto;height:auto;border-radius:12px;border:1px solid #d9c9a7;background:#fffdf5">`
    : `<div style="width:220px;min-height:120px;border-radius:12px;border:1px solid #d9c9a7;background:#f4efe4;display:flex;align-items:center;justify-content:center;text-align:center;color:#526258">Private artwork preview<br>${htmlEscape(dtf.artwork_original_name)}</div>`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4efe4;font-family:Arial,Helvetica,sans-serif;color:#263518"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#fffdf5;border-radius:18px;overflow:hidden;border:1px solid #d9c9a7"><tr><td style="background:#263518;color:#fff;padding:24px 28px"><div style="font-size:30px;font-weight:800">HC Apparel</div><div style="color:#ffd973;margin-top:4px">DTF Prints test-order notification</div></td></tr><tr><td style="padding:28px"><h1 style="font-size:24px;margin:0 0 8px">TEST ORDER — NO FULFILLMENT</h1><p style="margin:0 0 22px;color:#526258">Stripe confirmed this controlled sandbox payment. No real charge occurred and no supplier order should be placed.</p>${thumbnail}<p><strong>Artwork:</strong> ${htmlEscape(dtf.artwork_original_name)}<br><a href="${adminLink}" style="color:#526b2d;font-weight:700">Open the secure admin order</a></p><table role="presentation" width="100%" cellspacing="0" cellpadding="7" style="border-collapse:collapse;margin-top:16px"><tr><td><strong>Test customer</strong></td><td>${htmlEscape(order.customer_name)} (test data)</td></tr><tr><td><strong>Test customer email</strong></td><td>${htmlEscape(order.customer_email)}</td></tr><tr><td><strong>Customer order</strong></td><td>${htmlEscape(orderNumber)}</td></tr><tr><td><strong>DTF reference</strong></td><td>${htmlEscape(dtf.order_reference)}</td></tr><tr><td><strong>Specifications</strong></td><td>${htmlEscape(dtf.width_inches)} × ${htmlEscape(dtf.height_inches)} in · Qty ${htmlEscape(dtf.quantity)} · Pre-cut: ${options.precut ? 'Yes' : 'No'}</td></tr><tr><td><strong>Other options</strong></td><td>Order type: ${htmlEscape(options.mode || 'size')}</td></tr><tr><td><strong>Unit price</strong></td><td>$${money(transferSubtotal / Number(dtf.quantity || 1))}</td></tr><tr><td><strong>Quantity discount</strong></td><td>${Number(dtf.quantity) >= 15 ? 'Approved quantity tier applied' : 'None'}</td></tr><tr><td><strong>Transfer subtotal</strong></td><td>$${money(transferSubtotal)}</td></tr><tr><td><strong>All merchandise</strong></td><td>$${money(merchandiseSubtotal)}</td></tr><tr><td><strong>Shipping</strong></td><td>$${money(freight)}</td></tr><tr><td><strong>Tax</strong></td><td>$${money(tax)}</td></tr><tr><td><strong>Checkout total</strong></td><td><strong>$${money(total)}</strong></td></tr><tr><td><strong>Delivery</strong></td><td>Standard transfer fulfillment · ${htmlEscape(shipping.street)}, ${htmlEscape(shipping.city)}, ${htmlEscape(shipping.state)} ${htmlEscape(shipping.zip)}</td></tr><tr><td><strong>Payment</strong></td><td>Stripe-confirmed test payment · ${htmlEscape(String(session.payment_intent || ''))}</td></tr><tr><td><strong>Order timestamp</strong></td><td>${htmlEscape(timestamp)} America/New_York</td></tr></table><div style="margin-top:22px;padding:16px;border-radius:12px;background:#fff2c8;border-left:5px solid #d89a00"><strong>TEST DATA ONLY.</strong> Exclude this order from live sales, fulfillment, and supplier submission. No real charge occurred.</div></td></tr><tr><td style="background:#263518;color:#fff;padding:20px 28px;font-size:13px"><a href="https://www.ilovehcapparel.net" style="color:#ffd973">ilovehcapparel.net</a> · <a href="mailto:support@ilovehcapparel.net" style="color:#ffd973">support@ilovehcapparel.net</a><br>HC Apparel · 2281 Dunwoody Crossing, Atlanta, GA 30338</td></tr></table></td></tr></table></body></html>`;
  const text = `HC Apparel\n\nTEST ORDER — NO FULFILLMENT\nStripe confirmed this controlled sandbox payment. No real charge occurred and no supplier order should be placed.\n\nTest customer: ${order.customer_name} (test data) <${order.customer_email}>\nCustomer order: ${orderNumber}\nDTF reference: ${dtf.order_reference}\nArtwork: ${dtf.artwork_original_name}\nSecure admin order: ${adminLink}\nSpecifications: ${dtf.width_inches} x ${dtf.height_inches} in; quantity ${dtf.quantity}; pre-cut ${options.precut ? 'Yes' : 'No'}; type ${options.mode || 'size'}\nUnit price: $${money(transferSubtotal / Number(dtf.quantity || 1))}\nQuantity discount: ${Number(dtf.quantity) >= 15 ? 'Approved quantity tier applied' : 'None'}\nTransfer subtotal: $${money(transferSubtotal)}\nAll merchandise: $${money(merchandiseSubtotal)}\nShipping: $${money(freight)}\nTax: $${money(tax)}\nCheckout total: $${money(total)}\nShip to: ${shipping.street}, ${shipping.city}, ${shipping.state} ${shipping.zip}\nDelivery: Standard transfer fulfillment\nPayment: Stripe-confirmed test payment ${String(session.payment_intent || '')}\nTimestamp: ${timestamp} America/New_York\n\nTEST DATA ONLY. Exclude from live sales, fulfillment, and supplier submission.`;

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
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const publishableKey = getSupabasePublishableKey();
    const serviceRoleKey = getSupabaseServiceKey();
    if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
      return json({ error: 'Payment service is not configured' }, 503);
    }

    const authorization = request.headers.get('Authorization') || '';
    const userClient = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: 'Authentication required' }, 401);

    const { sessionId } = await request.json();
    if (!sessionId) return json({ error: 'Stripe session ID is required' }, 400);

    const stripeMode = modeFromCheckoutSessionId(String(sessionId));
    if (!stripeMode) return json({ error: 'Stripe session ID is invalid' }, 400);
    const stripeCredentials = getStripeCredentials(stripeMode);
    if (!stripeCredentials.configured || !stripeCredentials.secretKey) {
      return json({ error: `Stripe ${stripeMode} mode is not configured` }, 503);
    }

    const stripe = new Stripe(stripeCredentials.secretKey);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const orderId = session.metadata?.internal_order_id;
    if (!orderId || session.metadata?.owner_user_id !== user.id) {
      return json({ error: 'Payment session does not belong to this customer' }, 403);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, { db: { schema: 'public' } });
    const { data: order, error: orderError } = await admin
      .from('orders')
      .select('id,owner_user_id,customer_name,customer_email,total_amount,product_subtotal,shipping_amount,shipping_charged_to_customer,sales_tax_amount,vendor_cost_estimate,actual_s_and_s_shipping,actual_vendor_shipping,actual_shipping_cost,estimated_s_and_s_shipping,estimated_vendor_shipping,printing_cost_estimate,other_vendor_fees,payment_status,stripe_mode,payment_processing_estimate,pricing_snapshot,checkout_source')
      .eq('id', orderId)
      .maybeSingle();
    if (orderError) {
      console.error('Stripe payment order lookup failed', {
        code: orderError.code,
        message: orderError.message,
      });
      return json({ error: 'Unable to load customer order' }, 500);
    }
    if (!order || order.owner_user_id !== user.id) {
      return json({ error: 'Customer order not found' }, 404);
    }
    if ((order.stripe_mode || 'test') !== stripeMode || session.metadata?.stripe_mode !== stripeMode) {
      return json({ error: 'Stripe session mode does not match the order' }, 409);
    }

    if (session.payment_status !== 'paid') {
      return json({ paid: false, payment_status: session.payment_status, order_id: order.id });
    }
    if (session.currency !== 'usd' || session.amount_total !== Math.round(Number(order.total_amount) * 100)) {
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
        payment_confirmation_source: 'stripe_verification',
        payment_provider_event_id: session.id,
        stripe_session_id: session.id,
        stripe_payment_intent_id: String(session.payment_intent || ''),
        stripe_mode: stripeMode,
      }).eq('id', order.id).neq('payment_status', 'paid');
      if (updateError) throw updateError;
      // The database trigger now creates the private vendor draft and notification drafts.
    }

    let dtfNotification = null;
    if (order.checkout_source === 'dtf_transfer_order') {
      if (stripeMode === 'test' && session.metadata?.test_data !== 'true') {
        return json({ error: 'The Stripe test payment is not marked as isolated test data' }, 409);
      }
      const { data: dtfReconciliation, error: dtfUpdateError } = await admin.rpc('reconcile_paid_dtf_order', {
        p_customer_order_id: order.id,
        p_test_mode: stripeMode === 'test',
      });
      if (dtfUpdateError) throw dtfUpdateError;
      if (Number(dtfReconciliation?.linked_count || 0) !== 1) {
        return json({ error: 'The paid customer order must link to exactly one DTF record' }, 409);
      }
      if (stripeMode === 'test') dtfNotification = await ensureDtfSandboxOwnerNotification(admin, order, session);
    }

    let digitalDelivery = null;
    if (order.checkout_source === 'mixed_storefront_order' && session.metadata?.source === 'hc_apparel_mixed_storefront') {
      const finalized = await fetch(`${supabaseUrl}/functions/v1/digital-mockups`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'webhook_finalize', session_id: session.id, event_id: session.id, stripe_mode: stripeMode }),
      });
      digitalDelivery = await finalized.json().catch(() => ({}));
      if (!finalized.ok) return json({ error: digitalDelivery?.error || 'Payment was confirmed, but digital delivery could not be prepared.' }, 500);
    }

    return json({
      paid: true,
      order_id: order.id,
      amount: order.total_amount,
      stripe_mode: stripeMode,
      vendor_draft_prepared_by_database: true,
      live_ss_submission_enabled: false,
      zerotouch_live_submission_enabled: false,
      digital_delivery: digitalDelivery,
      dtf_test_notification: dtfNotification,
    });
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : (typeof error === 'object' && error && 'message' in error ? String(error.message) : 'Unable to verify payment');
    console.error('Stripe payment verification failed', { message });
    return json({ error: 'Unable to verify payment' }, 500);
  }
});
