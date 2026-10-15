-- Design Studio quote workflow. Additive and safe for populated databases.
alter table public.design_decoration_methods drop constraint if exists design_decoration_methods_method_key_check;

insert into public.design_decoration_methods
  (method_key, customer_label, available, availability_label, production_route, limits_note, draft_selectable)
values
  ('screen_printing', 'Screen Printing', false, 'Quote required', 'outside_print_vendor', 'Personalized quote and production review required.', true)
on conflict (method_key) do update set
  customer_label = excluded.customer_label,
  limits_note = excluded.limits_note,
  draft_selectable = true;

alter table public.quote_requests
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null,
  add column if not exists source text,
  add column if not exists design_id uuid references public.design_documents(id) on delete restrict,
  add column if not exists design_version_id uuid references public.design_versions(id) on delete restrict,
  add column if not exists design_checksum text,
  add column if not exists request_key text,
  add column if not exists design_snapshot jsonb,
  add column if not exists garment_selections jsonb,
  add column if not exists decoration_methods text[],
  add column if not exists placements jsonb,
  add column if not exists preview_url text,
  add column if not exists quote_terms text,
  add column if not exists quote_version integer,
  add column if not exists quote_sent_at timestamptz,
  add column if not exists quote_accepted_at timestamptz,
  add column if not exists accepted_quote_version integer,
  add column if not exists invoice_id text,
  add column if not exists invoice_status text,
  add column if not exists resulting_order_id text,
  add column if not exists customer_response_token_hash text,
  add column if not exists notification_operation_key text,
  add column if not exists notification_provider_message_id text,
  add column if not exists notification_status text,
  add column if not exists notification_error text;

create unique index if not exists quote_requests_studio_request_key_uidx
  on public.quote_requests(request_key) where request_key is not null;
create index if not exists quote_requests_design_idx on public.quote_requests(design_id, created_date desc);
create index if not exists quote_requests_owner_idx on public.quote_requests(owner_user_id, created_date desc);
create unique index if not exists orders_quote_request_once_uidx on public.orders(quote_request_id) where quote_request_id is not null;

