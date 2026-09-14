-- Stripe Edge Functions need only order lookup and payment-confirmation updates.
-- Database triggers prepare private drafts; this does not grant catalog access or
-- enable any live vendor, ZeroTouch, or email action.

grant usage on schema public to service_role;
grant select, update on table public.orders to service_role;
