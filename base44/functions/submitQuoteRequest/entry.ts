import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PRODUCT_TYPES = new Set([
  't_shirts', 'hoodies', 'sweatshirts', 'tank_tops',
  'sportswear', 'youth_apparel', 'bulk_order', 'other',
]);
const CONTACT_METHODS = new Set(['email', 'phone', 'text']);
const GARMENT_KNOWLEDGE = new Set([
  'picked_from_shop', 'need_help_choosing', 'have_own_garment',
]);
const PRINT_COLORS = new Set(['1_color', '2_colors', 'full_color', 'not_sure']);
const PRINT_METHODS = new Set(['dtf', 'screen_print', 'vinyl', 'embroidery', 'not_sure']);
const ARTWORK_STATUSES = new Set([
  'print_ready', 'have_logo_need_help', 'only_idea', 'need_design_help',
]);
const PRINT_PLACEMENTS = new Set(['Front', 'Back', 'Left Chest', 'Sleeve', 'Other']);

const cleanString = (value, maxLength = 1000) =>
  (typeof value === 'string' ? value : '')
    .trim()
    .replace(/[<>]/g, '')
    .slice(0, maxLength);

const allowedValue = (value, allowed, fallback) =>
  allowed.has(value) ? value : fallback;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const fullName = cleanString(body.full_name, 150);
    const email = cleanString(body.email, 254).toLowerCase();

    if (!fullName || !EMAIL_PATTERN.test(email)) {
      return Response.json({ error: 'A valid name and email are required.' }, { status: 400 });
    }

    const quantity = Number(body.quantity);
    const printPlacement = Array.isArray(body.print_placement)
      ? body.print_placement.filter((value) => PRINT_PLACEMENTS.has(value)).slice(0, 5)
      : [];

    const quote = await base44.asServiceRole.entities.QuoteRequest.create({
      full_name: fullName,
      email,
      phone: cleanString(body.phone, 40),
      business_name: cleanString(body.business_name, 150),
      preferred_contact: allowedValue(body.preferred_contact, CONTACT_METHODS, 'email'),
      product_type: allowedValue(body.product_type, PRODUCT_TYPES, 'other'),
      garment_knowledge: allowedValue(
        body.garment_knowledge,
        GARMENT_KNOWLEDGE,
        'need_help_choosing'
      ),
      preferred_garment_style: cleanString(body.preferred_garment_style, 250),
      garment_colors: cleanString(body.garment_colors, 250),
      sizes_needed: cleanString(body.sizes_needed, 250),
      ...(Number.isFinite(quantity) && quantity > 0 ? { quantity: Math.floor(quantity) } : {}),
      print_placement: printPlacement,
      print_colors: allowedValue(body.print_colors, PRINT_COLORS, 'not_sure'),
      print_method: allowedValue(body.print_method, PRINT_METHODS, 'not_sure'),
      artwork_status: allowedValue(body.artwork_status, ARTWORK_STATUSES, 'only_idea'),
      artwork_file_url: cleanString(body.artwork_file_url, 2000),
      artwork_link: cleanString(body.artwork_link, 2000),
      project_notes: cleanString(body.project_notes, 5000),
      date_needed: /^\d{4}-\d{2}-\d{2}$/.test(body.date_needed || '') ? body.date_needed : '',
      status: 'new',
    });

    return Response.json({ success: true, quote_request_id: quote.id });
  } catch (error) {
    console.error('Quote request submission failed:', error);
    return Response.json({ error: 'Unable to submit quote request.' }, { status: 500 });
  }
});
