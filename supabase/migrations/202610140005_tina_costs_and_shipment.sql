begin;

-- Confirmed order-cost allocations are kept separate from payment-card
-- verification. A receipt or explicit operator confirmation can establish an
-- order cost even while the corresponding card debit is pending or ambiguous.
create table if not exists public.ops_cost_allocations (
  id text primary key,
  business_id text not null references public.ops_businesses(id),
  shared_record_id text not null references public.ops_shared_records(id) on delete cascade,
  expense_record_id text not null references public.ops_shared_records(id) on delete restrict,
  relationship text not null check (relationship in (
    'blank_garments','transfers_printing','postage','packaging','production_labor','other_cost'
  )),
  allocated_amount_cents bigint not null check (allocated_amount_cents >= 0),
  currency text not null default 'USD',
  allocation_status text not null default 'review_needed' check (allocation_status in (
    'review_needed','confirmed','rejected'
  )),
  payment_verification_status text not null default 'unverified' check (payment_verification_status in (
    'verified','pending','unverified','review_needed','not_applicable'
  )),
  evidence jsonb not null default '[]'::jsonb,
  source_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  review_notes text,
  unique (shared_record_id, expense_record_id, relationship)
);

create table if not exists public.ops_shipments (
  id text primary key,
  business_id text not null references public.ops_businesses(id),
  shared_record_id text not null references public.ops_shared_records(id) on delete cascade,
  carrier text not null,
  tracking_number text not null,
  service text,
  shipment_status text not null default 'tracking_pending_refresh',
  status_summary text,
  tracking_url text not null,
  postage_cents bigint check (postage_cents is null or postage_cents >= 0),
  currency text not null default 'USD',
  receipt_printed_at timestamptz,
  receipt_timezone text,
  destination_city text,
  destination_state text,
  destination_postal_code text,
  weight_ounces numeric(10,2),
  expected_delivery_date date,
  expected_delivery_is_estimate boolean not null default true,
  insurance_cents bigint,
  insurance_charge_cents bigint,
  last_checked_at timestamptz,
  status_source text,
  status_data jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (carrier, tracking_number)
);

create index if not exists ops_cost_allocations_invoice_idx
  on public.ops_cost_allocations(shared_record_id, allocation_status, relationship);
create index if not exists ops_shipments_invoice_idx
  on public.ops_shipments(shared_record_id, updated_at desc);

create or replace function public.ops_touch_private_operation()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists ops_cost_allocation_touch on public.ops_cost_allocations;
create trigger ops_cost_allocation_touch before update on public.ops_cost_allocations
for each row execute function public.ops_touch_private_operation();
drop trigger if exists ops_shipment_touch on public.ops_shipments;
create trigger ops_shipment_touch before update on public.ops_shipments
for each row execute function public.ops_touch_private_operation();

alter table public.ops_cost_allocations enable row level security;
alter table public.ops_shipments enable row level security;

drop policy if exists ops_cost_allocations_read on public.ops_cost_allocations;
create policy ops_cost_allocations_read on public.ops_cost_allocations for select to authenticated
using (public.is_admin() or public.ops_has_permission(business_id, 'finances'));
drop policy if exists ops_cost_allocations_write on public.ops_cost_allocations;
create policy ops_cost_allocations_write on public.ops_cost_allocations for all to authenticated
using (public.is_admin() or public.ops_has_permission(business_id, 'finances'))
with check (public.is_admin() or public.ops_has_permission(business_id, 'finances'));
drop policy if exists ops_shipments_staff_read on public.ops_shipments;
create policy ops_shipments_staff_read on public.ops_shipments for select to authenticated
using (public.is_admin() or public.ops_has_permission(business_id, 'orders') or public.ops_has_permission(business_id, 'finances'));
drop policy if exists ops_shipments_staff_write on public.ops_shipments;
create policy ops_shipments_staff_write on public.ops_shipments for all to authenticated
using (public.is_admin() or public.ops_has_permission(business_id, 'orders'))
with check (public.is_admin() or public.ops_has_permission(business_id, 'orders'));

