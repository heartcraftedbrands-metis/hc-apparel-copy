begin;

-- One private accounting map for Heart Command Center and HC Apparel. The
-- operational ledger remains the source of transactions; these tables add
-- durable account identities, categorization rules, review state, and audit.

alter table public.ops_financial_transactions
  drop constraint if exists ops_financial_transactions_transaction_kind_check;
alter table public.ops_financial_transactions
  add constraint ops_financial_transactions_transaction_kind_check check (transaction_kind in (
    'customer_payment','payment_settlement','processor_fee','account_fee','refund',
    'payout','transfer','card_expense','card_refund'
  ));

alter table public.ops_financial_transactions
  add column if not exists posted_at timestamptz,
  add column if not exists source_timezone text,
  add column if not exists chart_account_id text,
  add column if not exists suggested_chart_account_id text,
  add column if not exists category_source text,
  add column if not exists category_confidence numeric(4,3),
  add column if not exists categorization_explanation text,
  add column if not exists categorization_rule_id uuid,
  add column if not exists manual_category_override boolean not null default false,
  add column if not exists spend_classification text not null default 'needs_review',
  add column if not exists transfer_pair_id text,
  add column if not exists category_updated_at timestamptz,
  add column if not exists category_updated_by uuid references auth.users(id);

alter table public.ops_financial_transactions
  drop constraint if exists ops_financial_transactions_category_source_check;
alter table public.ops_financial_transactions
  add constraint ops_financial_transactions_category_source_check check (
    category_source is null or category_source in ('source_mapping','rule','receipt','manual','suggestion')
  );
alter table public.ops_financial_transactions
  drop constraint if exists ops_financial_transactions_spend_classification_check;
alter table public.ops_financial_transactions
  add constraint ops_financial_transactions_spend_classification_check check (
    spend_classification in ('business','personal','mixed','needs_review','not_applicable')
  );

create table if not exists public.ops_chart_accounts (
  id text primary key,
  business_id text not null references public.ops_businesses(id),
  account_code text not null,
  name text not null,
  account_type text not null check (account_type in ('Assets','Liabilities','Equity','Income','Expenses')),
  parent_account_id text references public.ops_chart_accounts(id) on delete restrict,
  description text,
  system_key text,
  active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  unique (business_id, account_code),
  unique (business_id, system_key)
);

alter table public.ops_financial_transactions
  add constraint ops_financial_transactions_chart_account_fk
  foreign key (chart_account_id) references public.ops_chart_accounts(id) on delete restrict;
alter table public.ops_financial_transactions
  add constraint ops_financial_transactions_suggested_account_fk
  foreign key (suggested_chart_account_id) references public.ops_chart_accounts(id) on delete set null;

create table if not exists public.ops_categorization_rules (
  id uuid primary key default gen_random_uuid(),
  business_id text not null references public.ops_businesses(id),
  name text not null,
  description text,
  priority integer not null default 100 check (priority between 1 and 10000),
  enabled boolean not null default true,
  auto_apply boolean not null default true,
  conditions jsonb not null default '{}'::jsonb,
  target_chart_account_id text not null references public.ops_chart_accounts(id) on delete restrict,
  target_spend_classification text check (
    target_spend_classification is null or target_spend_classification in ('business','personal','mixed','needs_review','not_applicable')
  ),
  explanation text not null,
  system_rule boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  unique (business_id, name)
);

alter table public.ops_financial_transactions
  add constraint ops_financial_transactions_rule_fk
  foreign key (categorization_rule_id) references public.ops_categorization_rules(id) on delete set null;

create table if not exists public.ops_transaction_category_audit (
  id uuid primary key default gen_random_uuid(),
  financial_transaction_id text not null references public.ops_financial_transactions(id) on delete cascade,
  business_id text not null references public.ops_businesses(id),
  old_chart_account_id text references public.ops_chart_accounts(id),
  new_chart_account_id text references public.ops_chart_accounts(id),
  old_spend_classification text,
  new_spend_classification text,
  category_source text,
  categorization_rule_id uuid references public.ops_categorization_rules(id) on delete set null,
  explanation text,
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users(id)
);

create table if not exists public.ops_financial_imports (
  id uuid primary key default gen_random_uuid(),
  business_id text not null references public.ops_businesses(id),
  provider text not null default 'stripe',
  source_type text not null,
  source_hash text not null,
  source_timezone text not null,
  original_filename text,
  rows_received integer not null default 0,
  rows_upserted integer not null default 0,
  status text not null check (status in ('completed','partial','failed')),
  notes text,
  imported_at timestamptz not null default now(),
  imported_by uuid references auth.users(id),
  unique (business_id, provider, source_hash)
);

create index if not exists ops_chart_accounts_parent_idx on public.ops_chart_accounts(business_id,parent_account_id,account_code);
create index if not exists ops_categorization_rules_priority_idx on public.ops_categorization_rules(business_id,enabled,priority,id);
create index if not exists ops_financial_transactions_account_idx on public.ops_financial_transactions(business_id,chart_account_id,occurred_at desc);
create index if not exists ops_financial_transactions_transfer_idx on public.ops_financial_transactions(transfer_pair_id) where transfer_pair_id is not null;
create index if not exists ops_category_audit_transaction_idx on public.ops_transaction_category_audit(financial_transaction_id,changed_at desc);

create or replace function public.ops_touch_accounting_row()
returns trigger language plpgsql set search_path=public as $$
begin
  new.updated_at=now();
  return new;
end;
$$;

