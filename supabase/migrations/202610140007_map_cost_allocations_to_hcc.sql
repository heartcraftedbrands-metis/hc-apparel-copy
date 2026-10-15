begin;

-- Heart Command Center calculates invoice profitability from linked expense
-- records. Keep the normalized allocation table as the source of truth while
-- adding the existing HCC projection fields to those same stable records.
update public.ops_shared_records
set payload = payload || jsonb_build_object(
  'orderCostType','blank_garments',
  'orderCostAllocatedAmount',11.96,
  'orderCostAllocationStatus','confirmed',
  'updatedAt',now()::text
)
where id='expense-tina-michaels-20261014-1196' and record_type='expense';

update public.ops_shared_records
set payload = payload || jsonb_build_object(
  'orderCostType','transfers_printing',
  'orderCostAllocatedAmount',31.80,
  'orderCostAllocationStatus','confirmed',
  'updatedAt',now()::text
)
where id='expense-tina-perfecpress-tpjahhv8t' and record_type='expense';

update public.ops_shared_records
set payload = payload || jsonb_build_object(
  'orderCostType','postage',
  'orderCostAllocatedAmount',15.00,
  'orderCostAllocationStatus','confirmed',
  'updatedAt',now()::text
)
where id='expense-tina-usps-9505506617716287884250' and record_type='expense';

commit;
