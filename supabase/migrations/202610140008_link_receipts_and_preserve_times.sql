begin;

-- HCC's receipt vault reads the relationship from the receipt side as well as
-- from the expense. Link the stable pairs so no second expense is created.
update public.ops_shared_records
set payload = payload || jsonb_build_object(
  'expenseId','expense-tina-michaels-20261014-1196',
  'paymentSourceType','Business',
  'paymentMethodLabel','Stripe Financial Account card ending 6373',
  'updatedAt',now()::text
)
where id='receipt-tina-michaels-financial-account-20261014' and record_type='receipt';

update public.ops_shared_records
set payload = payload || jsonb_build_object(
  'expenseId','expense-tina-perfecpress-tpjahhv8t',
  'paymentSourceType','Business',
  'paymentMethodLabel','Visa ending 6216',
  'updatedAt',now()::text
)
where id='receipt-tina-perfecpress-tpjahhv8t' and record_type='receipt';

update public.ops_shared_records
set payload = payload || jsonb_build_object(
  'expenseId','expense-tina-usps-9505506617716287884250',
  'paymentSourceType','Business',
  'paymentMethodLabel','Payment source under review (card ending mismatch)',
  'updatedAt',now()::text
)
where id='receipt-tina-usps-financial-account-20261014' and record_type='receipt';

update public.ops_shared_records
set payload = payload || jsonb_build_object(
  'expenseId','expense-racetrac-2329-20261014-254',
  'paymentSourceType','Business',
  'paymentMethodLabel','Stripe Financial Account card ending 6373',
  'updatedAt',now()::text
)
where id='receipt-racetrac-2329-financial-account-20261014' and record_type='receipt';

-- HCC formats timestamps in Eastern Time. Store the evidence timestamps, not a
-- UTC-parsed date-only value that would appear as the prior evening.
update public.ops_shared_records
set payload = payload || jsonb_build_object('date','2026-10-14T15:30:00-04:00','updatedAt',now()::text)
where id='expense-tina-michaels-20261014-1196' and record_type='expense';

update public.ops_shared_records
set payload = payload || jsonb_build_object('date','2026-10-14T14:12:00-04:00','updatedAt',now()::text)
where id='expense-tina-usps-9505506617716287884250' and record_type='expense';

update public.ops_shared_records
set payload = payload || jsonb_build_object('date','2026-10-14T15:03:00-04:00','updatedAt',now()::text)
where id='expense-racetrac-2329-20261014-254' and record_type='expense';

commit;
