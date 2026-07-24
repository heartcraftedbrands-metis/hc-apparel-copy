import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { email } = await req.json();
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

    if (!normalizedEmail || normalizedEmail.length > 254 || !EMAIL_PATTERN.test(normalizedEmail)) {
      return Response.json({ error: 'A valid email address is required.' }, { status: 400 });
    }

    const existing = await base44.asServiceRole.entities.NewsletterSubscriber.filter(
      { email: normalizedEmail },
      '-created_date',
      1
    );

    if (existing.length > 0) {
      if (!existing[0].is_active) {
        await base44.asServiceRole.entities.NewsletterSubscriber.update(existing[0].id, {
          is_active: true,
        });
      }

      return Response.json({ success: true, already_subscribed: true });
    }

    await base44.asServiceRole.entities.NewsletterSubscriber.create({
      email: normalizedEmail,
      is_active: true,
    });

    try {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: normalizedEmail,
        subject: 'Welcome to HC Apparel!',
        body: `Hi there!\n\nThank you for subscribing to the HC Apparel newsletter. You'll be the first to know about new products, exclusive deals, and more!\n\nVisit our store: https://www.ilovehcapparel.net\n\n? The HC Apparel Team`,
      });
    } catch (emailError) {
      console.error('Newsletter welcome email failed:', emailError);
    }

    return Response.json({ success: true, already_subscribed: false });
  } catch (error) {
    console.error('Newsletter subscription failed:', error);
    return Response.json({ error: 'Unable to subscribe right now.' }, { status: 500 });
  }
});