drop trigger if exists ops_chart_accounts_touch on public.ops_chart_accounts;
create trigger ops_chart_accounts_touch before update on public.ops_chart_accounts
for each row execute function public.ops_touch_accounting_row();
drop trigger if exists ops_categorization_rules_touch on public.ops_categorization_rules;
create trigger ops_categorization_rules_touch before update on public.ops_categorization_rules
for each row execute function public.ops_touch_accounting_row();

create or replace function public.ops_validate_chart_account_parent()
returns trigger language plpgsql set search_path=public as $$
declare parent_row public.ops_chart_accounts%rowtype; cursor_id text;
begin
  if new.parent_account_id is null then return new; end if;
  if new.parent_account_id=new.id then raise exception 'An account cannot be its own parent.'; end if;
  select * into parent_row from public.ops_chart_accounts where id=new.parent_account_id;
  if not found or parent_row.business_id<>new.business_id then raise exception 'Parent account must belong to the same business.'; end if;
  if parent_row.account_type<>new.account_type then raise exception 'Parent and child accounts must use the same account type.'; end if;
  cursor_id:=parent_row.parent_account_id;
  while cursor_id is not null loop
    if cursor_id=new.id then raise exception 'Account hierarchy cannot contain a cycle.'; end if;
    select parent_account_id into cursor_id from public.ops_chart_accounts where id=cursor_id;
  end loop;
  return new;
end;
$$;

drop trigger if exists ops_chart_accounts_validate_parent on public.ops_chart_accounts;
create trigger ops_chart_accounts_validate_parent before insert or update of parent_account_id,account_type,business_id
on public.ops_chart_accounts for each row execute function public.ops_validate_chart_account_parent();

create or replace function public.ops_audit_transaction_category()
returns trigger language plpgsql set search_path=public as $$
begin
  if old.chart_account_id is distinct from new.chart_account_id
     or old.spend_classification is distinct from new.spend_classification
     or old.category_source is distinct from new.category_source
     or old.categorization_rule_id is distinct from new.categorization_rule_id then
    insert into public.ops_transaction_category_audit(
      financial_transaction_id,business_id,old_chart_account_id,new_chart_account_id,
      old_spend_classification,new_spend_classification,category_source,categorization_rule_id,
      explanation,changed_by
    ) values (
      new.id,new.business_id,old.chart_account_id,new.chart_account_id,
      old.spend_classification,new.spend_classification,new.category_source,new.categorization_rule_id,
      new.categorization_explanation,new.category_updated_by
    );
  end if;
  return new;
end;
$$;

drop trigger if exists ops_financial_transaction_category_audit on public.ops_financial_transactions;
create trigger ops_financial_transaction_category_audit after update of
  chart_account_id,spend_classification,category_source,categorization_rule_id
on public.ops_financial_transactions for each row execute function public.ops_audit_transaction_category();

insert into public.ops_chart_accounts(id,business_id,account_code,name,account_type,parent_account_id,description,system_key)
values
 ('hc-apparel-1000','hc-apparel','1000','Cash and Cash Equivalents','Assets',null,'Cash and processor-held cash balances.','cash'),
 ('hc-apparel-1010','hc-apparel','1010','Stripe Payments Balance','Assets','hc-apparel-1000','Stripe payments balance before transfer.','stripe_payments_balance'),
 ('hc-apparel-1020','hc-apparel','1020','Stripe Financial Account','Assets','hc-apparel-1000','Stripe Financial Account storage balance.','stripe_financial_account'),
 ('hc-apparel-2000','hc-apparel','2000','Liabilities','Liabilities',null,'Amounts owed by HC Apparel.','liabilities'),
 ('hc-apparel-2100','hc-apparel','2100','Sales Tax Payable','Liabilities','hc-apparel-2000','Sales tax collected and not treated as revenue.','sales_tax_payable'),
 ('hc-apparel-3000','hc-apparel','3000','Owner Equity','Equity',null,'Owner equity accounts.','owner_equity'),
 ('hc-apparel-3100','hc-apparel','3100','Owner Contributions','Equity','hc-apparel-3000','Owner funding kept separate from revenue.','owner_contributions'),
 ('hc-apparel-4000','hc-apparel','4000','Sales Income','Income',null,'Revenue from apparel and related services.','sales_income'),
 ('hc-apparel-4010','hc-apparel','4010','Product Sales','Income','hc-apparel-4000','Merchandise and production sales.','product_sales'),
 ('hc-apparel-4020','hc-apparel','4020','Shipping Income','Income','hc-apparel-4000','Shipping amounts collected from customers.','shipping_income'),
 ('hc-apparel-5000','hc-apparel','5000','Expenses','Expenses',null,'Business operating and fulfillment costs.','expenses'),
 ('hc-apparel-5100','hc-apparel','5100','Supplies','Expenses','hc-apparel-5000','Supplies used in operations and production.','supplies'),
 ('hc-apparel-5110','hc-apparel','5110','Blank Apparel','Expenses','hc-apparel-5100','Blank garments purchased for production.','blank_apparel'),
 ('hc-apparel-5200','hc-apparel','5200','Production','Expenses','hc-apparel-5000','Production inputs and outsourced production.','production'),
 ('hc-apparel-5210','hc-apparel','5210','DTF Printing','Expenses','hc-apparel-5200','DTF transfers and gang-sheet printing.','dtf_printing'),
 ('hc-apparel-5300','hc-apparel','5300','Shipping','Expenses','hc-apparel-5000','Order shipping and packaging costs.','shipping'),
 ('hc-apparel-5310','hc-apparel','5310','Postage','Expenses','hc-apparel-5300','Carrier postage and mailing charges.','postage'),
 ('hc-apparel-5320','hc-apparel','5320','Packaging','Expenses','hc-apparel-5300','Boxes, mailers, labels, and packing materials.','packaging'),
 ('hc-apparel-5400','hc-apparel','5400','Food','Expenses','hc-apparel-5000','Food-related business spending; category does not establish deductibility.','food'),
 ('hc-apparel-5410','hc-apparel','5410','Meals','Expenses','hc-apparel-5400','Meals with separately documented business purpose.','meals'),
 ('hc-apparel-5500','hc-apparel','5500','Travel','Expenses','hc-apparel-5000','Business travel costs.','travel'),
 ('hc-apparel-5510','hc-apparel','5510','Fuel','Expenses','hc-apparel-5500','Vehicle fuel with separately documented purpose.','fuel'),
 ('hc-apparel-5600','hc-apparel','5600','Software and Subscriptions','Expenses','hc-apparel-5000','Software tools and recurring subscriptions.','software_subscriptions'),
 ('hc-apparel-5700','hc-apparel','5700','Advertising and Marketing','Expenses','hc-apparel-5000','Advertising, promotions, and marketing services.','advertising_marketing'),
 ('hc-apparel-5800','hc-apparel','5800','Processing and Platform Fees','Expenses','hc-apparel-5000','Payment processing, invoicing, fraud-screening, and platform fees.','processing_platform_fees')
