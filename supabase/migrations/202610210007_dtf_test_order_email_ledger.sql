begin;

create table if not exists public.dtf_test_order_email_ledger (
  id uuid primary key default gen_random_uuid(),
  customer_order_id text not null references public.orders(id) on delete restrict,
  dtf_order_id uuid not null references public.dtf_transfer_orders(id) on delete restrict,
  stripe_event_id text not null,
  recipient_email text not null check (lower(recipient_email) = 'heartfamilyco@gmail.com'),
  subject text not null,
  delivery_status text not null default 'sending'
    check (delivery_status in ('sending','provider_accepted','provider_rejected','unknown')),
  provider_message_id text,
  provider_response jsonb not null default '{}'::jsonb,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_order_id),
  unique (stripe_event_id)
);

alter table public.dtf_test_order_email_ledger enable row level security;

drop policy if exists "dtf test email admins read" on public.dtf_test_order_email_ledger;
create policy "dtf test email admins read"
  on public.dtf_test_order_email_ledger for select to authenticated
  using (public.is_admin());

revoke all on table public.dtf_test_order_email_ledger from public, anon, authenticated;
grant select on table public.dtf_test_order_email_ledger to authenticated;
grant all on table public.dtf_test_order_email_ledger to service_role;

comment on table public.dtf_test_order_email_ledger is
  'Idempotency and provider-acceptance audit for owner-only DTF Stripe sandbox order notifications.';

commit;
