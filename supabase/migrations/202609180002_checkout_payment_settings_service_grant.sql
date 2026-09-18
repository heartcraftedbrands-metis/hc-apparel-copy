-- The Stripe Edge Function reads only the selected payment mode from this
-- admin-owned table. The service role bypasses RLS but still needs SELECT.
grant select on table public.payment_settings to service_role;
