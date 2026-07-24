import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const DEFAULT_SETTINGS = {
  payment_mode: 'manual',
  stripe_connected: false,
  test_mode_enabled: false,
  invoice_instructions: '',
  payment_notes_customer: '',
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const records = await base44.asServiceRole.entities.PaymentSettings.list('-created_date', 1);
    const settings = records[0];

    if (!settings) {
      return Response.json(DEFAULT_SETTINGS);
    }

    return Response.json({
      payment_mode: settings.payment_mode || DEFAULT_SETTINGS.payment_mode,
      stripe_connected: Boolean(settings.stripe_connected),
      test_mode_enabled: Boolean(settings.test_mode_enabled),
      invoice_instructions: settings.invoice_instructions || '',
      payment_notes_customer: settings.payment_notes_customer || '',
    });
  } catch (error) {
    console.error('Unable to load public payment settings:', error);
    return Response.json(DEFAULT_SETTINGS);
  }
});
