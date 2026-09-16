-- The marketing Edge Function writes consented subscribers with the service role.
-- Existing newsletter_subscribers grants predate this integration.
grant select, insert, update on public.newsletter_subscribers to service_role;
