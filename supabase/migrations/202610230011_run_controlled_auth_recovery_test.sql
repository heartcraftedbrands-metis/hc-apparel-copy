-- Run once after the recovery functions are deployed. This uses the dedicated
-- controlled test account and never touches YHo's password or recovery link.
select public.invoke_yho_auth_recovery('run_controlled_test');
