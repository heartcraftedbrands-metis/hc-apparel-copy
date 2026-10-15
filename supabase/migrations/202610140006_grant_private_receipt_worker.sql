begin;

-- The existing private receipt table was originally granted only to signed-in
-- users. Server-side reconciliation uses the service role, which still needs
-- explicit table privileges even though it bypasses RLS.
grant select, insert, update on public.ops_receipt_files to service_role;

commit;
