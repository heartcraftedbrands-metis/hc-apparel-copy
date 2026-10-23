begin;

update public.operations_controlled_monitor_tests
set enabled=false,updated_at=now()
where check_key='controlled-alert-delivery-test';

revoke all on function public.operations_sample_delivery_status() from public,anon,authenticated,service_role;
drop function public.operations_sample_delivery_status();

commit;
