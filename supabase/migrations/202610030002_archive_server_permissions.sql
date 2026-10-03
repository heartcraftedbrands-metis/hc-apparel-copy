begin;

-- Explicit server-role grants keep archive contents unavailable to ordinary
-- browser sessions while allowing trusted reconciliation and audit jobs.
grant select, insert, update, delete on public.test_data_archives to service_role;
grant select, insert, update, delete on public.test_archive_files to service_role;
grant select, insert on public.test_data_purge_log to service_role;
grant select, insert, update, delete on public.stripe_webhook_events to service_role;
grant execute on function public.archive_confirmed_test_order(text,text,text,text) to service_role;
grant execute on function public.purge_expired_test_archives() to service_role;

create table if not exists public.test_archive_cleanup_status (
  id boolean primary key default true check (id is true),
  job_name text not null,
  schedule text not null,
  enabled boolean not null,
  verified_at timestamptz not null default now(),
  backup_retention_notice text not null
);
insert into public.test_archive_cleanup_status(
  id, job_name, schedule, enabled, verified_at, backup_retention_notice
) values (
  true,
  'purge-expired-hc-test-archives',
  'Daily at 04:17 UTC',
  exists (select 1 from cron.job where jobname = 'purge-expired-hc-test-archives' and active is true),
  now(),
  'Purging removes eligible application-database rows and exclusively test-owned files. Supabase backups and external payment-provider records follow their separate retention policies.'
)
on conflict (id) do update set
  job_name = excluded.job_name,
  schedule = excluded.schedule,
  enabled = excluded.enabled,
  verified_at = excluded.verified_at,
  backup_retention_notice = excluded.backup_retention_notice;

alter table public.test_archive_cleanup_status enable row level security;
drop policy if exists admin_read_test_archive_cleanup_status on public.test_archive_cleanup_status;
create policy admin_read_test_archive_cleanup_status on public.test_archive_cleanup_status
  for select to authenticated using (public.is_admin());
revoke all on public.test_archive_cleanup_status from public, anon, authenticated;
grant select on public.test_archive_cleanup_status to authenticated, service_role;

commit;
