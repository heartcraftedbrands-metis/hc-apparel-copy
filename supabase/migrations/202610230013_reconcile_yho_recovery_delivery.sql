-- Reuse the existing read-only operations monitor to reconcile Brevo's event
-- stream after the authorized recovery message was accepted.
select public.invoke_business_operations_monitor();
