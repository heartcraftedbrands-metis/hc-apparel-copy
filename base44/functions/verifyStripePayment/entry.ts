import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@15.0.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const base44 = createClientFromRequest(req);
    const { sessionId } = await req.json();

    if (!sessionId) {
      return Response.json({ error: 'Missing sessionId' }, { status: 400 });
    }

    // Retrieve session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (!session) {
      return Response.json({ error: 'Session not found' }, { status: 404 });
    }

    const orderId = session.metadata?.internal_order_id;
    if (!orderId) {
      return Response.json({ error: 'Order ID not found in session' }, { status: 400 });
    }

    // Check if payment was successful
    if (session.payment_status === 'paid') {
      // Get order and update
      const order = await base44.asServiceRole.entities.Order.get(orderId);
      if (order && order.payment_status !== 'paid') {
        // Mark order as paid
         await base44.asServiceRole.entities.Order.update(orderId, {
           payment_status: 'paid',
           payment_method: 'Stripe',
           amount_paid: order.total_amount,
           balance_due: 0,
           payment_date: new Date().toISOString(),
           fulfillment_status: 'awaiting_fulfillment',
           stripe_session_id: sessionId,
           stripe_payment_intent_id: session.payment_intent
         });

        return Response.json({
          status: 'success',
          paid: true,
          order_id: orderId,
          amount: order.total_amount
        });
      }

      return Response.json({
        status: 'success',
        paid: true,
        order_id: orderId,
        amount: order?.total_amount
      });
    }

    return Response.json({
      status: 'success',
      paid: false,
      payment_status: session.payment_status
    });
  } catch (error) {
    console.error('Payment verification error:', error);
    return Response.json(
      { error: error.message || 'Failed to verify payment' },
      { status: 500 }
    );
  }
});