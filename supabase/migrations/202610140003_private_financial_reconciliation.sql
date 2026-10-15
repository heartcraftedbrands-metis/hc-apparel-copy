begin;

-- Private Stripe/operations ledger used by Heart Command Center and the mobile
-- companion. These tables are deliberately separate from storefront orders and
-- can only be read by finance-authorized staff or the server-side service role.

create table if not exists public.ops_financial_transactions (
  id text primary key,
  provider text not null check (provider in ('stripe')),
  provider_transaction_id text not null,
  provider_account_id text,
  business_id text not null references public.ops_businesses(id),
  transaction_kind text not null check (transaction_kind in (
    'customer_payment','processor_fee','refund','payout','card_expense','card_refund'
  )),
  direction text not null check (direction in ('inflow','outflow')),
  amount_cents bigint not null check (amount_cents >= 0),
  currency text not null default 'USD',
  occurred_at timestamptz not null,
  merchant_name text,
  merchant_category text,
  merchant_city text,
  merchant_state text,
  merchant_country text,
  source_status text,
  source_type text,
  source_data jsonb not null default '{}'::jsonb,
  source_hash text not null,
  review_status text not null default 'unreviewed' check (review_status in (
    'unreviewed','review_needed','confirmed','excluded'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_transaction_id, transaction_kind)
);

create index if not exists ops_financial_transactions_time_idx
  on public.ops_financial_transactions(business_id, occurred_at desc);
create index if not exists ops_financial_transactions_review_idx
  on public.ops_financial_transactions(business_id, review_status, occurred_at desc);

create table if not exists public.ops_reconciliation_matches (
  id uuid primary key default gen_random_uuid(),
  financial_transaction_id text not null references public.ops_financial_transactions(id) on delete cascade,
  shared_record_id text not null references public.ops_shared_records(id) on delete cascade,
  relationship text not null check (relationship in (
    'customer_payment','processor_fee','blank_garments','transfers_printing','postage','packaging','other_cost'
  )),
  match_status text not null default 'review_needed' check (match_status in (
    'auto_confirmed','review_needed','confirmed','rejected'
  )),
  confidence numeric(4,3) not null default 0 check (confidence between 0 and 1),
  evidence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  review_notes text,
  unique (financial_transaction_id, shared_record_id, relationship)
);

create index if not exists ops_reconciliation_matches_record_idx
  on public.ops_reconciliation_matches(shared_record_id, match_status, relationship);

create table if not exists public.ops_financial_sync_state (
  source text primary key,
  business_id text not null references public.ops_businesses(id),
  status text not null default 'not_started' check (status in ('not_started','running','synced','partial','failed')),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_provider_created_at timestamptz,
  last_error text,
  capability_status jsonb not null default '{}'::jsonb,
  records_seen bigint not null default 0,
  records_upserted bigint not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.ops_financial_sync_state(source, business_id)
values ('stripe', 'hc-apparel')
on conflict (source) do nothing;

create table if not exists public.ops_onboarding_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  recipient_email text not null,
  app_build_id text not null,
  installation_url text not null,
  idempotency_key text not null unique,
  status text not null default 'pending' check (status in ('pending','accepted','delivered','failed','cancelled')),
  provider_message_id text,
  requested_at timestamptz not null default now(),
  accepted_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  failure_message text,
  created_by uuid references auth.users(id),
  unique (user_id, app_build_id)
);

create or replace function public.ops_touch_financial_transaction()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists ops_financial_transaction_touch on public.ops_financial_transactions;
create trigger ops_financial_transaction_touch before update on public.ops_financial_transactions
for each row execute function public.ops_touch_financial_transaction();

alter table public.ops_financial_transactions enable row level security;
alter table public.ops_reconciliation_matches enable row level security;
alter table public.ops_financial_sync_state enable row level security;
alter table public.ops_onboarding_deliveries enable row level security;

drop policy if exists ops_financial_transactions_read on public.ops_financial_transactions;
create policy ops_financial_transactions_read on public.ops_financial_transactions
for select to authenticated using (public.is_admin() or public.ops_has_permission(business_id, 'finances'));

drop policy if exists ops_financial_transactions_write on public.ops_financial_transactions;
create policy ops_financial_transactions_write on public.ops_financial_transactions
for all to authenticated using (public.is_admin() or public.ops_has_permission(business_id, 'finances'))
with check (public.is_admin() or public.ops_has_permission(business_id, 'finances'));

drop policy if exists ops_reconciliation_matches_read on public.ops_reconciliation_matches;
create policy ops_reconciliation_matches_read on public.ops_reconciliation_matches
for select to authenticated using (
  exists (
    select 1 from public.ops_shared_records record
    where record.id = shared_record_id
      and (public.is_admin() or public.ops_has_permission(record.business_id, 'finances'))
  )
);

drop policy if exists ops_reconciliation_matches_write on public.ops_reconciliation_matches;
create policy ops_reconciliation_matches_write on public.ops_reconciliation_matches
for all to authenticated using (
  exists (
    select 1 from public.ops_shared_records record
    where record.id = shared_record_id
      and (public.is_admin() or public.ops_has_permission(record.business_id, 'finances'))
  )
) with check (
  exists (
    select 1 from public.ops_shared_records record
    where record.id = shared_record_id
      and (public.is_admin() or public.ops_has_permission(record.business_id, 'finances'))
  )
);

drop policy if exists ops_financial_sync_state_read on public.ops_financial_sync_state;
create policy ops_financial_sync_state_read on public.ops_financial_sync_state
for select to authenticated using (public.is_admin() or public.ops_has_permission(business_id, 'finances'));

drop policy if exists ops_onboarding_deliveries_read on public.ops_onboarding_deliveries;
create policy ops_onboarding_deliveries_read on public.ops_onboarding_deliveries
for select to authenticated using (
  user_id = auth.uid()
  or public.is_admin()
);

-- The existing HC Apparel administrator must be able to inspect and reconcile
-- the private operations area even before the two named individual mobile
-- accounts are safely resolved. This does not create or merge any account.
drop policy if exists ops_businesses_read on public.ops_businesses;
create policy ops_businesses_read on public.ops_businesses for select to authenticated
using (public.is_admin() or public.ops_has_permission(id, 'view'));
drop policy if exists ops_vehicles_access on public.ops_vehicles;
create policy ops_vehicles_access on public.ops_vehicles for all to authenticated
using (public.is_admin() or business_id is null or public.ops_has_permission(business_id, 'mileage'))
with check (public.is_admin() or business_id is null or public.ops_has_permission(business_id, 'mileage'));
drop policy if exists ops_trips_read on public.ops_mileage_trips;
create policy ops_trips_read on public.ops_mileage_trips for select to authenticated
using (public.is_admin() or driver_user_id = auth.uid() or public.ops_has_permission(business_id, 'mileage'));
drop policy if exists ops_segments_access on public.ops_mileage_segments;
create policy ops_segments_access on public.ops_mileage_segments for all to authenticated
using (public.is_admin() or exists (select 1 from public.ops_mileage_trips trip where trip.id = ops_mileage_segments.trip_id and (trip.driver_user_id = auth.uid() or public.ops_has_permission(trip.business_id, 'mileage'))))
with check (public.is_admin() or exists (select 1 from public.ops_mileage_trips trip where trip.id = ops_mileage_segments.trip_id and (trip.driver_user_id = auth.uid() or public.ops_has_permission(trip.business_id, 'mileage'))));
drop policy if exists ops_trip_audit_read on public.ops_mileage_trip_audit;
create policy ops_trip_audit_read on public.ops_mileage_trip_audit for select to authenticated
using (public.is_admin() or exists (select 1 from public.ops_mileage_trips trip where trip.id = ops_mileage_trip_audit.trip_id and (trip.driver_user_id = auth.uid() or public.ops_has_permission(trip.business_id, 'mileage'))));
drop policy if exists ops_shared_records_read on public.ops_shared_records;
create policy ops_shared_records_read on public.ops_shared_records for select to authenticated
using (public.is_admin() or public.ops_has_permission(business_id, 'finances'));
drop policy if exists ops_shared_records_update on public.ops_shared_records;
create policy ops_shared_records_update on public.ops_shared_records for update to authenticated
using (public.is_admin() or public.ops_has_permission(business_id, 'finances'))
with check (public.is_admin() or public.ops_has_permission(business_id, 'finances'));
drop policy if exists ops_invoice_state_read on public.ops_invoice_number_state;
create policy ops_invoice_state_read on public.ops_invoice_number_state for select to authenticated
using (public.is_admin() or public.ops_has_permission(business_id, 'finances'));
drop policy if exists ops_invoice_registry_read on public.ops_invoice_number_registry;
create policy ops_invoice_registry_read on public.ops_invoice_number_registry for select to authenticated
using (public.is_admin() or public.ops_has_permission(business_id, 'finances'));
drop policy if exists ops_action_queue_read on public.ops_action_queue;
create policy ops_action_queue_read on public.ops_action_queue for select to authenticated
using (public.is_admin() or requested_by = auth.uid() or public.ops_has_permission(business_id, 'finances'));
drop policy if exists ops_receipt_files_access on public.ops_receipt_files;
create policy ops_receipt_files_access on public.ops_receipt_files for all to authenticated
using (public.is_admin() or public.ops_has_permission(business_id, 'finances'))
with check (public.is_admin() or (uploaded_by = auth.uid() and public.ops_has_permission(business_id, 'finances')));

revoke all on public.ops_financial_transactions, public.ops_reconciliation_matches,
  public.ops_financial_sync_state, public.ops_onboarding_deliveries from anon;
grant select, insert, update on public.ops_financial_transactions,
  public.ops_reconciliation_matches, public.ops_financial_sync_state,
  public.ops_onboarding_deliveries to service_role;
grant select on public.ops_financial_transactions, public.ops_reconciliation_matches,
  public.ops_financial_sync_state, public.ops_onboarding_deliveries to authenticated;
grant insert, update on public.ops_financial_transactions, public.ops_reconciliation_matches
  to authenticated;

commit;
