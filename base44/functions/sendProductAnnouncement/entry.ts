import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { subject, message, product_url } = await req.json();

    if (!subject || !message) {
      return Response.json({ error: 'subject and message are required' }, { status: 400 });
    }

    const subscribers = await base44.asServiceRole.entities.NewsletterSubscriber.filter({ is_active: true });

    if (subscribers.length === 0) {
      return Response.json({ sent: 0, message: 'No active subscribers.' });
    }

    let sent = 0;
    for (const sub of subscribers) {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: sub.email,
        from_name: 'HC Apparel',
        subject,
        body: `${message}${product_url ? `\n\nShop now: ${product_url}` : ''}\n\n— The HC Apparel Team\n\nwww.ilovehcapparel.net`,
      });
      sent++;
    }

    return Response.json({ sent, message: `Announcement sent to ${sent} subscribers.` });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});