create table if not exists public.design_quote_versions (
  id uuid primary key default gen_random_uuid(),
  quote_request_id text not null references public.quote_requests(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  customer_price numeric(12,2) not null check (customer_price > 0),
  currency text not null default 'USD' check (currency = 'USD'),
  terms text not null,
  customer_snapshot jsonb not null,
  design_version_id uuid not null references public.design_versions(id) on delete restrict,
  design_checksum text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (quote_request_id, version_number)
);
alter table public.design_quote_versions enable row level security;
drop policy if exists design_quote_versions_admin_read on public.design_quote_versions;
create policy design_quote_versions_admin_read on public.design_quote_versions for select to authenticated
  using (public.is_admin());
revoke all on public.design_quote_versions from anon, authenticated;
grant select on public.design_quote_versions to authenticated;
grant all on public.design_quote_versions to service_role;

comment on table public.design_quote_versions is
  'Immutable customer-visible quote versions. Accepted versions remain preserved after invoice/order creation.';

create or replace function public.accept_design_studio_quote(p_quote_request_id text, p_quote_version integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  q public.quote_requests%rowtype; existing_order public.orders%rowtype; created_order public.orders%rowtype;
  state public.ops_invoice_number_state%rowtype; invoice_record public.ops_shared_records%rowtype;
  year_number integer; sequence_number integer; invoice_number text; invoice_record_id text; invoice_payload jsonb;
begin
  select * into q from public.quote_requests where id = p_quote_request_id for update;
  if not found or q.source <> 'design_studio' or q.owner_user_id <> auth.uid() then raise exception 'Quote not found.' using errcode='P0002'; end if;
  if q.quote_version is null or q.quote_version <> p_quote_version or q.status <> 'quote_sent' then raise exception 'This quote version is not available for acceptance.' using errcode='22023'; end if;
  if not exists (select 1 from public.design_quote_versions v where v.quote_request_id=q.id and v.version_number=p_quote_version) then raise exception 'The immutable quote version is missing.'; end if;
  select * into existing_order from public.orders where quote_request_id=q.id;
  if found then return jsonb_build_object('duplicate_prevented',true,'order_id',existing_order.id,'invoice_id',q.invoice_id,'invoice_status',q.invoice_status); end if;

  insert into public.orders(owner_user_id,created_by_email,customer_email,customer_name,customer_phone,order_items,total_amount,balance_due,status,payment_status,has_physical_items,quote_request_id,garment_type,quantity,sizes_needed,garment_colors,print_method,print_placement,project_notes,what_to_print)
  values(q.owner_user_id,q.email,q.email,q.full_name,q.phone,jsonb_build_array(jsonb_build_object('designId',q.design_id,'designVersionId',q.design_version_id,'designChecksum',q.design_checksum,'garment',q.garment_selections,'decorationMethods',q.decoration_methods,'placements',q.placements,'previewUrl',q.preview_url)),q.customer_quote_price,q.customer_quote_price,'awaiting_payment','unpaid',true,q.id,q.product_type,q.quantity,q.sizes_needed,q.garment_colors,q.print_method,q.print_placement,q.project_notes,q.what_to_print)
  returning * into created_order;

  select * into state from public.ops_invoice_number_state where business_id='hc-apparel' for update;
  if not found or state.registry_ready is not true then raise exception 'Invoice numbering is awaiting Heart Command Center reconciliation.' using errcode='55000'; end if;
  year_number := extract(year from timezone('America/New_York',now()))::integer;
  select coalesce(max(r.sequence_number),0)+1 into sequence_number from public.ops_invoice_number_registry r where r.business_id='hc-apparel' and r.invoice_year=year_number;
  invoice_number := state.number_prefix||'-'||year_number::text||'-'||lpad(sequence_number::text,4,'0');
  invoice_record_id := 'studio-invoice:'||q.id;
  invoice_payload := jsonb_build_object(
    'id',invoice_record_id,'invoiceNumber',invoice_number,'customerName',q.full_name,'customerEmail',q.email,'customerPhone',coalesce(q.phone,''),
    'dueDate',(current_date + 7)::text,'notes','Accepted HC Apparel Design Studio quote '||q.id,
    'lineItems',jsonb_build_array(jsonb_build_object('description',coalesce(q.what_to_print,'Custom apparel design'),'quantity',1,'unitPrice',q.customer_quote_price)),
    'shippingAmount',0,'shippingPending',false,'taxRate',0,'taxStatus','reviewed','subtotal',q.customer_quote_price,'total',q.customer_quote_price,
    'status','draft','paymentStatus','unpaid','revision',1,'quoteRequestId',q.id,'designId',q.design_id,'designVersionId',q.design_version_id,
    'acceptedQuoteVersion',p_quote_version,'orderId',created_order.id,'terms',q.quote_terms
  );
  insert into public.ops_shared_records(id,business_id,record_type,source_system,source_record_id,status,payload,created_by,updated_by)
  values(invoice_record_id,'hc-apparel','invoice','hc_apparel',q.id,'draft',invoice_payload,auth.uid(),auth.uid()) returning * into invoice_record;
  insert into public.ops_invoice_number_registry(business_id,invoice_number,record_id,invoice_year,sequence_number,registered_by) values('hc-apparel',invoice_number,invoice_record_id,year_number,sequence_number,auth.uid());
  insert into public.ops_action_queue(idempotency_key,business_id,record_id,action_type,expected_revision,request_payload,requested_by)
  values((substr(md5('send:'||q.id||':'||p_quote_version),1,8)||'-'||substr(md5('send:'||q.id||':'||p_quote_version),9,4)||'-'||substr(md5('send:'||q.id||':'||p_quote_version),13,4)||'-'||substr(md5('send:'||q.id||':'||p_quote_version),17,4)||'-'||substr(md5('send:'||q.id||':'||p_quote_version),21,12))::uuid,'hc-apparel',invoice_record_id,'send_invoice',invoice_record.revision,jsonb_build_object('quoteRequestId',q.id,'acceptedQuoteVersion',p_quote_version,'orderId',created_order.id,'finalInvoice',invoice_payload),auth.uid());
  update public.quote_requests set status='approved',workflow_status='customer_approved',quote_accepted_at=now(),accepted_quote_version=p_quote_version,converted_order_id=created_order.id,resulting_order_id=created_order.id,invoice_id=invoice_record_id,invoice_status='queued' where id=q.id;
  return jsonb_build_object('duplicate_prevented',false,'order_id',created_order.id,'invoice_id',invoice_record_id,'invoice_number',invoice_number,'invoice_status','queued');
end $$;
revoke all on function public.accept_design_studio_quote(text,integer) from public;
grant execute on function public.accept_design_studio_quote(text,integer) to authenticated;
