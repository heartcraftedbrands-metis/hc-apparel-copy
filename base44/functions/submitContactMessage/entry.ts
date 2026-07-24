import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cleanString = (value, maxLength) =>
  (typeof value === 'string' ? value : '')
    .trim()
    .replace(/[<>]/g, '')
    .slice(0, maxLength);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const name = cleanString(body.name, 150);
    const email = cleanString(body.email, 254).toLowerCase();
    const subject = cleanString(body.subject, 250);
    const message = cleanString(body.message, 5000);

    if (!name || !EMAIL_PATTERN.test(email) || !subject || !message) {
      return Response.json({ error: 'All contact fields are required.' }, { status: 400 });
    }

    const contactMessage = await base44.asServiceRole.entities.ContactMessage.create({
      name,
      email,
      subject,
      message,
      status: 'new',
    });

    return Response.json({ success: true, contact_message_id: contactMessage.id });
  } catch (error) {
    console.error('Contact message submission failed:', error);
    return Response.json({ error: 'Unable to submit contact message.' }, { status: 500 });
  }
});
