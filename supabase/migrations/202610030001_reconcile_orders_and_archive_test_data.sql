begin;

-- Payment reconciliation provenance and durable test-data retention metadata.
alter table public.orders
  add column if not exists checkout_attempt_key text,
  add column if not exists record_environment text not null default 'production',
  add column if not exists archived_at timestamptz,
  add column if not exists purge_after timestamptz,
  add column if not exists archive_reason text,
  add column if not exists archive_provenance text,
  add column if not exists test_review_required boolean not null default false,
  add column if not exists payment_confirmation_source text,
  add column if not exists payment_confirmed_at timestamptz,
  add column if not exists payment_provider_event_id text;

alter table public.orders drop constraint if exists orders_record_environment_check;
alter table public.orders add constraint orders_record_environment_check
  check (record_environment in ('production', 'test', 'qa', 'sandbox', 'unknown'));

create unique index if not exists orders_owner_checkout_attempt_unique
  on public.orders(owner_user_id, checkout_attempt_key)
  where checkout_attempt_key is not null;
create index if not exists orders_archive_due_idx
  on public.orders(purge_after) where archived_at is not null;

alter table public.vendor_order_drafts
  add column if not exists archived_at timestamptz,
  add column if not exists purge_after timestamptz,
  add column if not exists archive_reason text;
alter table public.vendor_orders
  add column if not exists archived_at timestamptz,
  add column if not exists purge_after timestamptz,
  add column if not exists archive_reason text;

create table if not exists public.test_data_archives (
  id uuid primary key default gen_random_uuid(),
  record_type text not null,
  record_id text not null,
  record_environment text not null check (record_environment in ('test', 'qa', 'sandbox')),
  confirmed_test boolean not null default false,
  archived_at timestamptz not null,
  purge_after timestamptz not null,
  archive_reason text not null,
  archive_provenance text not null,
  original_snapshot jsonb not null default '{}'::jsonb,
  related_records jsonb not null default '{}'::jsonb,
  purged_at timestamptz,
  purge_result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(record_type, record_id),
  check (purge_after = archived_at + interval '6 months')
);

create table if not exists public.test_archive_files (
  id uuid primary key default gen_random_uuid(),
  archive_id uuid not null references public.test_data_archives(id) on delete cascade,
  bucket_id text not null,
  object_path text not null,
  exclusive_test_only boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  unique(bucket_id, object_path)
);

create table if not exists public.test_data_purge_log (
  id uuid primary key default gen_random_uuid(),
  record_type text not null,
  record_id text not null,
  archive_id uuid not null,
  purged_at timestamptz not null default now(),
  dependent_rows_deleted integer not null default 0,
  stored_files_deleted integer not null default 0,
  notes text not null default 'Application data purged; provider and backup retention remain governed by their separate policies.'
);

alter table public.test_data_archives enable row level security;
alter table public.test_archive_files enable row level security;
alter table public.test_data_purge_log enable row level security;

drop policy if exists admin_read_test_data_archives on public.test_data_archives;
create policy admin_read_test_data_archives on public.test_data_archives
  for select to authenticated using (public.is_admin());
drop policy if exists admin_read_test_archive_files on public.test_archive_files;
create policy admin_read_test_archive_files on public.test_archive_files
  for select to authenticated using (public.is_admin());
drop policy if exists admin_read_test_data_purge_log on public.test_data_purge_log;
create policy admin_read_test_data_purge_log on public.test_data_purge_log
  for select to authenticated using (public.is_admin());

revoke all on public.test_data_archives, public.test_archive_files, public.test_data_purge_log
  from public, anon, authenticated;
grant select on public.test_data_archives, public.test_archive_files, public.test_data_purge_log
  to authenticated;

