begin;

-- Older attempts can precede a customer signing in and therefore have a
-- different owner_user_id. Exact email + item payload + checkout source + a
-- narrow time window is enough to request human review, but not enough to
-- archive or exclude the record automatically.
update public.orders candidate
set test_review_required = true,
    record_environment = 'unknown'
where candidate.archived_at is null
  and candidate.is_sample is false
  and candidate.checkout_source = 'customized_small_order'
  and exists (
    select 1
    from public.test_data_archives archive
    where archive.confirmed_test is true
      and archive.record_type = 'order'
      and archive.original_snapshot ->> 'checkout_source' = 'customized_small_order'
      and lower(archive.original_snapshot ->> 'customer_email') = lower(candidate.customer_email)
      and archive.original_snapshot -> 'order_items' = candidate.order_items
      and abs(extract(epoch from (
        candidate.created_date - (archive.original_snapshot ->> 'created_date')::timestamptz
      ))) <= 24 * 60 * 60
  );

commit;
