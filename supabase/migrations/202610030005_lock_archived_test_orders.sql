begin;

-- Archived test orders are evidence, not an operational queue. Block any
-- attempt to move them back into payment or fulfillment while they are kept
-- for the six-month retention period.
create or replace function public.lock_archived_test_order_operations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.archived_at is not null and (
    new.status is distinct from old.status
    or new.payment_status is distinct from old.payment_status
    or new.fulfillment_status is distinct from old.fulfillment_status
    or new.amount_paid is distinct from old.amount_paid
    or new.balance_due is distinct from old.balance_due
    or new.total_amount is distinct from old.total_amount
    or new.stripe_session_id is distinct from old.stripe_session_id
    or new.stripe_payment_intent_id is distinct from old.stripe_payment_intent_id
    or new.payment_date is distinct from old.payment_date
    or new.archived_at is distinct from old.archived_at
    or new.purge_after is distinct from old.purge_after
    or new.archive_reason is distinct from old.archive_reason
    or new.archive_provenance is distinct from old.archive_provenance
  ) then
    raise exception 'Archived test orders are read-only until scheduled purge'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_lock_archived_test_operations on public.orders;
create trigger orders_lock_archived_test_operations
before update on public.orders
for each row execute function public.lock_archived_test_order_operations();

commit;