-- Reuse one order for one browser checkout attempt. A different deliberate
-- checkout receives a different key and remains a separate auditable attempt.
create or replace function public.create_or_reuse_small_order_checkout(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt_key text := nullif(btrim(coalesce(payload ->> 'checkout_attempt_key', '')), '');
  v_existing public.orders%rowtype;
  v_created jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if v_attempt_key is null or length(v_attempt_key) < 16 or length(v_attempt_key) > 120 then
    raise exception 'A valid checkout attempt key is required' using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || v_attempt_key, 0));

  select customer_order.* into v_existing
  from public.orders customer_order
  where customer_order.owner_user_id = auth.uid()
    and customer_order.checkout_attempt_key = v_attempt_key
    and customer_order.archived_at is null
  limit 1;

  if found then
    return jsonb_build_object(
      'created', false,
      'reused', true,
      'order_id', v_existing.id,
      'payment_status', v_existing.payment_status,
      'order_status', v_existing.status,
      'vendor_draft_created', false,
      'live_submission_enabled', false,
      'ss_order_submitted', false,
      'zerotouch_submitted', false
    );
  end if;

  v_created := public.create_small_order_checkout(payload - 'checkout_attempt_key');
  update public.orders
  set checkout_attempt_key = v_attempt_key
  where id = v_created ->> 'order_id' and owner_user_id = auth.uid();

  return v_created || jsonb_build_object('reused', false);
end;
$$;

revoke all on function public.create_or_reuse_small_order_checkout(jsonb) from public, anon;
grant execute on function public.create_or_reuse_small_order_checkout(jsonb) to authenticated;

-- Only Stripe-authenticated server flows may transition a customized checkout
-- to paid. The same update also normalizes amount, balance and queue placement.
create or replace function public.guard_paid_small_order_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_errors jsonb;
begin
  if new.archived_at is not null then return new; end if;

  if new.checkout_source = 'customized_small_order'
    and new.payment_status = 'paid'
    and old.payment_status is distinct from 'paid' then
    if new.payment_confirmation_source not in ('stripe_webhook', 'stripe_verification', 'legacy_stripe')
      or nullif(new.stripe_session_id, '') is null
      or nullif(new.stripe_payment_intent_id, '') is null
      or new.payment_confirmed_at is null then
      raise exception 'Verified Stripe payment is required before fulfillment' using errcode = '23514';
    end if;
    if round(coalesce(new.amount_paid, 0), 2) <> round(coalesce(new.total_amount, 0), 2)
      or round(coalesce(new.balance_due, 0), 2) <> 0 then
      raise exception 'Paid amount and balance are inconsistent' using errcode = '23514';
    end if;
    v_errors := public.small_order_required_data_errors(new.order_items, new.shipping_address, new.owner_user_id);
    if jsonb_array_length(v_errors) > 0 then
      raise exception 'Paid order validation failed: %', v_errors::text using errcode = '23514';
    end if;
    new.status := 'awaiting_fulfillment';
  end if;

  if new.payment_status is distinct from 'paid'
    and new.fulfillment_status is distinct from 'not_started'
    and new.checkout_source = 'customized_small_order' then
    raise exception 'Unpaid checkout cannot enter fulfillment' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_guard_paid_small_order on public.orders;
create trigger orders_guard_paid_small_order
before update of payment_status, fulfillment_status on public.orders
for each row execute function public.guard_paid_small_order_transition();

-- The legacy draft preparer wrote status=paid after creating the private draft.
-- Normalize the operational tab after all payment-transition triggers finish.
create or replace function public.normalize_reconciled_paid_order()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.archived_at is null
    and new.checkout_source = 'customized_small_order'
    and new.payment_status = 'paid'
    and new.status = 'paid' then
    update public.orders set status = 'awaiting_fulfillment'
    where id = new.id and status = 'paid';
  end if;
  return new;
end;
$$;
drop trigger if exists zz_orders_normalize_reconciled_paid on public.orders;
create trigger zz_orders_normalize_reconciled_paid
after update of payment_status on public.orders
for each row execute function public.normalize_reconciled_paid_order();

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  stripe_mode text not null check (stripe_mode in ('test', 'live')),
  order_id text,
  processing_status text not null default 'processing' check (processing_status in ('processing', 'processed', 'failed', 'ignored')),
  attempt_count integer not null default 1,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text
);
alter table public.stripe_webhook_events enable row level security;
revoke all on public.stripe_webhook_events from public, anon, authenticated;

