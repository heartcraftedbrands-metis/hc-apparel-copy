-- One authorized, idempotent recovery email. The operation key in the Edge
-- Function prevents this migration or a network retry from sending twice.
select public.invoke_yho_auth_recovery('send_recovery');
