import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Triggered by the "New Quote Request Alert" entity automation on QuoteRequest create.
// Payload shape from entity automation:
// { event: { type, entity_name, entity_id }, data: <QuoteRequest record> }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Entity automations fire without a user session — use service role
    const isAuth = await base44.auth.isAuthenticated();
    let quote = null;

    const body = await req.json();

    // Support both direct invocation (admin testing) and automation payload
    const quoteId = body?.event?.entity_id || body?.quote_request_id || body?.id;
    const quoteData = body?.data || null;

    if (quoteData && quoteData.full_name) {
      quote = quoteData;
    } else if (quoteId) {
      quote = await base44.asServiceRole.entities.QuoteRequest.get(quoteId);
    }

    if (!quote) {
      return Response.json({ error: 'Quote request not found in payload' }, { status: 400 });
    }

    const name = quote.full_name || quote.customer_name || 'A customer';
    const email = quote.email || quote.customer_email || '(no email)';
    const productType = quote.product_type || 'not specified';
    const quantity = quote.quantity ? `${quote.quantity} units` : 'quantity not specified';
    const dateNeeded = quote.date_needed || 'not specified';
    const printMethod = quote.print_method || 'not specified';
    const notes = quote.project_notes || '';

    const subject = `New Quote Request from ${name}`;
    const body_html = `
<p><strong>New quote request submitted on HC Apparel.</strong></p>
<p><strong>Name:</strong> ${name}<br>
<strong>Email:</strong> ${email}<br>
<strong>Product Type:</strong> ${productType}<br>
<strong>Quantity:</strong> ${quantity}<br>
<strong>Print Method:</strong> ${printMethod}<br>
<strong>Date Needed:</strong> ${dateNeeded}
${notes ? `<br><strong>Notes:</strong> ${notes}` : ''}</p>
<p>Log in to the admin panel to review and respond.</p>
    `.trim();

    // Create an internal admin notification record for the inbox
    await base44.asServiceRole.entities.CustomerNotification.create({
      order_id: quote.id || quoteId || 'quote-' + Date.now(),
      order_number: `QR-${(quote.id || quoteId || '').slice(-6).toUpperCase()}`,
      customer_name: name,
      customer_email: email,
      notification_type: 'order_received',
      subject,
      customer_message: `New quote request: ${productType}, ${quantity}, ${printMethod}, needed by ${dateNeeded}.${notes ? ' Notes: ' + notes : ''}`,
      sent_status: 'draft',
      customer_visible: false,
      admin_note: `Auto-generated alert for new QuoteRequest submission from ${name} (${email}).`,
      auto_generated: true,
      trigger_event: 'quote_request:create',
    });

    return Response.json({
      success: true,
      message: `Alert recorded for quote request from ${name}`,
      quote_id: quote.id || quoteId,
    });
  } catch (error) {
    console.error('alertNewQuoteRequest error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});