-- Restricted, reversible archival. No customer profile is altered or deleted.
create or replace function public.archive_confirmed_test_order(
  p_order_id text,
  p_reason text,
  p_provenance text,
  p_environment text default 'test'
)
returns jsonb
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_order public.orders%rowtype;
  v_archived_at timestamptz := clock_timestamp();
  v_purge_after timestamptz;
  v_archive_id uuid;
  v_related jsonb;
  v_ref text;
  v_path text;
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') and not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_environment not in ('test', 'qa', 'sandbox') then
    raise exception 'A confirmed test environment is required';
  end if;
  if nullif(btrim(p_reason), '') is null or nullif(btrim(p_provenance), '') is null then
    raise exception 'Archive reason and provenance are required';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found: %', p_order_id; end if;
  if v_order.archived_at is not null then
    return jsonb_build_object('archived', true, 'already_archived', true,
      'order_id', v_order.id, 'archived_at', v_order.archived_at, 'purge_after', v_order.purge_after);
  end if;

  v_purge_after := v_archived_at + interval '6 months';
  select jsonb_build_object(
    'vendor_order_drafts', coalesce((select jsonb_agg(id) from public.vendor_order_drafts where customer_order_id = v_order.id), '[]'::jsonb),
    'vendor_orders', coalesce((select jsonb_agg(id) from public.vendor_orders where customer_order_id = v_order.id), '[]'::jsonb),
    'notifications', coalesce((select jsonb_agg(id) from public.customer_notifications where order_id = v_order.id), '[]'::jsonb),
    'status_history', coalesce((select jsonb_agg(id) from public.order_status_history where order_id = v_order.id), '[]'::jsonb)
  ) into v_related;

  insert into public.test_data_archives(
    record_type, record_id, record_environment, confirmed_test, archived_at,
    purge_after, archive_reason, archive_provenance, original_snapshot, related_records
  ) values (
    'order', v_order.id, p_environment, true, v_archived_at,
    v_purge_after, btrim(p_reason), btrim(p_provenance), to_jsonb(v_order), v_related
  )
  on conflict (record_type, record_id) do update set
    record_environment = excluded.record_environment,
    confirmed_test = true,
    archived_at = excluded.archived_at,
    purge_after = excluded.purge_after,
    archive_reason = excluded.archive_reason,
    archive_provenance = excluded.archive_provenance,
    original_snapshot = excluded.original_snapshot,
    related_records = excluded.related_records,
    updated_at = now()
  returning id into v_archive_id;

  for v_ref in
    select ref from (
      select nullif(v_order.artwork_file_url, '') as ref
      union all
      select nullif(item ->> 'artwork_file_url', '') from jsonb_array_elements(coalesce(v_order.order_items, '[]'::jsonb)) item
      union all
      select nullif(artwork_file_url, '') from public.vendor_orders where customer_order_id = v_order.id
      union all
      select nullif(artwork_file_url, '') from public.vendor_order_drafts where customer_order_id = v_order.id
    ) refs where ref like 'supabase://customer-files/%'
  loop
    v_path := regexp_replace(v_ref, '^supabase://customer-files/', '');
    insert into public.test_archive_files(archive_id, bucket_id, object_path, exclusive_test_only)
    values (
      v_archive_id, 'customer-files', v_path,
      not exists (
        select 1 from public.orders o
        where o.id <> v_order.id and o.archived_at is null and to_jsonb(o)::text like '%' || v_ref || '%'
      ) and not exists (
        select 1 from public.quote_requests q where to_jsonb(q)::text like '%' || v_ref || '%'
      )
    ) on conflict (bucket_id, object_path) do nothing;
  end loop;

  update public.vendor_order_drafts set
    is_sample = true, archived_at = v_archived_at, purge_after = v_purge_after,
    archive_reason = btrim(p_reason), live_submission_enabled = false,
    vendor_status = 'cancelled', production_status = 'cancelled',
    validation_passed = false, ss_submission_state = 'not_submitted',
    safety_mode_message = 'Archived confirmed test — Do Not Fulfill',
    admin_notes = concat_ws(E'\n', nullif(admin_notes, ''),
      '[Test archive] Do not fulfill. Scheduled deletion: ' || v_purge_after::date::text || '.')
  where customer_order_id = v_order.id;

  update public.vendor_orders set
    is_sample = true, archived_at = v_archived_at, purge_after = v_purge_after,
    archive_reason = btrim(p_reason), status = 'canceled', production_status = 'cancelled',
    internal_notes = concat_ws(E'\n', nullif(internal_notes, ''),
      '[Test archive] Do not fulfill. Scheduled deletion: ' || v_purge_after::date::text || '.')
  where customer_order_id = v_order.id;

  update public.customer_notifications set is_sample = true where order_id = v_order.id;
  update public.order_status_history set is_sample = true where order_id = v_order.id;

  update public.orders set
    is_sample = true,
    record_environment = p_environment,
    archived_at = v_archived_at,
    purge_after = v_purge_after,
    archive_reason = btrim(p_reason),
    archive_provenance = btrim(p_provenance),
    test_review_required = false,
    status = 'canceled',
    fulfillment_status = 'not_started',
    production_status = 'cancelled',
    internal_notes = concat_ws(E'\n', nullif(internal_notes, ''),
      '[Test archive] ' || btrim(p_reason) || ' Scheduled deletion: ' || v_purge_after::date::text || '.')
  where id = v_order.id;

  return jsonb_build_object('archived', true, 'already_archived', false,
    'order_id', v_order.id, 'archived_at', v_archived_at, 'purge_after', v_purge_after,
    'archive_id', v_archive_id);
