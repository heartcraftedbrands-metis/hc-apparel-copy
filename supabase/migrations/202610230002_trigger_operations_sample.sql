begin;

-- Temporary, narrowly scoped verification RPC. It exposes no customer data and
-- is removed immediately after provider-event reconciliation is verified.
create or replace function public.operations_sample_delivery_status()
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce((
    select jsonb_build_object(
      'operation_key',operation_key,
      'status',status,
      'recipient_count',recipient_count,
      'provider_message_ids',provider_message_ids,
      'delivery_events',delivery_events,
      'accepted_at',accepted_at,
      'delivered_at',delivered_at,
      'last_error',last_error,
      'updated_at',updated_at
    )
    from public.operations_report_runs
    where operation_key='business-operations-sample-2026-10-23'
  ),jsonb_build_object('status','not_started'));
$$;
revoke all on function public.operations_sample_delivery_status() from public;
grant execute on function public.operations_sample_delivery_status() to anon,authenticated,service_role;

select public.invoke_business_operations_monitor();

commit;
