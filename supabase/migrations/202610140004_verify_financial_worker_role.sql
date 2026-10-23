begin;
-- Edge Functions can receive either a legacy service-role JWT or a newer
-- server-key representation. PostgREST validates the caller's signature before
-- this invoker function returns the signed database role.
create or replace function public.ops_verified_calling_role()
returns text
language sql
stable
security invoker
set search_path = public
as $$
  select auth.role();
$$;
revoke all on function public.ops_verified_calling_role() from public, anon;
grant execute on function public.ops_verified_calling_role() to authenticated, service_role;
commit;
