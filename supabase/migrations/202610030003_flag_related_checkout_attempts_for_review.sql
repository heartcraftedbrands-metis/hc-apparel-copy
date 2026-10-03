begin;

-- A nearby attempt is not automatically test data. When it shares the same
-- authenticated owner and exact item payload with a confirmed test archive,
-- surface it for Super Admin review while leaving it active and reportable.
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
      and archive.original_snapshot ->> 'owner_user_id' = candidate.owner_user_id::text
      and archive.original_snapshot -> 'order_items' = candidate.order_items
      and abs(extract(epoch from (
        candidate.created_date - (archive.original_snapshot ->> 'created_date')::timestamptz
      ))) <= 7 * 24 * 60 * 60
  );

commit;
