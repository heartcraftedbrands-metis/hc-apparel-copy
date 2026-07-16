import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@15.0.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  let endpointReached = false;
  let debugInfo = {
    endpoint_reached: false,
    order_loaded: false,
    order_total_dollars: 0,
    order_total_cents: 0,
    order_item_count: 0,
    success_url: '',
    cancel_url: ''
  };

  try {
    endpointReached = true;

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);

    const {
      orderId,
      successUrl,
      cancelUrl
    } = await req.json();

    debugInfo.success_url = successUrl || '';
    debugInfo.cancel_url = cancelUrl || '';

    // Validate required fields
    if (!orderId || typeof orderId !== 'string') {
      return Response.json({
        success: false,
        error: true,
        message: 'Missing or invalid orderId',
        debug: { ...debugInfo, endpoint_reached: true }
      }, { status: 400 });
    }

    // Load order from database
    let order;
    try {
      order = await base44.asServiceRole.entities.Order.get(orderId);
    } catch (err) {
      return Response.json({
        success: false,
        error: true,
        message: `Order not found: ${orderId}`,
        debug: { ...debugInfo, endpoint_reached: true }
      }, { status: 400 });
    }

    if (!order) {
      return Response.json({
        success: false,
        error: true,
        message: 'Order not found',
        debug: { ...debugInfo, endpoint_reached: true }
      }, { status: 400 });
    }

    debugInfo.order_loaded = true;

    // Validate order has items
    if (!Array.isArray(order.order_items) || order.order_items.length === 0) {
      return Response.json({
        success: false,
        error: true,
        message: 'Order has no items',
        debug: { ...debugInfo, endpoint_reached: true }
      }, { status: 400 });
    }

    debugInfo.order_item_count = order.order_items.length;

    // Validate order total
    const orderTotal = Number(order.total_amount);
    if (isNaN(orderTotal) || orderTotal <= 0) {
      return Response.json({
        success: false,
        error: true,
        message: 'Invalid order total',
        debug: { ...debugInfo, endpoint_reached: true }
      }, { status: 400 });
    }

    // Validate URLs are HTTPS
    const isValidUrl = (url) => {
      try {
        const u = new URL(url);
        return u.protocol === 'https:';
      } catch {
        return false;
      }
    };

    if (!isValidUrl(successUrl)) {
      return Response.json({
        success: false,
        error: true,
        message: 'Invalid success URL',
        debug: { ...debugInfo, endpoint_reached: true }
      }, { status: 400 });
    }

    if (!isValidUrl(cancelUrl)) {
      return Response.json({
        success: false,
        error: true,
        message: 'Invalid cancel URL',
        debug: { ...debugInfo, endpoint_reached: true }
      }, { status: 400 });
    }

    // Validate each order item
    for (let i = 0; i < order.order_items.length; i++) {
      const item = order.order_items[i];

      const itemName = item.product_name;
      if (!itemName || typeof itemName !== 'string') {
        return Response.json({
          success: false,
          error: true,
          message: `Item ${i + 1} missing product name`,
          debug: { ...debugInfo, endpoint_reached: true }
        }, { status: 400 });
      }

      const itemQty = Number(item.quantity);
      if (isNaN(itemQty) || itemQty <= 0) {
        return Response.json({
          success: false,
          error: true,
          message: `Item ${i + 1} has invalid quantity`,
          debug: { ...debugInfo, endpoint_reached: true }
        }, { status: 400 });
      }

      const itemPrice = Number(item.price);
      if (isNaN(itemPrice) || itemPrice <= 0) {
        return Response.json({
          success: false,
          error: true,
          message: `Item ${i + 1} has invalid price`,
          debug: { ...debugInfo, endpoint_reached: true }
        }, { status: 400 });
      }
    }

    // Format line items for Stripe from order items (convert dollars to cents as integer)
    const lineItems = order.order_items.map(item => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: item.product_name || 'HC Apparel Item'
        },
        unit_amount: Math.round(Number(item.price) * 100) // cents as integer
      },
      quantity: Number(item.quantity)
    }));

    // Convert order total to cents
    const totalCents = Math.round(orderTotal * 100);
    debugInfo.order_total_dollars = orderTotal;
    debugInfo.order_total_cents = totalCents;

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      customer_email: order.customer_email,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        source: 'hc_apparel_checkout',
        customer_email: order.customer_email,
        internal_order_id: orderId,
        order_number: order.order_number || orderId
      },
      billing_address_collection: 'auto'
    });

    // Update order with Stripe session ID
    await base44.asServiceRole.entities.Order.update(orderId, {
      stripe_session_id: session.id
    });

    return Response.json({
      success: true,
      error: false,
      status: 'session_created',
      sessionId: session.id,
      sessionUrl: session.url,
      checkout_url: session.url,
      debug: {
        ...debugInfo,
        endpoint_reached: true,
        session_created: true
      }
    }, { status: 200 });

  } catch (error) {
    console.error('Stripe session error:', {
      message: error.message,
      type: error.type,
      code: error.code,
      param: error.param,
      statusCode: error.statusCode
    });

    let stripeErrorMessage = error.message || 'Unknown Stripe error';
    let stripeErrorType = error.type || null;
    let stripeErrorCode = error.code || null;
    let stripeErrorParam = error.param || null;
    let userMessage = 'Failed to create checkout session';

    // Extract exact Stripe error details
    if (error.raw?.message) {
      stripeErrorMessage = error.raw.message;
    }

    // Map specific Stripe errors to user-friendly messages
    if (stripeErrorType === 'StripeInvalidRequestError') {
      userMessage = 'Invalid payment request. Please check your order and try again.';
    } else if (stripeErrorType === 'StripeAuthenticationError') {
      userMessage = 'Payment service authentication failed. Please contact support.';
    } else if (stripeErrorType === 'StripeRateLimitError') {
      userMessage = 'Too many requests. Please wait a moment and try again.';
    } else if (stripeErrorType === 'StripeConnectionError') {
      userMessage = 'Connection to payment service failed. Please try again.';
    }

    // Build request payload preview for debug
    const payloadPreview = {
      mode: 'payment',
      currency: 'usd',
      line_items_count: order?.order_items?.length || 0,
      first_item_name: order?.order_items?.[0]?.product_name || 'none',
      first_item_unit_amount: order?.order_items?.[0] ? Math.round(Number(order.order_items[0].price) * 100) : 0,
      first_item_quantity: order?.order_items?.[0]?.quantity || 0,
      customer_email: order?.customer_email ? 'present' : 'missing',
      success_url: successUrl ? 'present' : 'missing',
      cancel_url: cancelUrl ? 'present' : 'missing'
    };

    return Response.json({
      success: false,
      error: true,
      message: userMessage,
      stripe_error_message: stripeErrorMessage,
      stripe_error_type: stripeErrorType,
      stripe_error_code: stripeErrorCode,
      stripe_error_param: stripeErrorParam,
      debug: {
        ...debugInfo,
        endpoint_reached: endpointReached,
        session_created: false,
        payload_preview: payloadPreview
      }
    }, { status: 400 });
  }
});