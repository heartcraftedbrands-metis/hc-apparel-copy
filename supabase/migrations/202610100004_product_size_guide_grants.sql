begin;

-- RLS remains the authorization boundary for authenticated administrators.
-- Explicit relation privileges are also required before PostgreSQL evaluates
-- those policies. The service role is used only by authenticated maintenance.
grant select, insert, update, delete
  on table public.product_size_guides
  to authenticated, service_role;

grant select, insert, update, delete
  on table public.product_size_guide_sync_queue
  to authenticated, service_role;

commit;