on conflict (business_id,account_code) do update set
 name=excluded.name,account_type=excluded.account_type,parent_account_id=excluded.parent_account_id,
 description=excluded.description,system_key=excluded.system_key,active=true,archived_at=null;

create or replace function public.ops_rule_matches_transaction(p_conditions jsonb,p_transaction_id text)
returns boolean language plpgsql stable security invoker set search_path=public as $$
declare t public.ops_financial_transactions%rowtype; kinds jsonb;
begin
  select * into t from public.ops_financial_transactions where id=p_transaction_id;
  if not found then return false; end if;
  if p_conditions ? 'transactionKind' and t.transaction_kind<>p_conditions->>'transactionKind' then return false; end if;
  if p_conditions ? 'transactionKinds' then
    kinds:=p_conditions->'transactionKinds';
    if not exists(select 1 from jsonb_array_elements_text(kinds) value where value=t.transaction_kind) then return false; end if;
  end if;
  if p_conditions ? 'direction' and t.direction<>p_conditions->>'direction' then return false; end if;
  if p_conditions ? 'sourceType' and coalesce(t.source_type,'')<>p_conditions->>'sourceType' then return false; end if;
  if p_conditions ? 'merchantContains' and position(lower(p_conditions->>'merchantContains') in lower(coalesce(t.merchant_name,'')))=0 then return false; end if;
  if p_conditions ? 'descriptionContains' and position(lower(p_conditions->>'descriptionContains') in lower(coalesce(t.source_data->>'description','')))=0 then return false; end if;
  if p_conditions ? 'minimumAmountCents' and t.amount_cents<(p_conditions->>'minimumAmountCents')::bigint then return false; end if;
  if p_conditions ? 'maximumAmountCents' and t.amount_cents>(p_conditions->>'maximumAmountCents')::bigint then return false; end if;
  return true;
end;
$$;

insert into public.ops_categorization_rules(id,business_id,name,description,priority,enabled,auto_apply,conditions,target_chart_account_id,target_spend_classification,explanation,system_rule)
values
 ('11111111-1111-4111-8111-111111111101','hc-apparel','Customer payments to sales income','Maps verified customer payments to sales income without treating settlements as a second sale.',10,true,true,'{"transactionKind":"customer_payment"}','hc-apparel-4000','not_applicable','Verified customer payment transaction.',true),
 ('11111111-1111-4111-8111-111111111102','hc-apparel','Stripe fees to processing and platform fees','Maps charge-level and account-level Stripe fees to one expense account while preserving their distinct transaction kinds.',20,true,true,'{"transactionKinds":["processor_fee","account_fee"]}','hc-apparel-5800','business','Stripe fee transaction type is explicit in the provider source.',true),
 ('11111111-1111-4111-8111-111111111103','hc-apparel','USPS charges to postage','Maps USPS card charges to postage.',30,true,true,'{"transactionKind":"card_expense","merchantContains":"USPS"}','hc-apparel-5310','business','USPS merchant and linked shipment evidence identify postage.',true)
on conflict (business_id,name) do update set
 description=excluded.description,priority=excluded.priority,enabled=excluded.enabled,auto_apply=excluded.auto_apply,
 conditions=excluded.conditions,target_chart_account_id=excluded.target_chart_account_id,
 target_spend_classification=excluded.target_spend_classification,explanation=excluded.explanation,system_rule=excluded.system_rule;

create or replace function public.ops_apply_categorization_batch(p_business_id text default 'hc-apparel')
returns integer language plpgsql security definer set search_path=public as $$
declare t record; r record; changed integer:=0;
begin
  if auth.role()<>'service_role' and not public.is_admin() and not public.ops_has_permission(p_business_id,'finances') then raise exception 'Finance permission required.'; end if;
  for t in select id,manual_category_override from public.ops_financial_transactions where business_id=p_business_id order by occurred_at,id loop
    if t.manual_category_override then continue; end if;
    select * into r from public.ops_categorization_rules rule
      where rule.business_id=p_business_id and rule.enabled and public.ops_rule_matches_transaction(rule.conditions,t.id)
      order by rule.priority asc,rule.id asc limit 1;
    if found then
      update public.ops_financial_transactions set
        chart_account_id=case when r.auto_apply then r.target_chart_account_id else chart_account_id end,
        suggested_chart_account_id=r.target_chart_account_id,
        category_source=case when r.auto_apply then 'rule' else 'suggestion' end,
        category_confidence=case when r.auto_apply then 1.000 else .500 end,
        categorization_explanation=r.explanation,categorization_rule_id=r.id,
        spend_classification=case when r.auto_apply then coalesce(r.target_spend_classification,spend_classification) else spend_classification end,
        review_status=case when r.auto_apply then 'confirmed' else 'review_needed' end,
        category_updated_at=now(),category_updated_by=auth.uid()
      where id=t.id;
      changed:=changed+1;
    end if;
  end loop;
  return changed;
