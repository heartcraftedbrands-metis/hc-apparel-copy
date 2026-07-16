import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Check if settings exist
    const existing = await base44.asServiceRole.entities.PaymentFeeSettings.list();
    
    if (existing.length > 0) {
      return Response.json({ settings: existing[0], created: false });
    }

    // Create default settings
    const defaults = {
      stripe_fee_buffer_percent: 3.5,
      stripe_fixed_fee_buffer: 0.5,
      paypal_fee_buffer_percent: 4.0,
      paypal_fixed_fee_buffer: 0.5,
      additional_profit_buffer_percent: 0,
      price_rounding_mode: 'nearest_99',
      last_updated: new Date().toISOString()
    };

    const created = await base44.asServiceRole.entities.PaymentFeeSettings.create(defaults);
    return Response.json({ settings: created, created: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});