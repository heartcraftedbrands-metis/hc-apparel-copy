begin;

create or replace function public.invoke_yho_auth_recovery(p_action text default 'send_recovery')
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token text;
  v_request_id bigint;
begin
  if p_action not in ('send_recovery','run_controlled_test') then
    raise exception 'Unsupported recovery action';
  end if;
  select monitor_token into v_token from public.operations_runtime_config where id=true;
  if nullif(v_token,'') is null then raise exception 'Operations token is not configured'; end if;
  select net.http_post(
    url := 'https://bxsdajpldrdesnvjiubt.supabase.co/functions/v1/operations-intelligence',
    headers := jsonb_build_object('content-type','application/json','x-operations-token',v_token),
    body := jsonb_build_object('action',p_action,'requested_at',now()),
    timeout_milliseconds := 30000
  ) into v_request_id;
  return v_request_id;
end $$;

revoke all on function public.invoke_yho_auth_recovery(text) from public, anon, authenticated;
grant execute on function public.invoke_yho_auth_recovery(text) to service_role;

commit;