end;
$$;

create or replace function public.ops_set_transaction_category(
  p_transaction_id text,p_chart_account_id text,p_spend_classification text,
  p_explanation text,p_create_manual_override boolean default true
) returns public.ops_financial_transactions language plpgsql security definer set search_path=public as $$
declare result public.ops_financial_transactions%rowtype; business text;
begin
  select business_id into business from public.ops_financial_transactions where id=p_transaction_id;
  if business is null then raise exception 'Transaction not found.'; end if;
  if auth.role()<>'service_role' and not public.is_admin() and not public.ops_has_permission(business,'finances') then raise exception 'Finance permission required.'; end if;
  if not exists(select 1 from public.ops_chart_accounts where id=p_chart_account_id and business_id=business) then raise exception 'Account does not belong to the transaction business.'; end if;
  update public.ops_financial_transactions set chart_account_id=p_chart_account_id,suggested_chart_account_id=null,
    category_source='manual',category_confidence=1.000,categorization_explanation=left(coalesce(p_explanation,'Manual category correction.'),500),
    categorization_rule_id=null,manual_category_override=p_create_manual_override,
    spend_classification=p_spend_classification,review_status='confirmed',category_updated_at=now(),category_updated_by=auth.uid()
  where id=p_transaction_id returning * into result;
  return result;
end;
$$;

create or replace function public.ops_preview_categorization_rule(p_rule_id uuid)
returns table(transaction_id text,merchant_name text,description text,amount_cents bigint,current_account_id text,proposed_account_id text,manual_override boolean)
language sql stable security invoker set search_path=public as $$
  select t.id,t.merchant_name,t.source_data->>'description',t.amount_cents,t.chart_account_id,r.target_chart_account_id,t.manual_category_override
  from public.ops_categorization_rules r join public.ops_financial_transactions t on t.business_id=r.business_id
  where r.id=p_rule_id and public.ops_rule_matches_transaction(r.conditions,t.id)
  order by t.occurred_at desc,t.id;
$$;

