begin;
update public.operations_controlled_monitor_tests
set status='healthy',note='Controlled recovery used to verify one recovery notice and close the test incident.',updated_at=now()
where check_key='controlled-alert-delivery-test';
select public.invoke_business_operations_monitor();
commit;
