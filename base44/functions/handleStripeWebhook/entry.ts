import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@15.0.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    // Get raw body for signature verification
    const body = await req.text();
    const signature = req.headers.get('stripe-signature');

    if (!signature || !webhookSecret) {
      // Webhook secret not configured; skip signature verification (dev only)
      console.warn('Webhook signature verification skipped - no secret configured');
    } else {
      // Verify signature
      try {
        await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
      } catch (error) {
        console.error('Webhook signature verification failed:', error.message);
        return Response.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    const event = JSON.parse(body);
    const base44 = createClientFromRequest(req);

    console.log(`[Stripe Webhook] Event type: ${event.type}`);

    // Handle checkout.session.completed
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const orderId = session.metadata?.internal_order_id;

      if (orderId) {
        console.log(`[Stripe Webhook] Processing payment for order: ${orderId}`);

        try {
          const order = await base44.asServiceRole.entities.Order.get(orderId);
          if (order) {
            // Update order with payment info
            await base44.asServiceRole.entities.Order.update(orderId, {
              payment_status: 'paid',
              amount_paid: order.total_amount,
              balance_due: 0,
              fulfillment_status: 'awaiting_fulfillment',
              stripe_session_id: session.id,
              stripe_payment_intent_id: session.payment_intent,
              payment_date: new Date().toISOString()
            });

            // Send payment received email
            try {
              await base44.integrations.Core.SendEmail({
                to: order.customer_email,
                subject: `Payment Received - HC Apparel Order #${order.id.slice(-8)}`,
                body: `Hi ${order.customer_name},\n\nWe received your payment for order #${order.id.slice(-8)}.\n\nOrder Total: $${order.total_amount.toFixed(2)}\n\nYour order is now being prepared for fulfillment.\n\nTrack your order here:\nhttps://ilovehcapparel.net/TrackOrder\n\nThank you,\nHC Apparel`
              });
            } catch (err) {
              console.error('Failed to send payment received email:', err.message);
            }

            console.log(`[Stripe Webhook] Order ${orderId} marked as paid`);
          }
        } catch (err) {
          console.error(`[Stripe Webhook] Error updating order ${orderId}:`, err.message);
        }
      }
    }

    // Handle payment_intent.payment_failed
    if (event.type === 'payment_intent.payment_failed') {
      const paymentIntent = event.data.object;
      const orderId = paymentIntent.metadata?.internal_order_id;

      if (orderId) {
        console.log(`[Stripe Webhook] Payment failed for order: ${orderId}`);
        // Optionally update order status or send notification
      }
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});