end;
$$;

revoke all on function public.archive_confirmed_test_order(text,text,text,text) from public, anon;
grant execute on function public.archive_confirmed_test_order(text,text,text,text) to authenticated;

-- Permanently purge only confirmed archives whose six-calendar-month boundary
-- has elapsed. Shared profiles and any file still referenced by live data stay.
create or replace function public.purge_expired_test_archives()
returns jsonb
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_archive public.test_data_archives%rowtype;
  v_file public.test_archive_files%rowtype;
  v_dependents integer;
  v_files integer;
  v_total integer := 0;
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Server-side cleanup only' using errcode = '42501';
  end if;

  for v_archive in
    select * from public.test_data_archives
    where confirmed_test is true and purged_at is null and purge_after <= clock_timestamp()
    order by purge_after for update skip locked
  loop
    if not exists (
      select 1 from public.orders where id = v_archive.record_id
        and is_sample is true and archived_at is not null and purge_after <= clock_timestamp()
    ) then continue; end if;
    v_dependents := 0;
    v_files := 0;

    for v_file in select * from public.test_archive_files
      where archive_id = v_archive.id and deleted_at is null and exclusive_test_only is true
    loop
      if not exists (
        select 1 from public.orders o
        where o.id <> v_archive.record_id and o.archived_at is null
          and to_jsonb(o)::text like '%supabase://customer-files/' || v_file.object_path || '%'
      ) and not exists (
        select 1 from public.quote_requests q
        where to_jsonb(q)::text like '%supabase://customer-files/' || v_file.object_path || '%'
      ) then
        delete from storage.objects where bucket_id = v_file.bucket_id and name = v_file.object_path;
        update public.test_archive_files set deleted_at = now() where id = v_file.id;
        v_files := v_files + 1;
      end if;
    end loop;

    delete from public.customer_notifications where order_id = v_archive.record_id;
    get diagnostics v_dependents = row_count;
    delete from public.order_status_history where order_id = v_archive.record_id;
    delete from public.production_status_history where customer_order_id = v_archive.record_id;
    delete from public.vendor_order_status_history where customer_order_id = v_archive.record_id;
    delete from public.created_calendar_events where related_order_id = v_archive.record_id;
    delete from public.calendar_event_suggestions where related_order_id = v_archive.record_id;
    delete from public.productivity_tasks where related_order_id = v_archive.record_id;
    delete from public.vendor_orders where customer_order_id = v_archive.record_id and is_sample is true;
    delete from public.vendor_order_drafts where customer_order_id = v_archive.record_id and is_sample is true;
    delete from public.orders where id = v_archive.record_id and is_sample is true and archived_at is not null;

    update public.test_data_archives set
      purged_at = now(),
      original_snapshot = jsonb_build_object('purged', true),
      related_records = '{}'::jsonb,
      purge_result = jsonb_build_object('stored_files_deleted', v_files,
        'customer_profile_deleted', false, 'external_provider_records_deleted', false),
      updated_at = now()
    where id = v_archive.id;

    insert into public.test_data_purge_log(record_type, record_id, archive_id,
      dependent_rows_deleted, stored_files_deleted)
    values (v_archive.record_type, v_archive.record_id, v_archive.id, v_dependents, v_files);
    v_total := v_total + 1;
  end loop;

  return jsonb_build_object('archives_purged', v_total, 'ran_at', now());