create or replace function public.ops_import_stripe_balance_export(
  p_rows jsonb,
  p_source_hash text,
  p_original_filename text,
  p_imported_by uuid default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  item jsonb;
  provider_id text;
  row_category text;
  transaction_kind_value text;
  direction_value text;
  source_status_value text;
  row_id text;
  imported integer:=0;
  invoice_id constant text:='invoice-fab32c15-3fa9-44f8-b059-516e02c6a6d0';
  import_id uuid;
begin
  if auth.role()<>'service_role' and not public.is_admin() and not public.ops_has_permission('hc-apparel','finances') then
    raise exception 'Finance permission required.';
  end if;
  if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)=0 then raise exception 'A non-empty Stripe export is required.'; end if;
  if nullif(trim(p_source_hash),'') is null then raise exception 'Source hash is required.'; end if;

  insert into public.ops_financial_imports(
    business_id,provider,source_type,source_hash,source_timezone,original_filename,
    rows_received,rows_upserted,status,notes,imported_by
  ) values (
    'hc-apparel','stripe','balance_history_csv',p_source_hash,'UTC',p_original_filename,
    jsonb_array_length(p_rows),0,'partial','Import started; Stripe export timestamps are preserved as UTC.',p_imported_by
  ) on conflict (business_id,provider,source_hash) do update set
    original_filename=excluded.original_filename,rows_received=excluded.rows_received,
    notes=excluded.notes,imported_by=coalesce(excluded.imported_by,public.ops_financial_imports.imported_by),
    status='partial',imported_at=now()
  returning id into import_id;

  for item in select value from jsonb_array_elements(p_rows) loop
    provider_id:=nullif(trim(item->>'id'),'');
    row_category:=nullif(trim(item->>'category'),'');
    if provider_id is null then raise exception 'Stripe row is missing id.'; end if;
    transaction_kind_value:=case
      when row_category='received_debit' then 'card_expense'
      when row_category='inbound_payment' then 'payment_settlement'
      when row_category='stripe_fee' then 'account_fee'
      when row_category in ('received_credit','outbound_transfer') then 'transfer'
      else null
    end;
    if transaction_kind_value is null then raise exception 'Unsupported Stripe export category: %',coalesce(row_category,'(missing)'); end if;
    direction_value:=case when (item->>'amount')::numeric<0 then 'outflow' else 'inflow' end;
    source_status_value:=case
      when nullif(trim(item->>'failed_at'),'') is not null then 'failed'
      when nullif(trim(item->>'void_at'),'') is not null then 'void'
      when nullif(trim(item->>'posted_at'),'') is not null then 'posted'
      else 'pending'
    end;
    row_id:='stripe:balance_export:'||provider_id;

    insert into public.ops_financial_transactions(
      id,provider,provider_transaction_id,provider_account_id,business_id,transaction_kind,direction,
      amount_cents,currency,occurred_at,posted_at,source_timezone,merchant_name,merchant_category,
      source_status,source_type,source_data,source_hash,review_status,spend_classification
    ) values (
      row_id,'stripe',provider_id,nullif(trim(item->>'financial_account_id'),''),'hc-apparel',transaction_kind_value,direction_value,
      round(abs((item->>'amount')::numeric)*100)::bigint,upper(coalesce(nullif(item->>'currency',''),'usd')),
      ((item->>'created')||' UTC')::timestamptz,
      case when nullif(trim(item->>'posted_at'),'') is null then null else ((item->>'posted_at')||' UTC')::timestamptz end,
      'UTC',coalesce(nullif(trim(item->>'counterparty_name'),''),nullif(trim(item->>'description'),'')),row_category,
      source_status_value,'stripe_balance_history_csv:'||row_category,
      item || jsonb_build_object(
        'importId',import_id,'sourceHash',p_source_hash,'originalFilename',p_original_filename,
        'sourceTimezone','UTC','displayTimezone','America/New_York','importedAt',now()::text
      ),md5(item::text||':'||p_source_hash),
      case when row_category='received_debit' and item->>'counterparty_name' ilike 'RACETRAC%' then 'review_needed' else 'confirmed' end,
      case when transaction_kind_value in ('transfer','payment_settlement') then 'not_applicable'
           when transaction_kind_value='account_fee' then 'business' else 'needs_review' end
    ) on conflict (provider,provider_transaction_id,transaction_kind) do update set
      provider_account_id=excluded.provider_account_id,direction=excluded.direction,amount_cents=excluded.amount_cents,
      currency=excluded.currency,occurred_at=excluded.occurred_at,posted_at=excluded.posted_at,
      source_timezone=excluded.source_timezone,merchant_name=excluded.merchant_name,merchant_category=excluded.merchant_category,
      source_status=excluded.source_status,source_type=excluded.source_type,
      source_data=public.ops_financial_transactions.source_data||excluded.source_data,
      source_hash=excluded.source_hash,updated_at=now();
    imported:=imported+1;
  end loop;

  -- Exact, evidence-backed mappings. RaceTrac stays unclassified and visible in
  -- review because a fuel category alone would not establish business purpose.
  update public.ops_financial_transactions set
    chart_account_id='hc-apparel-5110',suggested_chart_account_id=null,category_source='receipt',category_confidence=1,
    categorization_explanation='Three blank shirts are explicitly allocated to Tina Dunn invoice HCA-2026-0002.',
    manual_category_override=true,spend_classification='business',review_status='confirmed',category_updated_at=now(),category_updated_by=p_imported_by
  where provider_transaction_id='trxn_65VZs6AoA7kjYnQYYs016VVewI8jSQktioeEIDXETLcXQ8';
  update public.ops_financial_transactions set
    chart_account_id='hc-apparel-5310',suggested_chart_account_id=null,category_source='receipt',category_confidence=1,
    categorization_explanation='USPS charge is linked to shipment 9505506617716287884250; card-last-four discrepancy remains separate.',
    manual_category_override=true,spend_classification='business',review_status='confirmed',category_updated_at=now(),category_updated_by=p_imported_by
  where provider_transaction_id='trxn_65VZucChdIhd3ZNmiSZ16VVewI8jSQktioeEIDXETLc5Ym';
  update public.ops_financial_transactions set
    chart_account_id=null,suggested_chart_account_id='hc-apparel-5510',category_source='suggestion',category_confidence=.350,
    categorization_explanation='Merchant resembles a fuel station, but the item and business purpose are unverified.',
    manual_category_override=false,spend_classification='needs_review',review_status='review_needed',category_updated_at=now(),category_updated_by=p_imported_by
  where provider_transaction_id='trxn_65VZrfLw9IRQ8SJfwPT16VVewI8jSQktioeEIDXETLcCGO';
  update public.ops_financial_transactions set
    chart_account_id='hc-apparel-5800',suggested_chart_account_id='hc-apparel-5800',category_source='source_mapping',category_confidence=1,
    categorization_explanation='Stripe export explicitly identifies a separate account-level fee.',
    manual_category_override=false,spend_classification='business',review_status='confirmed',category_updated_at=now(),category_updated_by=p_imported_by
  where provider_transaction_id in ('txn_1UO9Z977O18gAiWRn126UGAr','txn_1UNm8s77O18gAiWR0a4K9ETU');
  update public.ops_financial_transactions set
    chart_account_id='hc-apparel-1010',suggested_chart_account_id=null,category_source='source_mapping',category_confidence=1,
    categorization_explanation='Stripe payments-balance settlement; customer revenue is recorded separately and is not duplicated here.',
    manual_category_override=false,spend_classification='not_applicable',review_status='confirmed',category_updated_at=now(),category_updated_by=p_imported_by
  where provider_transaction_id='txn_3UMKvy77O18gAiWR01WF2Ng5';
  update public.ops_financial_transactions set
    chart_account_id=case when direction='inflow' then 'hc-apparel-1020' else 'hc-apparel-1010' end,
    suggested_chart_account_id=null,category_source='source_mapping',category_confidence=1,
    categorization_explanation='Paired internal transfer between Stripe Payments Balance and Stripe Financial Account; excluded from income and expenses.',
    manual_category_override=false,spend_classification='not_applicable',review_status='excluded',
    transfer_pair_id='stripe:transfer:20261014:8059',category_updated_at=now(),category_updated_by=p_imported_by
  where provider_transaction_id in ('trxn_65VZeKzj2cEh1YSkJIN16VVewI8jSQktioeEIDXETLc3cG','txn_1UQGNd77O18gAiWRt60sKzmb');

  update public.ops_financial_transactions set review_status='excluded',source_status='superseded',
    source_data=source_data||jsonb_build_object('supersededBy',case
      when id like '%michaels%' then 'stripe:balance_export:trxn_65VZs6AoA7kjYnQYYs016VVewI8jSQktioeEIDXETLcXQ8'
      when id like '%usps%' then 'stripe:balance_export:trxn_65VZucChdIhd3ZNmiSZ16VVewI8jSQktioeEIDXETLc5Ym'
      else 'stripe:balance_export:trxn_65VZrfLw9IRQ8SJfwPT16VVewI8jSQktioeEIDXETLcCGO' end)
  where id in ('stripe:evidence:michaels-5082:20261014:1196','stripe:evidence:usps-kiosk-1204599557:20261014:1500','stripe:evidence:racetrac-2329:20261014:254');
  update public.ops_reconciliation_matches set match_status='rejected',reviewed_at=now(),
    review_notes=coalesce(review_notes,'')||' Superseded by the exact posted Stripe export row; retained for audit only.'
  where financial_transaction_id in ('stripe:evidence:michaels-5082:20261014:1196','stripe:evidence:usps-kiosk-1204599557:20261014:1500');

  update public.ops_shared_records set status='recorded',sync_state='synced',payload=payload||jsonb_build_object(
    'paymentStatus','posted','paymentVerificationStatus','verified','stripeTransactionId','trxn_65VZs6AoA7kjYnQYYs016VVewI8jSQktioeEIDXETLcXQ8',
    'stripeFlowId','rd_61VZs69bfsa1txctK16VVewI8jSQktioeEIDXETLcQWm','stripeFinancialAccountId','fa_65VVi7QXKDrqYRFmRpt16VVewI8jSQktioeEIDXETLcEu0',
    'providerCreatedAt','2026-10-14T15:30:00Z','providerPostedAt','2026-10-15T14:00:00Z','sourceTimezone','UTC',
    'chartAccountId','hc-apparel-5110','chartAccountCode','5110','updatedAt',now()::text
  ) where id='expense-tina-michaels-20261014-1196';
  update public.ops_shared_records set status='recorded',sync_state='synced',payload=payload||jsonb_build_object(
    'paymentStatus','posted','paymentVerificationStatus','verified_with_receipt_card_discrepancy','stripeTransactionId','trxn_65VZucChdIhd3ZNmiSZ16VVewI8jSQktioeEIDXETLc5Ym',
    'stripeFlowId','rd_61VZucAlXY4b1sFsL16VVewI8jSQktioeEIDXETLc2N6','stripeFinancialAccountId','fa_65VVi7QXKDrqYRFmRpt16VVewI8jSQktioeEIDXETLcEu0',
    'providerCreatedAt','2026-10-14T18:12:00Z','providerPostedAt','2026-10-15T14:00:00Z','sourceTimezone','UTC',
    'chartAccountId','hc-apparel-5310','chartAccountCode','5310','cardLast4Conflict',true,'updatedAt',now()::text
  ) where id='expense-tina-usps-9505506617716287884250';
  update public.ops_shared_records set status='needs_review',sync_state='synced',payload=payload||jsonb_build_object(
    'paymentStatus','posted','paymentVerificationStatus','verified_transaction_unclassified','stripeTransactionId','trxn_65VZrfLw9IRQ8SJfwPT16VVewI8jSQktioeEIDXETLcCGO',
    'stripeFlowId','rd_61VZrfLd9fJum98Fw16VVewI8jSQktioeEIDXETLcTXM','stripeFinancialAccountId','fa_65VVi7QXKDrqYRFmRpt16VVewI8jSQktioeEIDXETLcEu0',
    'providerCreatedAt','2026-10-14T15:03:00Z','providerPostedAt','2026-10-15T14:00:00Z','sourceTimezone','UTC',
    'category','Unclassified','suggestedChartAccountId','hc-apparel-5510','reviewStatus','needs_review','updatedAt',now()::text
  ) where id='expense-racetrac-2329-20261014-254';

  insert into public.ops_shared_records(id,business_id,record_type,source_system,source_record_id,status,payload,sync_state)
  values
    ('expense-stripe-invoicing-starter-20261007-033','hc-apparel','expense','heart_command_center','txn_1UNm8s77O18gAiWR0a4K9ETU','recorded',jsonb_build_object(
      'id','expense-stripe-invoicing-starter-20261007-033','businessId','hc-apparel','date','2026-10-07','vendor','Stripe',
      'amount',.33,'currency','USD','category','Processing and Platform Fees','description','Invoicing Starter fee for Tina Dunn invoice HCA-2026-0002',
      'expenseType','stripe_account_fee','invoiceId',invoice_id,'invoiceNumber','HCA-2026-0002','paymentStatus','posted',
      'paymentVerificationStatus','verified','stripeTransactionId','txn_1UNm8s77O18gAiWR0a4K9ETU','chartAccountId','hc-apparel-5800','chartAccountCode','5800',
      'receiptRequired',false,'receiptExemptReason','Original provider balance-history row retained as financial evidence.',
      'sourceSystem','stripe','sourceRecordId','txn_1UNm8s77O18gAiWR0a4K9ETU','record_environment','production','include_in_business_reporting',true,'createdAt',now()::text,'updatedAt',now()::text
    ),'synced'),
    ('expense-stripe-radar-standard-20261007-005','hc-apparel','expense','heart_command_center','txn_1UO9Z977O18gAiWRn126UGAr','recorded',jsonb_build_object(
      'id','expense-stripe-radar-standard-20261007-005','businessId','hc-apparel','date','2026-10-08','vendor','Stripe',
      'amount',.05,'currency','USD','category','Processing and Platform Fees','description','Radar Standard fee associated with Tina Dunn payment activity',
      'expenseType','stripe_account_fee','invoiceId',invoice_id,'invoiceNumber','HCA-2026-0002','paymentStatus','posted',
      'paymentVerificationStatus','verified','stripeTransactionId','txn_1UO9Z977O18gAiWRn126UGAr','chartAccountId','hc-apparel-5800','chartAccountCode','5800',
      'receiptRequired',false,'receiptExemptReason','Original provider balance-history row retained as financial evidence.',
      'sourceSystem','stripe','sourceRecordId','txn_1UO9Z977O18gAiWRn126UGAr','record_environment','production','include_in_business_reporting',true,'createdAt',now()::text,'updatedAt',now()::text
    ),'synced')
  on conflict(id) do update set status=excluded.status,payload=public.ops_shared_records.payload||excluded.payload,sync_state='synced';

  insert into public.ops_reconciliation_matches(financial_transaction_id,shared_record_id,relationship,match_status,confidence,evidence,reviewed_at,review_notes)
  values
    ('stripe:balance_export:trxn_65VZs6AoA7kjYnQYYs016VVewI8jSQktioeEIDXETLcXQ8',invoice_id,'blank_garments','confirmed',1,jsonb_build_array(jsonb_build_object('type','exact_transaction_and_existing_allocation')),now(),'Exact posted transaction preserves the confirmed three-shirt allocation.'),
    ('stripe:balance_export:trxn_65VZucChdIhd3ZNmiSZ16VVewI8jSQktioeEIDXETLc5Ym',invoice_id,'postage','confirmed',1,jsonb_build_array(jsonb_build_object('type','exact_transaction_and_tracking','trackingNumber','9505506617716287884250')),now(),'Exact posted transaction confirms payment; receipt card-last-four discrepancy is preserved separately.'),
    ('stripe:balance_export:txn_3UMKvy77O18gAiWR01WF2Ng5',invoice_id,'payment_settlement','auto_confirmed',1,jsonb_build_array(jsonb_build_object('type','counterparty_amount_charge','gross',83.70,'fee',2.73,'net',80.97)),now(),'Settlement for Tina Dunn payment; not a second revenue record.'),
    ('stripe:balance_export:txn_1UNm8s77O18gAiWR0a4K9ETU',invoice_id,'platform_fee','auto_confirmed',1,jsonb_build_array(jsonb_build_object('type','settlement_transfer_tie_out','settlementNet',80.97,'pairedTransfer',80.59,'combinedAccountFees',.38)),now(),'Invoicing fee plus Radar fee exactly explains settlement-to-transfer difference.'),
    ('stripe:balance_export:txn_1UO9Z977O18gAiWRn126UGAr',invoice_id,'platform_fee','auto_confirmed',1,jsonb_build_array(jsonb_build_object('type','settlement_transfer_tie_out','settlementNet',80.97,'pairedTransfer',80.59,'combinedAccountFees',.38)),now(),'Radar fee plus Invoicing fee exactly explains settlement-to-transfer difference.')
  on conflict(financial_transaction_id,shared_record_id,relationship) do update set match_status=excluded.match_status,confidence=excluded.confidence,
    evidence=excluded.evidence,reviewed_at=excluded.reviewed_at,review_notes=excluded.review_notes;

  insert into public.ops_cost_allocations(id,business_id,shared_record_id,expense_record_id,relationship,allocated_amount_cents,currency,allocation_status,payment_verification_status,evidence,source_hash,reviewed_at,review_notes)
  values
    ('cost:tina:stripe-invoicing:20261007','hc-apparel',invoice_id,'expense-stripe-invoicing-starter-20261007-033','platform_fee',33,'USD','confirmed','verified',jsonb_build_array(jsonb_build_object('type','stripe_export_row','transactionId','txn_1UNm8s77O18gAiWR0a4K9ETU')),md5(p_source_hash||':invoicing'),now(),'Separate account fee; not included in the $2.73 charge processing fee.'),
    ('cost:tina:stripe-radar:20261007','hc-apparel',invoice_id,'expense-stripe-radar-standard-20261007-005','platform_fee',5,'USD','confirmed','verified',jsonb_build_array(jsonb_build_object('type','stripe_export_row','transactionId','txn_1UO9Z977O18gAiWRn126UGAr')),md5(p_source_hash||':radar'),now(),'Separate account fee; not included in the $2.73 charge processing fee.')
  on conflict(shared_record_id,expense_record_id,relationship) do update set allocated_amount_cents=excluded.allocated_amount_cents,
    allocation_status=excluded.allocation_status,payment_verification_status=excluded.payment_verification_status,evidence=excluded.evidence,
    source_hash=excluded.source_hash,reviewed_at=excluded.reviewed_at,review_notes=excluded.review_notes;

  update public.ops_shared_records set payload=payload||jsonb_build_object(
    'updatedAt',now()::text,
    'accountPlatformFees',.38,
    'financialReconciliation',coalesce(payload->'financialReconciliation','{}'::jsonb)||jsonb_build_object(
      'status','incomplete','checkedAt',now()::text,
      'source','Stripe balance-history CSV import plus preserved private cost and shipment evidence',
      'stripeExport',jsonb_build_object('sourceHash',p_source_hash,'sourceTimezone','UTC','rowsImported',imported,'automaticApiRetrieval',false),
      'relatedCosts',jsonb_build_object('verifiedActualCosts',58.76,'verifiedAccountPlatformFees',.38,'totalVerifiedCostsAndAccountFees',59.14,'reviewQueueCount',1,'complete',false,'paymentVerificationSeparate',true),
      'margin',jsonb_build_object('final',null,'complete',false,'knownAmountAfterVerifiedCostsAndFees',21.83,'grossCollected',83.70,'processingFee',2.73,'accountPlatformFees',.38,'verifiedCosts',58.76),
      'transferReconciliation',jsonb_build_object('settlementNet',80.97,'accountPlatformFees',.38,'pairedTransferAmount',80.59,'balanced',true,'excludedFromIncomeAndExpenses',true)
    )
  ) where id=invoice_id and record_type='invoice';

  update public.ops_financial_sync_state set
    status=case when status='failed' then 'partial' else status end,
    capability_status=capability_status||jsonb_build_object(
      'balanceHistoryCsv',jsonb_build_object('status','imported','sourceHash',p_source_hash,'rows',imported,'timezone','UTC','importedAt',now()::text),
      'automaticBalanceTransactionApi',coalesce(capability_status->'automaticBalanceTransactionApi',jsonb_build_object('status','not_verified')),
      'categorization',jsonb_build_object('status','active','chartOfAccounts','shared','ruleEngine','active')
    ),records_seen=greatest(records_seen,imported),records_upserted=records_upserted+imported,updated_at=now()
  where source='stripe';
  update public.ops_financial_imports set rows_upserted=imported,status='completed',
    notes='All rows imported with original IDs. UTC source timestamps preserved; Eastern display is an application concern.'
  where id=import_id;

  return jsonb_build_object(
    'importId',import_id,'rowsReceived',jsonb_array_length(p_rows),'rowsUpserted',imported,'sourceHash',p_source_hash,
    'sourceTimezone','UTC','tina',jsonb_build_object('gross',83.70,'processingFee',2.73,'net',80.97,'accountPlatformFees',.38,'pairedTransfer',80.59,'knownIncompleteRemainder',21.83),
    'transfersExcluded',2,'reviewQueue',jsonb_build_array('stripe:balance_export:trxn_65VZrfLw9IRQ8SJfwPT16VVewI8jSQktioeEIDXETLcCGO')
  );
