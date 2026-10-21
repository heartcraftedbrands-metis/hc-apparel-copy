begin;

grant select on table public.dtf_transfer_orders to service_role;

comment on table public.dtf_transfer_orders is
  'Private DTF order records. Direct service-role reads support Stripe reconciliation and owner-only test notifications; customer access remains restricted by RLS and column grants.';

commit;
