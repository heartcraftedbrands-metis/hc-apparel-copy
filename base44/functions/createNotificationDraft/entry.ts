import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const NOTIFICATION_TEMPLATES = {
  order_received: {
    subject: 'Your HC Apparel order has been received',
    message:
      'We received your order and will review it shortly. You can track your order progress anytime.',
  },
  payment_confirmed: {
    subject: 'Payment confirmed for your HC Apparel order',
    message: 'Your payment has been confirmed. We are preparing your order for fulfillment.',
  },
  preparing_order: {
    subject: 'Your HC Apparel order is being prepared',
    message: 'Your order is being prepared for fulfillment. We will notify you when it ships.',
  },
  sent_to_production: {
    subject: 'Your HC Apparel order has been sent to production',
    message:
      'Your order has been sent to production. Our vendor will begin processing it immediately.',
  },
  in_production: {
    subject: 'Your HC Apparel order is in production',
    message:
      'Your order is currently being produced. We will notify you when it is ready to ship.',
  },
  shipped: {
    subject: 'Your HC Apparel order has shipped',
    message:
      'Your order has shipped! Tracking information is available on your order tracking page.',
  },
  delivered: {
    subject: 'Your HC Apparel order was delivered',
    message:
      'Your order has been delivered. Thank you for shopping with HC Apparel! Please let us know if you have any questions.',
  },
  completed: {
    subject: 'Your HC Apparel order is complete',
    message:
      'Your order has been completed. Thank you for your business! We hope you love your order.',
  },
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin')
      return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { order_id, notification_type, custom_subject, custom_message, admin_note } =
      await req.json();

    if (!order_id || !notification_type) {
      return Response.json(
        { error: 'Missing order_id or notification_type' },
        { status: 400 }
      );
    }

    // Fetch order
    const order = await base44.entities.Order.get(order_id);
    if (!order) return Response.json({ error: 'Order not found' }, { status: 404 });

    // Get template or use custom
    const template = NOTIFICATION_TEMPLATES[notification_type] || {};
    const subject = custom_subject || template.subject || 'HC Apparel Order Update';
    const customer_message = custom_message || template.message || '';

    // Create notification draft
    const notification = await base44.entities.CustomerNotification.create({
      order_id: order.id,
      order_number: order.id,
      customer_name: order.customer_name,
      customer_email: order.customer_email,
      notification_type,
      subject,
      customer_message,
      related_status: notification_type,
      sent_status: 'draft',
      customer_visible: true,
      admin_note: admin_note || '',
      auto_generated: !custom_subject && !custom_message,
      trigger_event: `status_change:${notification_type}`,
    });

    return Response.json({
      success: true,
      notification_id: notification.id,
      message: 'Notification draft created',
    });
  } catch (error) {
    console.error('Error creating notification:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});