begin;

alter table public.operations_monitor_checks add column if not exists is_test boolean not null default false;
alter table public.operations_alerts
  add column if not exists is_test boolean not null default false,
  add column if not exists recovery_notified_at timestamptz,
  add column if not exists notification_message_ids jsonb not null default '{}'::jsonb;

create table if not exists public.operations_controlled_monitor_tests (
  check_key text primary key,
  severity text not null check(severity in('warning','critical')),
  status text not null check(status in('healthy','degraded','failed')),
  note text not null,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.operations_controlled_monitor_tests enable row level security;
revoke all on public.operations_controlled_monitor_tests from public,anon,authenticated;
grant all on public.operations_controlled_monitor_tests to service_role;

insert into public.operations_controlled_monitor_tests(check_key,severity,status,note,enabled,updated_at)
values('controlled-alert-delivery-test','critical','failed','Controlled failure used to verify alert deduplication and delivery. No website, checkout, order, or supplier workflow is affected.',true,now())
on conflict(check_key) do update set severity=excluded.severity,status=excluded.status,note=excluded.note,enabled=true,updated_at=now();

create or replace function public.operations_sample_delivery_status()
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'report',coalesce((select jsonb_build_object('operation_key',operation_key,'status',status,'recipient_count',recipient_count,'provider_message_ids',provider_message_ids,'delivery_events',delivery_events,'accepted_at',accepted_at,'delivered_at',delivered_at,'last_error',last_error,'updated_at',updated_at) from public.operations_report_runs where operation_key='business-operations-sample-2026-10-23'),jsonb_build_object('status','not_started')),
    'controlled_alert',coalesce((select jsonb_build_object('status',status,'is_test',is_test,'notified_at',notified_at,'recovery_notified_at',recovery_notified_at,'message_ids',notification_message_ids,'updated_at',updated_at) from public.operations_alerts where dedupe_key='controlled-alert-delivery-test:active'),jsonb_build_object('status','not_started')),
    'alert_delivery',(select coalesce(jsonb_agg(jsonb_build_object('operation_key',operation_key,'recipient',recipient,'delivery_status',delivery_status,'provider_message_id',provider_message_id,'accepted_at',accepted_at,'delivered_at',delivered_at,'last_error',last_error)), '[]'::jsonb) from public.ops_email_delivery_ledger where operation_key like 'ops-alert:%')
  );
$$;

select public.invoke_business_operations_monitor();

commit;