end;
$$;

create or replace function public.ops_apply_categorization_rule(p_rule_id uuid,p_retroactive boolean default false)
returns integer language plpgsql security definer set search_path=public as $$
declare r public.ops_categorization_rules%rowtype; affected integer:=0;
begin
  select * into r from public.ops_categorization_rules where id=p_rule_id;
  if not found then raise exception 'Rule not found.'; end if;
  if auth.role()<>'service_role' and not public.is_admin() and not public.ops_has_permission(r.business_id,'finances') then raise exception 'Finance permission required.'; end if;
  if not p_retroactive then return 0; end if;
  update public.ops_financial_transactions t set
    chart_account_id=case when r.auto_apply then r.target_chart_account_id else t.chart_account_id end,
    suggested_chart_account_id=r.target_chart_account_id,
    category_source=case when r.auto_apply then 'rule' else 'suggestion' end,
    category_confidence=case when r.auto_apply then 1.000 else .500 end,
    categorization_explanation=r.explanation,categorization_rule_id=r.id,
    spend_classification=case when r.auto_apply then coalesce(r.target_spend_classification,t.spend_classification) else t.spend_classification end,
    review_status=case when r.auto_apply then 'confirmed' else 'review_needed' end,
    category_updated_at=now(),category_updated_by=auth.uid()
  where t.business_id=r.business_id and not t.manual_category_override and public.ops_rule_matches_transaction(r.conditions,t.id);
  get diagnostics affected=row_count;
  return affected;
