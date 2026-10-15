begin;

-- The owner confirmed that this business printing cost was paid personally.
-- Keep the expense, receipt, allocation, and business-reporting treatment intact;
-- this does not create a Stripe withdrawal or a reimbursement transaction.
update public.ops_shared_records
set payload = payload || jsonb_build_object(
      'paymentSourceType', 'Personal',
      'paymentMethod', 'Personal Visa ending 6216',
      'paymentMethodLabel', 'Personal Visa ending 6216',
      'paidPersonally', true,
      'businessPurposeClassification', 'business',
      'reimbursementStatus', 'not_requested',
      'include_in_business_reporting', true,
      'updatedAt', now()::text
    ),
    sync_state = 'synced', revision = revision + 1, updated_at = now()
where id = 'expense-tina-perfecpress-tpjahhv8t' and record_type = 'expense';

update public.ops_shared_records
set payload = payload || jsonb_build_object(
      'paymentSourceType', 'Personal',
      'paymentMethodLabel', 'Personal Visa ending 6216',
      'paidPersonally', true,
      'businessPurposeClassification', 'business',
      'reimbursementStatus', 'not_requested',
      'include_in_business_reporting', true,
      'updatedAt', now()::text
    ),
    sync_state = 'synced', revision = revision + 1, updated_at = now()
where id = 'receipt-tina-perfecpress-tpjahhv8t' and record_type = 'receipt';

update public.ops_cost_allocations
set payment_verification_status = 'verified',
    evidence = evidence || jsonb_build_array(jsonb_build_object(
      'type', 'owner_confirmed_personally_paid_business_expense',
      'paymentMethod', 'Personal Visa ending 6216',
      'confirmedAt', now()::text
    )),
    reviewed_at = now(),
    review_notes = 'Business DTF printing cost paid personally with Visa ending 6216. No Stripe withdrawal or reimbursement recorded.'
where shared_record_id = 'invoice-fab32c15-3fa9-44f8-b059-516e02c6a6d0'
  and expense_record_id = 'expense-tina-perfecpress-tpjahhv8t'
  and relationship = 'transfers_printing';

update public.ops_shared_records
set payload = payload || jsonb_build_object(
      'financialLabels', jsonb_build_object(
        'knownIncompleteOrderRemainder', 21.83,
        'knownIncompleteOrderRemainderStatus', 'incomplete',
        'calculatedFinancialAccountBalance', 51.09,
        'calculatedFinancialAccountBalanceVerifiedCurrent', false,
        'personallyPaidBusinessCost', 31.80
      ),
      'updatedAt', now()::text
    ),
    sync_state = 'synced', revision = revision + 1, updated_at = now()
where id = 'invoice-fab32c15-3fa9-44f8-b059-516e02c6a6d0' and record_type = 'invoice';

alter table public.ops_shipments
  add column if not exists shipment_email_operation_key text,
  add column if not exists shipment_email_recipient text,
  add column if not exists shipment_email_subject text,
  add column if not exists shipment_email_status text,
  add column if not exists shipment_email_provider text,
  add column if not exists shipment_email_provider_message_id text,
  add column if not exists shipment_email_requested_at timestamptz,
  add column if not exists shipment_email_accepted_at timestamptz,
  add column if not exists shipment_email_delivered_at timestamptz,
  add column if not exists shipment_email_last_checked_at timestamptz,
  add column if not exists shipment_email_error text,
  add column if not exists shipment_email_events jsonb not null default '[]'::jsonb;

create unique index if not exists ops_shipments_email_operation_key_idx
  on public.ops_shipments(shipment_email_operation_key)
  where shipment_email_operation_key is not null;

commit;
