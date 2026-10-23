begin;

create table if not exists public.ops_auth_recovery_attempts (
  operation_key text primary key,
  user_id uuid not null references auth.users(id) on delete restrict,
  email text not null,
  account_state jsonb not null default '{}'::jsonb,
  provider_message_id text,
  delivery_status text not null default 'sending'
    check (delivery_status in ('sending','accepted','delivered','failed','unknown')),
  requested_at timestamptz not null default now(),
  delivered_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

create table if not exists public.ops_auth_recovery_test_runs (
  id uuid primary key default gen_random_uuid(),
  test_email text not null,
  status text not null check (status in ('running','passed','failed')),
  evidence jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  last_error text
);

alter table public.ops_auth_recovery_attempts enable row level security;
alter table public.ops_auth_recovery_test_runs enable row level security;
drop policy if exists ops_auth_recovery_attempts_admin_read on public.ops_auth_recovery_attempts;
create policy ops_auth_recovery_attempts_admin_read on public.ops_auth_recovery_attempts
  for select to authenticated using (public.is_admin());
drop policy if exists ops_auth_recovery_test_runs_admin_read on public.ops_auth_recovery_test_runs;
create policy ops_auth_recovery_test_runs_admin_read on public.ops_auth_recovery_test_runs
  for select to authenticated using (public.is_admin());
revoke all on public.ops_auth_recovery_attempts, public.ops_auth_recovery_test_runs from anon, authenticated;
grant select on public.ops_auth_recovery_attempts, public.ops_auth_recovery_test_runs to authenticated;
grant all on public.ops_auth_recovery_attempts, public.ops_auth_recovery_test_runs to service_role;

create or replace function public.ops_auth_account_diagnostic(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text := lower(trim(p_email));
  v_count integer;
  v_result jsonb;
begin
  select count(*) into v_count from auth.users where lower(email) = v_email;
  if v_count <> 1 then
    return jsonb_build_object('match_count', v_count, 'usable', false, 'reason', case when v_count=0 then 'missing_auth_account' else 'ambiguous_auth_accounts' end);
  end if;

  select jsonb_build_object(
    'match_count', 1,
    'user_id', u.id,
    'email', u.email,
    'email_confirmed', u.email_confirmed_at is not null,
    'email_confirmed_at', u.email_confirmed_at,
    'last_sign_in_at', u.last_sign_in_at,
    'banned', u.banned_until is not null and u.banned_until > now(),
    'has_password_credential', coalesce(length(u.encrypted_password),0) > 0,
    'providers', coalesce((select jsonb_agg(distinct i.provider) from auth.identities i where i.user_id=u.id),'[]'::jsonb),
    'profile_exists', p.id is not null,
    'profile_role', p.role,
    'hc_membership_role', m.access_role,
    'usable', u.email_confirmed_at is not null
      and coalesce(length(u.encrypted_password),0) > 0
      and p.role='operations_manager'
      and m.access_role='operations_manager'
  ) into v_result
  from auth.users u
  left join public.profiles p on p.id=u.id
  left join public.ops_business_memberships m on m.user_id=u.id and m.business_id='hc-apparel'
  where lower(u.email)=v_email;
  return v_result;
end $$;
revoke all on function public.ops_auth_account_diagnostic(text) from public, anon, authenticated;
grant execute on function public.ops_auth_account_diagnostic(text) to service_role;

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
    raise exception 'Unsupported recovery operation';
  end if;
  select monitor_token into v_token from public.operations_runtime_config where id=true;
  if nullif(v_token,'') is null then raise exception 'Operations token is not configured'; end if;
  select net.http_post(
    url := 'https://bxsdajpldrdesnvjiubt.supabase.co/functions/v1/operations-onboarding',
    headers := jsonb_build_object('content-type','application/json','x-operations-token',v_token),
    body := jsonb_build_object('action',p_action,'requested_at',now()),
    timeout_milliseconds := 25000
  ) into v_request_id;
  return v_request_id;
end $$;
revoke all on function public.invoke_yho_auth_recovery(text) from public, anon, authenticated;
grant execute on function public.invoke_yho_auth_recovery(text) to service_role;

commit;