end;
$$;
revoke all on function public.purge_expired_test_archives() from public, anon, authenticated;

-- Existing verified Stripe rows retain their payment history and gain explicit
-- provenance before the stricter transition guard applies to future updates.
update public.orders set
  payment_confirmation_source = 'legacy_stripe',
  payment_confirmed_at = coalesce(payment_date, updated_date)
where payment_status = 'paid'
  and nullif(stripe_session_id, '') is not null
  and nullif(stripe_payment_intent_id, '') is not null
  and payment_confirmation_source is null;

-- Explicitly confirmed by Super Admin on 2026-10-03. The second row retains its
-- successful live Stripe payment inside the restricted archive snapshot.
select public.archive_confirmed_test_order(
  '1a28b615-104c-4152-a223-77f839a00017',
  'Super Admin confirmed YHO/Owl checkout attempt A00017 was test data.',
  'super_admin_confirmation_2026-10-03',
  'test'
);
select public.archive_confirmed_test_order(
  '1c59a790-b6c9-4d47-ba51-df8d52b25b48',
  'Super Admin confirmed YHO/Owl checkout attempt B25B48 was test data.',
  'super_admin_confirmation_2026-10-03',
  'test'
);

-- Archive only existing explicit flags or provider-confirmed Stripe test-mode
-- sessions. Names, emails and order amounts are intentionally not classifiers.
do $$
declare v_order record;
begin
  for v_order in
    select id,
      case when stripe_session_id like 'cs_test_%' then 'sandbox' else 'test' end as environment,
      case when stripe_session_id like 'cs_test_%'
        then 'Stripe test-mode checkout record.'
        else 'Existing explicit QA/test classification.' end as reason,
      case when stripe_session_id like 'cs_test_%'
        then 'stripe_test_session_id'
        else 'existing_is_sample_flag' end as provenance
    from public.orders
    where archived_at is null
      and (is_sample is true or stripe_session_id like 'cs_test_%')
  loop
    perform public.archive_confirmed_test_order(v_order.id, v_order.reason, v_order.provenance, v_order.environment);
  end loop;
end;
$$;

-- Inconsistencies are review flags, never automatic test classification.
update public.orders set test_review_required = true, record_environment = 'unknown'
where archived_at is null and is_sample is false and (
  (payment_status = 'paid' and (
    round(coalesce(amount_paid, 0), 2) <> round(coalesce(total_amount, 0), 2)
    or round(coalesce(balance_due, 0), 2) <> 0
    or (checkout_source = 'customized_small_order' and (
      nullif(stripe_session_id, '') is null or nullif(stripe_payment_intent_id, '') is null
    ))
  ))
  or (payment_status <> 'paid' and fulfillment_status <> 'not_started')
);

create or replace view public.admin_live_orders
with (security_invoker = true)
as
select customer_order.* from public.orders customer_order
where customer_order.is_sample is false
  and customer_order.archived_at is null
  and customer_order.record_environment not in ('test', 'qa', 'sandbox');
comment on view public.admin_live_orders is
  'Operational orders excluding explicit test/sandbox archives. Customer names and order amounts are never test classifiers.';
revoke all on public.admin_live_orders from public, anon;
grant select on public.admin_live_orders to authenticated;

-- pg_cron runs inside Postgres and cannot send orders, email, payments, S&S
-- submissions or labels. Re-applying this migration does not duplicate the job.
create extension if not exists pg_cron with schema extensions;
do $$
declare v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'purge-expired-hc-test-archives';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  perform cron.schedule(
    'purge-expired-hc-test-archives',
    '17 4 * * *',
    'select public.purge_expired_test_archives();'
  );
end;
$$;

commit;