end;
$$;

alter table public.ops_reconciliation_matches drop constraint if exists ops_reconciliation_matches_relationship_check;
alter table public.ops_reconciliation_matches add constraint ops_reconciliation_matches_relationship_check check (relationship in (
  'customer_payment','payment_settlement','processor_fee','platform_fee','blank_garments','transfers_printing','postage','packaging','other_cost'
));

alter table public.ops_cost_allocations drop constraint if exists ops_cost_allocations_relationship_check;
alter table public.ops_cost_allocations add constraint ops_cost_allocations_relationship_check check (relationship in (
  'blank_garments','transfers_printing','postage','packaging','production_labor','platform_fee','other_cost'
));

alter table public.ops_chart_accounts enable row level security;
alter table public.ops_categorization_rules enable row level security;
alter table public.ops_transaction_category_audit enable row level security;
alter table public.ops_financial_imports enable row level security;

create policy ops_chart_accounts_access on public.ops_chart_accounts for all to authenticated
using (public.is_admin() or public.ops_has_permission(business_id,'finances'))
with check (public.is_admin() or public.ops_has_permission(business_id,'finances'));
create policy ops_categorization_rules_access on public.ops_categorization_rules for all to authenticated
using (public.is_admin() or public.ops_has_permission(business_id,'finances'))
with check (public.is_admin() or public.ops_has_permission(business_id,'finances'));
create policy ops_category_audit_read on public.ops_transaction_category_audit for select to authenticated
using (public.is_admin() or public.ops_has_permission(business_id,'finances'));
create policy ops_financial_imports_read on public.ops_financial_imports for select to authenticated
using (public.is_admin() or public.ops_has_permission(business_id,'finances'));

revoke all on public.ops_chart_accounts,public.ops_categorization_rules,public.ops_transaction_category_audit,public.ops_financial_imports from anon;
grant select,insert,update on public.ops_chart_accounts,public.ops_categorization_rules to authenticated;
grant select on public.ops_transaction_category_audit,public.ops_financial_imports to authenticated;
grant all on public.ops_chart_accounts,public.ops_categorization_rules,public.ops_transaction_category_audit,public.ops_financial_imports to service_role;
grant execute on function public.ops_rule_matches_transaction(jsonb,text),public.ops_apply_categorization_batch(text),
 public.ops_set_transaction_category(text,text,text,text,boolean),public.ops_preview_categorization_rule(uuid),
 public.ops_apply_categorization_rule(uuid,boolean),public.ops_import_stripe_balance_export(jsonb,text,text,uuid) to authenticated,service_role;

commit;