-- Customer-safe shipment access. The caller must own the invoice email; no
-- postage cost, receipt evidence, card detail, or precise street address leaves
-- the private operations schema.
create or replace function public.customer_invoice_shipments(requested_invoice_id text)
returns table (
  invoice_id text,
  carrier text,
  tracking_number text,
  service text,
  shipment_status text,
  status_summary text,
  tracking_url text,
  destination_city text,
  destination_state text,
  destination_postal_code text,
  expected_delivery_date date,
  expected_delivery_is_estimate boolean,
  last_checked_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select s.shared_record_id, s.carrier, s.tracking_number, s.service,
    s.shipment_status, s.status_summary, s.tracking_url,
    s.destination_city, s.destination_state, s.destination_postal_code,
    s.expected_delivery_date, s.expected_delivery_is_estimate, s.last_checked_at
  from public.ops_shipments s
  join public.ops_shared_records r on r.id = s.shared_record_id and r.record_type = 'invoice'
  where s.shared_record_id = requested_invoice_id
    and (
      public.is_admin()
      or lower(coalesce(auth.jwt()->>'email','')) = lower(coalesce(r.payload->>'customerEmail',''))
    );
$$;

revoke all on function public.customer_invoice_shipments(text) from public, anon;
grant execute on function public.customer_invoice_shipments(text) to authenticated;

-- Private evidence records. The four original files are uploaded separately to
-- the private business-receipts bucket after this migration. The USPS paper
-- receipt itself was not present in the supplied files; its user-confirmed facts
-- are retained without falsely claiming a file upload.
insert into public.ops_shared_records
  (id,business_id,record_type,source_system,source_record_id,status,payload,sync_state)
values
  ('receipt-tina-michaels-financial-account-20261014','hc-apparel','receipt','heart_command_center','receipt-tina-michaels-financial-account-20261014','reviewed',
   jsonb_build_object(
     'id','receipt-tina-michaels-financial-account-20261014','businessId','hc-apparel','vendor','Michaels Stores 5082',
     'amount',11.96,'currency','USD','purchaseDate','2026-10-14','category','Blank-shirt materials',
     'notes','Stripe Financial Account screenshot; not an itemized merchant receipt. User confirmed quantity 3 belongs to Tina Dunn invoice HCA-2026-0002.',
     'fileName','michaels-financial-account-2026-10-14.jpeg','mimeType','image/jpeg','fileSize',91350,
     'checksumSha256','50f5e54f223dcdb05ffff48df8de0bb59461c006a00b3b38ec19b52059a211ef',
     'cloudStoragePath','hc-apparel/tina-dunn/2026-10-14/michaels-financial-account.jpeg',
     'evidenceType','stripe_dashboard_screenshot','sourceSystem','heart_command_center','sourceRecordId','receipt-tina-michaels-financial-account-20261014',
     'record_environment','production','include_in_business_reporting',true,'createdAt',now()::text,'updatedAt',now()::text
   ),'synced'),
  ('receipt-tina-perfecpress-tpjahhv8t','hc-apparel','receipt','heart_command_center','receipt-tina-perfecpress-tpjahhv8t','reviewed',
   jsonb_build_object(
     'id','receipt-tina-perfecpress-tpjahhv8t','businessId','hc-apparel','vendor','PerfecPressHTV',
     'amount',31.80,'tax',1.80,'currency','USD','purchaseDate',null,'category','DTF printing',
     'notes','Order confirmation TPJAHHV8T. The source shows estimated taxes; purchase date is not displayed and is intentionally not guessed.',
     'fileName','perfecpress-confirmation-tpjahhv8t.jpeg','mimeType','image/jpeg','fileSize',128881,
     'checksumSha256','a56356e6086258774e7b5524892c234a942ada83b9ffdedf8e7ea1708cffd194',
     'cloudStoragePath','hc-apparel/tina-dunn/perfecpress-confirmation-tpjahhv8t.jpeg',
     'evidenceType','merchant_order_confirmation','sourceSystem','heart_command_center','sourceRecordId','receipt-tina-perfecpress-tpjahhv8t',
     'record_environment','production','include_in_business_reporting',true,'createdAt',now()::text,'updatedAt',now()::text
   ),'synced'),
  ('receipt-tina-usps-financial-account-20261014','hc-apparel','receipt','heart_command_center','receipt-tina-usps-financial-account-20261014','reviewed',
   jsonb_build_object(
     'id','receipt-tina-usps-financial-account-20261014','businessId','hc-apparel','vendor','USPS Kiosk 1204599557',
     'amount',15.00,'currency','USD','purchaseDate','2026-10-14','category','Postage',
     'notes','Stripe Financial Account screenshot. The USPS paper receipt facts were provided, but the paper receipt image was not present in the supplied files.',
     'fileName','usps-financial-account-2026-10-14.jpeg','mimeType','image/jpeg','fileSize',91362,
     'checksumSha256','24cda26438aed23629391631057ae6fc2f894f75e5e4df7ed28646e11ea1f5ca',
     'cloudStoragePath','hc-apparel/tina-dunn/2026-10-14/usps-financial-account.jpeg',
     'evidenceType','stripe_dashboard_screenshot','paperReceiptFileAvailable',false,
     'sourceSystem','heart_command_center','sourceRecordId','receipt-tina-usps-financial-account-20261014',
     'record_environment','production','include_in_business_reporting',true,'createdAt',now()::text,'updatedAt',now()::text
   ),'synced'),
  ('receipt-racetrac-2329-financial-account-20261014','hc-apparel','receipt','heart_command_center','receipt-racetrac-2329-financial-account-20261014','needs_review',
   jsonb_build_object(
     'id','receipt-racetrac-2329-financial-account-20261014','businessId','hc-apparel','vendor','RaceTrac 2329',
     'amount',2.54,'currency','USD','purchaseDate','2026-10-14','category','Unclassified',
     'notes','Stripe Financial Account screenshot only. Item and business purpose are unknown; not linked to Tina Dunn.',
     'fileName','racetrac-financial-account-2026-10-14.png','mimeType','image/png','fileSize',292952,
     'checksumSha256','d07307f6f2653bd90e098cc823064ff532ef000737d8a6d6d3d1b855ed215580',
     'cloudStoragePath','hc-apparel/review/2026-10-14/racetrac-financial-account.png',
     'evidenceType','stripe_dashboard_screenshot','sourceSystem','heart_command_center','sourceRecordId','receipt-racetrac-2329-financial-account-20261014',
     'record_environment','production','include_in_business_reporting',false,'createdAt',now()::text,'updatedAt',now()::text
   ),'synced')
on conflict (id) do update set
  status=excluded.status,
  payload=public.ops_shared_records.payload || excluded.payload,
  sync_state='synced';

insert into public.ops_shared_records
  (id,business_id,record_type,source_system,source_record_id,status,payload,sync_state)
values
  ('expense-tina-michaels-20261014-1196','hc-apparel','expense','heart_command_center','expense-tina-michaels-20261014-1196','recorded',
   jsonb_build_object(
     'id','expense-tina-michaels-20261014-1196','businessId','hc-apparel','date','2026-10-14','vendor','Michaels Stores 5082',
     'amount',11.96,'currency','USD','category','Inventory - blank shirts','description','Three blank shirts for Tina Dunn invoice HCA-2026-0002',
     'quantity',3,'perItemCost',null,'salesTax',null,'receiptId','receipt-tina-michaels-financial-account-20261014',
     'invoiceId','invoice-fab32c15-3fa9-44f8-b059-516e02c6a6d0','invoiceNumber','HCA-2026-0002',
     'paymentStatus','pending','paymentSource','Stripe Financial Account screenshot','cardLast4','6373',
     'paymentVerificationStatus','pending','sourceSystem','heart_command_center','sourceRecordId','expense-tina-michaels-20261014-1196',
     'record_environment','production','include_in_business_reporting',true,'createdAt',now()::text,'updatedAt',now()::text
   ),'synced'),
  ('expense-tina-perfecpress-tpjahhv8t','hc-apparel','expense','heart_command_center','expense-tina-perfecpress-tpjahhv8t','recorded',
   jsonb_build_object(
     'id','expense-tina-perfecpress-tpjahhv8t','businessId','hc-apparel','date',null,'vendor','PerfecPressHTV',
     'amount',31.80,'currency','USD','category','DTF printing','description','Custom DTF Gang Sheet, 22.6 in × 60 in (5 ft), Regular DTF Film, quantity 1',
     'subtotal',30.00,'merchantTaxLabel','Estimated taxes','merchantTaxAmount',1.80,'pickupAmount',0,'fulfillmentMethod','Free in-store pickup',
     'receiptId','receipt-tina-perfecpress-tpjahhv8t','invoiceId','invoice-fab32c15-3fa9-44f8-b059-516e02c6a6d0','invoiceNumber','HCA-2026-0002',
     'merchantConfirmation','TPJAHHV8T','paymentMethod','Visa ending 6216','paymentVerificationStatus','unverified',
     'purchaseDateStatus','unavailable_from_confirmation','sourceSystem','heart_command_center','sourceRecordId','expense-tina-perfecpress-tpjahhv8t',
     'record_environment','production','include_in_business_reporting',true,'createdAt',now()::text,'updatedAt',now()::text
   ),'synced'),
  ('expense-tina-usps-9505506617716287884250','hc-apparel','expense','heart_command_center','expense-tina-usps-9505506617716287884250','recorded',
   jsonb_build_object(
     'id','expense-tina-usps-9505506617716287884250','businessId','hc-apparel','date','2026-10-14','vendor','USPS',
     'amount',15.00,'currency','USD','category','Postage','description','Priority Mail Padded Flat Rate Envelope to North Las Vegas, NV 89031',
     'receiptId','receipt-tina-usps-financial-account-20261014','invoiceId','invoice-fab32c15-3fa9-44f8-b059-516e02c6a6d0','invoiceNumber','HCA-2026-0002',
     'trackingNumber','9505506617716287884250','weightOunces',22.70,'receiptPrintedAt','2026-10-14T14:12:00-04:00','receiptTimezone','America/New_York',
     'insuranceAmount',100.00,'insuranceCharge',0,'expectedDeliveryDate','2026-10-17','expectedDeliveryIsEstimate',true,
     'stripeMerchant','USPS KIOSK 1204599557','stripeCardLast4','6373','receiptCardLast4','2437','paymentVerificationStatus','review_needed',
     'sourceSystem','heart_command_center','sourceRecordId','expense-tina-usps-9505506617716287884250',
     'record_environment','production','include_in_business_reporting',true,'createdAt',now()::text,'updatedAt',now()::text
   ),'synced'),
  ('expense-racetrac-2329-20261014-254','hc-apparel','expense','heart_command_center','expense-racetrac-2329-20261014-254','needs_review',
   jsonb_build_object(
     'id','expense-racetrac-2329-20261014-254','businessId','hc-apparel','date','2026-10-14','vendor','RaceTrac 2329',
     'amount',2.54,'currency','USD','category','Unclassified','description','Pending card purchase; item and business purpose unknown',
     'receiptId','receipt-racetrac-2329-financial-account-20261014','paymentStatus','pending','cardLast4','6373',
     'reviewStatus','needs_review','linkedToTinaInvoice',false,'paymentVerificationStatus','pending',
     'sourceSystem','heart_command_center','sourceRecordId','expense-racetrac-2329-20261014-254',
     'record_environment','production','include_in_business_reporting',false,'createdAt',now()::text,'updatedAt',now()::text
   ),'synced')
on conflict (id) do update set
  status=excluded.status,
  payload=public.ops_shared_records.payload || excluded.payload,
  sync_state='synced';

-- Provisional Stripe rows use deterministic evidence IDs, not truncated Stripe
-- identifiers. The worker supersedes them when an exact Treasury object is
-- retrieved, preventing double counting.
insert into public.ops_financial_transactions
  (id,provider,provider_transaction_id,provider_account_id,business_id,transaction_kind,direction,amount_cents,currency,
   occurred_at,merchant_name,merchant_category,source_status,source_type,source_data,source_hash,review_status)
values
  ('stripe:evidence:michaels-5082:20261014:1196','stripe','evidence:michaels-5082:20261014:1196',null,'hc-apparel','card_expense','outflow',1196,'USD',
   '2026-10-14T15:30:00-04:00','MICHAELS STORES 5082','card_spend','pending','dashboard_screenshot_received_debit',
   jsonb_build_object('displayedTime','Oct 14, 2026, 3:30 PM','displayedTimezone','not shown','workspaceTimezone','America/New_York','timeZoneVerification','provisional','cardLast4','6373','receivedDebitIdDisplay','truncated in screenshot','evidenceChecksum','50f5e54f223dcdb05ffff48df8de0bb59461c006a00b3b38ec19b52059a211ef'),
   '50f5e54f223dcdb05ffff48df8de0bb59461c006a00b3b38ec19b52059a211ef','confirmed'),
  ('stripe:evidence:usps-kiosk-1204599557:20261014:1500','stripe','evidence:usps-kiosk-1204599557:20261014:1500',null,'hc-apparel','card_expense','outflow',1500,'USD',
   '2026-10-14T18:12:00-04:00','USPS KIOSK 1204599557','card_spend','pending','dashboard_screenshot_received_debit',
   jsonb_build_object('displayedTime','Oct 14, 2026, 6:12 PM','displayedTimezone','not shown','workspaceTimezone','America/New_York','timeZoneVerification','provisional','cardLast4','6373','receiptCardLast4','2437','cardLast4Conflict',true,'receivedDebitIdDisplay','truncated in screenshot','evidenceChecksum','24cda26438aed23629391631057ae6fc2f894f75e5e4df7ed28646e11ea1f5ca'),
   '24cda26438aed23629391631057ae6fc2f894f75e5e4df7ed28646e11ea1f5ca','review_needed'),
  ('stripe:evidence:racetrac-2329:20261014:254','stripe','evidence:racetrac-2329:20261014:254',null,'hc-apparel','card_expense','outflow',254,'USD',
   '2026-10-14T15:03:00-04:00','RACETRAC 2329','card_spend','pending','dashboard_screenshot_received_debit',
   jsonb_build_object('displayedTime','Oct 14, 2026, 3:03 PM','displayedTimezone','not shown','workspaceTimezone','America/New_York','timeZoneVerification','provisional','cardLast4','6373','receivedDebitIdDisplay','truncated in screenshot','evidenceChecksum','d07307f6f2653bd90e098cc823064ff532ef000737d8a6d6d3d1b855ed215580'),
   'd07307f6f2653bd90e098cc823064ff532ef000737d8a6d6d3d1b855ed215580','review_needed')
on conflict (provider,provider_transaction_id,transaction_kind) do update set
  amount_cents=excluded.amount_cents, source_status=excluded.source_status,
  source_data=excluded.source_data, source_hash=excluded.source_hash,
  review_status=excluded.review_status, updated_at=now();

insert into public.ops_reconciliation_matches
  (financial_transaction_id,shared_record_id,relationship,match_status,confidence,evidence,reviewed_at,review_notes)
values
  ('stripe:evidence:michaels-5082:20261014:1196','invoice-fab32c15-3fa9-44f8-b059-516e02c6a6d0','blank_garments','confirmed',1,
   jsonb_build_array(jsonb_build_object('type','explicit_user_confirmation','quantity',3,'amount',11.96),jsonb_build_object('type','private_screenshot','checksum','50f5e54f223dcdb05ffff48df8de0bb59461c006a00b3b38ec19b52059a211ef')),
   now(),'Allocation confirmed by the business owner; Stripe debit remains pending.'),
  ('stripe:evidence:usps-kiosk-1204599557:20261014:1500','invoice-fab32c15-3fa9-44f8-b059-516e02c6a6d0','postage','review_needed',0.850,
   jsonb_build_array(jsonb_build_object('type','amount_merchant_date_match','trackingNumber','9505506617716287884250'),jsonb_build_object('type','card_last4_conflict','stripeLast4','6373','receiptLast4','2437')),
   null,'Actual postage allocation is independently confirmed; the Stripe-to-receipt card match remains in review.')
on conflict (financial_transaction_id,shared_record_id,relationship) do update set
  match_status=excluded.match_status, confidence=excluded.confidence,
  evidence=excluded.evidence, reviewed_at=excluded.reviewed_at, review_notes=excluded.review_notes;

insert into public.ops_cost_allocations
  (id,business_id,shared_record_id,expense_record_id,relationship,allocated_amount_cents,currency,allocation_status,payment_verification_status,evidence,source_hash,reviewed_at,review_notes)
values
  ('cost:tina:michaels:20261014','hc-apparel','invoice-fab32c15-3fa9-44f8-b059-516e02c6a6d0','expense-tina-michaels-20261014-1196','blank_garments',1196,'USD','confirmed','pending',
   jsonb_build_array(jsonb_build_object('type','explicit_user_confirmation','quantity',3),jsonb_build_object('type','private_attachment','recordId','receipt-tina-michaels-financial-account-20261014')),
   '50f5e54f223dcdb05ffff48df8de0bb59461c006a00b3b38ec19b52059a211ef',now(),'Confirmed order allocation; tax and per-shirt rounding intentionally unset.'),
  ('cost:tina:perfecpress:tpjahhv8t','hc-apparel','invoice-fab32c15-3fa9-44f8-b059-516e02c6a6d0','expense-tina-perfecpress-tpjahhv8t','transfers_printing',3180,'USD','confirmed','unverified',
   jsonb_build_array(jsonb_build_object('type','merchant_order_confirmation','confirmation','TPJAHHV8T'),jsonb_build_object('type','private_attachment','recordId','receipt-tina-perfecpress-tpjahhv8t')),
   'a56356e6086258774e7b5524892c234a942ada83b9ffdedf8e7ea1708cffd194',now(),'Visa ending 6216 is outside the verified Stripe Financial Account evidence; purchase date remains unavailable.'),
  ('cost:tina:usps:9505506617716287884250','hc-apparel','invoice-fab32c15-3fa9-44f8-b059-516e02c6a6d0','expense-tina-usps-9505506617716287884250','postage',1500,'USD','confirmed','review_needed',
   jsonb_build_array(jsonb_build_object('type','user_confirmed_usps_receipt_facts','trackingNumber','9505506617716287884250'),jsonb_build_object('type','private_attachment','recordId','receipt-tina-usps-financial-account-20261014')),
   'usps:9505506617716287884250:1500:20261014',now(),'Actual postage is confirmed from the USPS receipt facts. Stripe card last-four mismatch remains a separate review item.')
on conflict (shared_record_id,expense_record_id,relationship) do update set
  allocated_amount_cents=excluded.allocated_amount_cents, allocation_status=excluded.allocation_status,
  payment_verification_status=excluded.payment_verification_status, evidence=excluded.evidence,
  source_hash=excluded.source_hash, reviewed_at=excluded.reviewed_at, review_notes=excluded.review_notes;

insert into public.ops_shipments
  (id,business_id,shared_record_id,carrier,tracking_number,service,shipment_status,status_summary,tracking_url,postage_cents,currency,
   receipt_printed_at,receipt_timezone,destination_city,destination_state,destination_postal_code,weight_ounces,
   expected_delivery_date,expected_delivery_is_estimate,insurance_cents,insurance_charge_cents,status_source,evidence)
values
  ('shipment:usps:9505506617716287884250','hc-apparel','invoice-fab32c15-3fa9-44f8-b059-516e02c6a6d0','USPS','9505506617716287884250',
   'Priority Mail Padded Flat Rate Envelope','tracking_pending_refresh','USPS receipt recorded; live tracking refresh pending.',
   'https://tools.usps.com/go/TrackConfirmAction?tLabels=9505506617716287884250',1500,'USD',
   '2026-10-14T14:12:00-04:00','America/New_York','North Las Vegas','NV','89031',22.70,'2026-10-17',true,10000,0,
   'user_confirmed_receipt_facts',jsonb_build_array(jsonb_build_object('type','receipt_facts','paperReceiptFileAvailable',false),jsonb_build_object('type','stripe_screenshot','recordId','receipt-tina-usps-financial-account-20261014')))
on conflict (carrier,tracking_number) do update set
  shared_record_id=excluded.shared_record_id, service=excluded.service, postage_cents=excluded.postage_cents,
  receipt_printed_at=excluded.receipt_printed_at, receipt_timezone=excluded.receipt_timezone,
  destination_city=excluded.destination_city, destination_state=excluded.destination_state,
  destination_postal_code=excluded.destination_postal_code, weight_ounces=excluded.weight_ounces,
  expected_delivery_date=excluded.expected_delivery_date, expected_delivery_is_estimate=excluded.expected_delivery_is_estimate,
  insurance_cents=excluded.insurance_cents, insurance_charge_cents=excluded.insurance_charge_cents,
  evidence=excluded.evidence, updated_at=now();

update public.ops_shared_records
set payload = payload || jsonb_build_object(
  'updatedAt',now()::text,
  'trackingNumber','9505506617716287884250',
  'shippingCarrier','USPS',
  'shippingService','Priority Mail Padded Flat Rate Envelope',
  'shippingEstimated',false,
  'actualShippingCost',15.00,
  'deliveryEstimate','2026-10-17',
  'shipmentStatus','tracking_pending_refresh',
  'fulfillmentCosts',jsonb_build_object(
    'currency','USD','blankGarments',11.96,'transfersPrinting',31.80,'postage',15.00,
    'recordedActualCostTotal',58.76,'complete',false,
    'missing',jsonb_build_array('Paid pressing or production labor','Packaging')
  ),
  'fulfillmentCostsComplete',false,
  'fulfillmentCostMissing',jsonb_build_array('Paid pressing or production labor','Packaging'),
  'costReconciliationStatus','incomplete',
  'orderCostReview',coalesce(payload->'orderCostReview','{}'::jsonb) || jsonb_build_object(
    'blank_garments',jsonb_build_object('status','confirmed_actual','actualAmount',11.96,'quantity',3,'paymentVerificationStatus','pending','reviewedAt',now()::text),
    'transfers_printing',jsonb_build_object('status','confirmed_actual','actualAmount',31.80,'merchantTaxLabel','Estimated taxes','merchantTaxAmount',1.80,'purchaseDate',null,'paymentVerificationStatus','unverified','reviewedAt',now()::text),
    'postage',jsonb_build_object('status','confirmed_actual','actualAmount',15.00,'trackingNumber','9505506617716287884250','paymentVerificationStatus','review_needed','reviewedAt',now()::text),
    'packaging',jsonb_build_object('status','pending_evidence','actualAmount',null,'reviewedAt',now()::text),
    'production_labor',jsonb_build_object('status','pending_evidence','actualAmount',null,'reviewedAt',now()::text)
  ),
  'costing',coalesce(payload->'costing','{}'::jsonb) || jsonb_build_object(
    'actualCostReconciliation',coalesce(payload#>'{costing,actualCostReconciliation}','{}'::jsonb) || jsonb_build_object(
      'status','incomplete','recordedActualCostTotal',58.76,
      'blankGarments',jsonb_build_object('status','confirmed_actual','actualAmount',11.96,'quantity',3),
      'transfersPrinting',jsonb_build_object('status','confirmed_actual','actualAmount',31.80,'merchantTaxLabel','Estimated taxes','merchantTaxAmount',1.80,'purchaseDate',null),
      'postage',jsonb_build_object('status','confirmed_actual','actualAmount',15.00,'trackingNumber','9505506617716287884250'),
      'packaging',jsonb_build_object('status','pending_evidence','actualAmount',null),
      'productionLabor',jsonb_build_object('status','pending_evidence','actualAmount',null),
      'reviewedAt',now()::text
    )
  ),
  'financialReconciliation',coalesce(payload->'financialReconciliation','{}'::jsonb) || jsonb_build_object(
    'status','incomplete','checkedAt',now()::text,
    'source','Stripe live payment, Stripe Financial Account/Treasury, private purchase evidence, and USPS tracking resources',
    'relatedCosts',jsonb_build_object('verifiedActualCosts',58.76,'reviewQueueCount',1,'complete',false,'paymentVerificationSeparate',true),
    'margin',jsonb_build_object('final',null,'complete',false,'knownAmountAfterVerifiedCosts',22.21,'grossCollected',83.70,'processingFee',2.73,'verifiedCosts',58.76),
    'shipping',jsonb_build_object('trackingNumber','9505506617716287884250','actualPostageVerified',true,'actualPostage',15.00,'expectedDeliveryDate','2026-10-17','expectedDeliveryIsEstimate',true,'lastCheckedAt',null,'status','tracking_pending_refresh'),
    'order',jsonb_build_object('found',false,'reason','This is a standalone Heart Command Center invoice; no storefront order was fabricated.')
  )
)
where id='invoice-fab32c15-3fa9-44f8-b059-516e02c6a6d0' and record_type='invoice';

revoke all on public.ops_cost_allocations, public.ops_shipments from anon;
grant select, insert, update on public.ops_cost_allocations, public.ops_shipments to service_role;
grant select on public.ops_cost_allocations, public.ops_shipments to authenticated;

commit;
