alter table public.quote_requests
add column if not exists workflow_status text not null default 'quote_request_received',
add column if not exists vendor_product_name text,
add column if not exists vendor_style_number text,
add column if not exists vendor_sku text,
add column if not exists selected_color text,
add column if not exists selected_size text,
add column if not exists shipping_method text,
add column if not exists customer_notes text,
add column if not exists payment_link_sent_at timestamptz,
add column if not exists payment_received_at timestamptz;

alter table public.quote_requests
drop constraint if exists quote_requests_workflow_status_check;
alter table public.quote_requests
add constraint quote_requests_workflow_status_check check (
  workflow_status in (
    'quote_request_received',
    'quote_reviewed',
    'customer_approved',
    'payment_link_sent',
    'payment_received',
    'vendor_order_draft_created',
    'vendor_order_reviewed',
    'ready_to_submit_to_ss',
    'submitted_to_ss',
    'vendor_order_confirmed',
    'tracking_received',
    'completed'
  )
);

update public.quote_requests
set workflow_status = case
  when status = 'converted_to_order' then 'vendor_order_draft_created'
  when status = 'approved' then 'customer_approved'
  when status in ('reviewing', 'waiting_on_customer', 'quote_sent') then 'quote_reviewed'
  else 'quote_request_received'
end
where workflow_status = 'quote_request_received';

alter table public.vendor_order_drafts
add column if not exists quote_request_id text,
add column if not exists workflow_status text not null default 'vendor_order_draft_created',
add column if not exists customer_phone text,
add column if not exists shipping_address jsonb not null default '{}'::jsonb,
add column if not exists shipping_method text,
add column if not exists garment_cost numeric not null default 0,
add column if not exists sale_price numeric not null default 0,
add column if not exists estimated_profit numeric not null default 0,
add column if not exists admin_notes text,
add column if not exists customer_notes text,
add column if not exists payment_status text not null default 'unpaid',
add column if not exists payment_link_sent_at timestamptz,
add column if not exists payment_received_at timestamptz,
add column if not exists test_validation jsonb,
add column if not exists validation_passed boolean not null default false,
add column if not exists ss_api_connected boolean not null default false,
add column if not exists last_tested_at timestamptz,
add column if not exists last_tested_by uuid references auth.users(id) on delete set null,
add column if not exists live_submission_enabled boolean not null default false,
add column if not exists safety_mode_message text not null default 'Do Not Submit Live Order Yet';

alter table public.vendor_order_drafts
drop constraint if exists vendor_order_drafts_workflow_status_check;
alter table public.vendor_order_drafts
add constraint vendor_order_drafts_workflow_status_check check (
  workflow_status in (
    'quote_request_received',
    'quote_reviewed',
    'customer_approved',
    'payment_link_sent',
    'payment_received',
    'vendor_order_draft_created',
    'vendor_order_reviewed',
    'ready_to_submit_to_ss',
    'submitted_to_ss',
    'vendor_order_confirmed',
    'tracking_received',
    'completed'
  )
);

alter table public.vendor_order_drafts
drop constraint if exists vendor_order_drafts_payment_status_check;
alter table public.vendor_order_drafts
add constraint vendor_order_drafts_payment_status_check check (
  payment_status in ('unpaid', 'payment_link_sent', 'paid', 'refunded')
);

alter table public.vendor_order_drafts
drop constraint if exists vendor_order_drafts_live_submission_disabled_check;
alter table public.vendor_order_drafts
add constraint vendor_order_drafts_live_submission_disabled_check
check (live_submission_enabled = false);

create index if not exists idx_quote_requests_workflow_status
on public.quote_requests(workflow_status, created_date desc);

create index if not exists idx_vendor_order_drafts_quote_request
on public.vendor_order_drafts(quote_request_id);

create index if not exists idx_vendor_order_drafts_workflow_status
on public.vendor_order_drafts(workflow_status, created_date desc);

create table if not exists public.vendor_order_status_history (
  id text primary key default gen_random_uuid()::text,
  changed_at timestamptz not null default now(),
  entity_type text not null check (entity_type in ('quote_request', 'vendor_order_draft')),
  entity_id text not null,
  draft_id text references public.vendor_order_drafts(id) on delete cascade,
  quote_request_id text,
  customer_order_id text,
  from_status text,
  to_status text not null,
  admin_note text,
  customer_note text,
  changed_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_vendor_order_status_history_entity
on public.vendor_order_status_history(entity_type, entity_id, changed_at);

create index if not exists idx_vendor_order_status_history_draft
on public.vendor_order_status_history(draft_id, changed_at);

alter table public.vendor_order_status_history enable row level security;

drop policy if exists admin_select_vendor_order_status_history
on public.vendor_order_status_history;
create policy admin_select_vendor_order_status_history
on public.vendor_order_status_history
for select to authenticated
using (public.is_admin());

revoke all on public.vendor_order_status_history
from public, anon, authenticated;
grant select on public.vendor_order_status_history
to authenticated;

create or replace function public.log_ss_vendor_workflow_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_status text;
  v_draft_id text;
  v_quote_request_id text;
  v_customer_order_id text;
  v_admin_note text;
  v_customer_note text;
begin
  v_old_status := case when tg_op = 'INSERT' then null else old.workflow_status end;

  if tg_op = 'UPDATE' and v_old_status is not distinct from new.workflow_status then
    return new;
  end if;

  if tg_table_name = 'quote_requests' then
    v_quote_request_id := new.id;
    v_customer_order_id := new.converted_order_id;
    v_admin_note := new.admin_notes;
    v_customer_note := new.customer_notes;
  else
    v_draft_id := new.id;
    v_quote_request_id := new.quote_request_id;
    v_customer_order_id := new.customer_order_id;
    v_admin_note := new.admin_notes;
    v_customer_note := new.customer_notes;
  end if;

  insert into public.vendor_order_status_history (
    entity_type,
    entity_id,
    draft_id,
    quote_request_id,
    customer_order_id,
    from_status,
    to_status,
    admin_note,
    customer_note,
    changed_by
  )
  values (
    case when tg_table_name = 'quote_requests' then 'quote_request' else 'vendor_order_draft' end,
    new.id,
    v_draft_id,
    v_quote_request_id,
    v_customer_order_id,
    v_old_status,
    new.workflow_status,
    v_admin_note,
    v_customer_note,
    auth.uid()
  );

  return new;
end;
$$;

drop trigger if exists quote_requests_log_vendor_workflow_status
on public.quote_requests;
create trigger quote_requests_log_vendor_workflow_status
after insert or update of workflow_status on public.quote_requests
for each row execute function public.log_ss_vendor_workflow_status_change();

drop trigger if exists vendor_order_drafts_log_workflow_status
on public.vendor_order_drafts;
create trigger vendor_order_drafts_log_workflow_status
after insert or update of workflow_status on public.vendor_order_drafts
for each row execute function public.log_ss_vendor_workflow_status_change();

create or replace function public.enforce_ss_vendor_order_safety_mode()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if lower(coalesce(new.vendor_name, '')) in ('s&s activewear', 's&s') then
    if new.live_submission_enabled then
      raise exception 'Do Not Submit Live Order Yet safety mode is enabled'
        using errcode = '55000';
    end if;

    if new.workflow_status in (
      'submitted_to_ss',
      'vendor_order_confirmed',
      'tracking_received',
      'completed'
    ) then
      raise exception 'Do Not Submit Live Order Yet safety mode is enabled'
        using errcode = '55000';
    end if;

    if new.vendor_status not in ('draft', 'ready_to_order', 'cancelled') then
      raise exception 'Live S&S vendor status changes are disabled'
        using errcode = '55000';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists vendor_order_drafts_enforce_ss_safety_mode
on public.vendor_order_drafts;
create trigger vendor_order_drafts_enforce_ss_safety_mode
before insert or update on public.vendor_order_drafts
for each row execute function public.enforce_ss_vendor_order_safety_mode();

create or replace function public.get_ss_vendor_order_draft_validation(
  p_draft_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft public.vendor_order_drafts%rowtype;
  v_items jsonb;
  v_item_count integer;
  v_missing_product integer;
  v_missing_style integer;
  v_missing_sku integer;
  v_missing_color integer;
  v_missing_size integer;
  v_missing_quantity integer;
  v_missing_garment_cost integer;
  v_missing_sale_price integer;
  v_shipping_complete boolean;
  v_payment_received boolean;
  v_payload_valid boolean;
  v_warnings jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  select draft.*
  into v_draft
  from public.vendor_order_drafts draft
  where draft.id = p_draft_id;

  if not found then
    raise exception 'S&S vendor order draft not found'
      using errcode = 'P0002';
  end if;

  v_items := case
    when jsonb_typeof(v_draft.items) = 'array' then v_draft.items
    else '[]'::jsonb
  end;

  select
    count(*)::integer,
    count(*) filter (where nullif(btrim(item ->> 'product_name'), '') is null)::integer,
    count(*) filter (where nullif(btrim(item ->> 'style_number'), '') is null)::integer,
    count(*) filter (where nullif(btrim(item ->> 'sku'), '') is null)::integer,
    count(*) filter (where nullif(btrim(item ->> 'color'), '') is null)::integer,
    count(*) filter (where nullif(btrim(item ->> 'size'), '') is null)::integer,
    count(*) filter (
      where case
        when coalesce(item ->> 'quantity', '') ~ '^\s*[+-]?(\d+(\.\d*)?|\.\d+)\s*$'
          then (item ->> 'quantity')::numeric
        else 0
      end <= 0
    )::integer,
    count(*) filter (
      where case
        when coalesce(item ->> 'garment_cost', '') ~ '^\s*[+-]?(\d+(\.\d*)?|\.\d+)\s*$'
          then (item ->> 'garment_cost')::numeric
        else -1
      end < 0
    )::integer,
    count(*) filter (
      where case
        when coalesce(item ->> 'sale_price', '') ~ '^\s*[+-]?(\d+(\.\d*)?|\.\d+)\s*$'
          then (item ->> 'sale_price')::numeric
        else 0
      end <= 0
    )::integer
  into
    v_item_count,
    v_missing_product,
    v_missing_style,
    v_missing_sku,
    v_missing_color,
    v_missing_size,
    v_missing_quantity,
    v_missing_garment_cost,
    v_missing_sale_price
  from jsonb_array_elements(v_items) item;

  v_shipping_complete :=
    nullif(btrim(coalesce(
      v_draft.shipping_address ->> 'street',
      v_draft.shipping_address ->> 'line1',
      v_draft.shipping_address ->> 'address1'
    )), '') is not null
    and nullif(btrim(v_draft.shipping_address ->> 'city'), '') is not null
    and nullif(btrim(v_draft.shipping_address ->> 'state'), '') is not null
    and nullif(btrim(coalesce(
      v_draft.shipping_address ->> 'zip',
      v_draft.shipping_address ->> 'postal_code'
    )), '') is not null
    and nullif(btrim(v_draft.shipping_method), '') is not null;

  v_payment_received :=
    v_draft.payment_status = 'paid'
    or exists (
      select 1
      from public.orders customer_order
      where customer_order.id = v_draft.customer_order_id
        and customer_order.payment_status = 'paid'
    );

  if v_item_count = 0 then
    v_warnings := v_warnings || jsonb_build_array('No product items');
  end if;
  if v_missing_sku > 0 then
    v_warnings := v_warnings || jsonb_build_array('Missing SKU');
  end if;
  if v_missing_size > 0 then
    v_warnings := v_warnings || jsonb_build_array('Missing size');
  end if;
  if v_missing_color > 0 then
    v_warnings := v_warnings || jsonb_build_array('Missing color');
  end if;
  if v_missing_quantity > 0 then
    v_warnings := v_warnings || jsonb_build_array('Missing quantity');
  end if;
  if not v_shipping_complete then
    v_warnings := v_warnings || jsonb_build_array('Missing shipping address or shipping method');
  end if;
  if not v_payment_received then
    v_warnings := v_warnings || jsonb_build_array('Unpaid order');
  end if;
  if v_missing_product > 0 or v_missing_style > 0
    or v_missing_garment_cost > 0 or v_missing_sale_price > 0 then
    v_warnings := v_warnings || jsonb_build_array('Required product or price fields are incomplete');
  end if;

  v_payload_valid :=
    v_item_count > 0
    and v_missing_product = 0
    and v_missing_style = 0
    and v_missing_sku = 0
    and v_missing_color = 0
    and v_missing_size = 0
    and v_missing_quantity = 0
    and v_missing_garment_cost = 0
    and v_missing_sale_price = 0
    and v_shipping_complete
    and v_payment_received;

  return jsonb_build_object(
    'draft_id', v_draft.id,
    'vendor', 'S&S Activewear',
    'safety_mode', true,
    'safety_message', 'Do Not Submit Live Order Yet',
    'live_submission_enabled', false,
    'payload_valid', v_payload_valid,
    'payment_received', v_payment_received,
    'shipping_complete', v_shipping_complete,
    'warnings', v_warnings,
    'summary', jsonb_build_object(
      'item_count', v_item_count,
      'missing_product_count', v_missing_product,
      'missing_style_count', v_missing_style,
      'missing_sku_count', v_missing_sku,
      'missing_color_count', v_missing_color,
      'missing_size_count', v_missing_size,
      'missing_quantity_count', v_missing_quantity,
      'missing_garment_cost_count', v_missing_garment_cost,
      'missing_sale_price_count', v_missing_sale_price
    ),
    'payload', jsonb_build_object(
      'purchase_order_number', v_draft.vendor_order_number,
      'shipping_address', v_draft.shipping_address,
      'shipping_method', v_draft.shipping_method,
      'items', v_items,
      'notes', v_draft.notes
    )
  );
end;
$$;

revoke all on function public.get_ss_vendor_order_draft_validation(text)
from public, anon;
grant execute on function public.get_ss_vendor_order_draft_validation(text)
to authenticated;

create or replace function public.record_ss_vendor_order_test_result(
  p_draft_id text,
  p_result jsonb
)
returns public.vendor_order_drafts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft public.vendor_order_drafts%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  update public.vendor_order_drafts draft
  set
    test_validation = p_result,
    validation_passed =
      coalesce((p_result ->> 'payload_valid')::boolean, false)
      and coalesce((p_result ->> 'api_connected')::boolean, false),
    ss_api_connected = coalesce((p_result ->> 'api_connected')::boolean, false),
    last_tested_at = now(),
    last_tested_by = auth.uid(),
    workflow_status = case
      when coalesce((p_result ->> 'api_connected')::boolean, false)
        and coalesce((p_result ->> 'payload_valid')::boolean, false)
        then draft.workflow_status
      when draft.workflow_status = 'ready_to_submit_to_ss'
        then 'vendor_order_reviewed'
      else draft.workflow_status
    end,
    vendor_status = case
      when coalesce((p_result ->> 'api_connected')::boolean, false)
        and coalesce((p_result ->> 'payload_valid')::boolean, false)
        then draft.vendor_status
      else 'draft'
    end
  where draft.id = p_draft_id
  returning draft.* into v_draft;

  if not found then
    raise exception 'S&S vendor order draft not found'
      using errcode = 'P0002';
  end if;

  return v_draft;
end;
$$;

revoke all on function public.record_ss_vendor_order_test_result(text, jsonb)
from public, anon;
grant execute on function public.record_ss_vendor_order_test_result(text, jsonb)
to authenticated;

create or replace function public.create_ss_vendor_order_draft_from_quote(
  p_quote_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote public.quote_requests%rowtype;
  v_existing public.vendor_order_drafts%rowtype;
  v_order public.orders%rowtype;
  v_draft public.vendor_order_drafts%rowtype;
  v_items jsonb;
  v_shipping jsonb;
  v_is_paid boolean;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  select draft.*
  into v_existing
  from public.vendor_order_drafts draft
  where draft.quote_request_id = p_quote_request_id
  order by draft.created_date desc
  limit 1;

  if found then
    return jsonb_build_object(
      'created', false,
      'draft_id', v_existing.id,
      'customer_order_id', v_existing.customer_order_id,
      'workflow_status', v_existing.workflow_status
    );
  end if;

  select quote_request.*
  into v_quote
  from public.quote_requests quote_request
  where quote_request.id = p_quote_request_id
  for update;

  if not found then
    raise exception 'Quote request not found'
      using errcode = 'P0002';
  end if;

  if v_quote.status not in ('approved', 'converted_to_order')
    and v_quote.workflow_status not in (
      'customer_approved',
      'payment_link_sent',
      'payment_received',
      'vendor_order_draft_created'
    ) then
    raise exception 'The quote request must be customer approved before creating a vendor order draft';
  end if;

  v_is_paid :=
    v_quote.workflow_status in ('payment_received', 'vendor_order_draft_created')
    and v_quote.payment_received_at is not null;

  v_items := jsonb_build_array(jsonb_build_object(
    'product_id', null,
    'product_name', coalesce(nullif(v_quote.vendor_product_name, ''), nullif(v_quote.preferred_garment_style, ''), v_quote.product_type),
    'brand', coalesce(nullif(v_quote.assigned_vendor_name, ''), 'S&S Activewear'),
    'style_number', v_quote.vendor_style_number,
    'sku', v_quote.vendor_sku,
    'color', coalesce(nullif(v_quote.selected_color, ''), v_quote.garment_colors),
    'size', coalesce(nullif(v_quote.selected_size, ''), v_quote.sizes_needed),
    'quantity', coalesce(v_quote.quantity, 0),
    'garment_cost', coalesce(v_quote.blank_garment_cost, 0),
    'sale_price', coalesce(v_quote.customer_quote_price, 0),
    'estimated_profit', coalesce(v_quote.estimated_profit, 0),
    'notes', v_quote.project_notes
  ));

  v_shipping := jsonb_build_object(
    'street', v_quote.shipping_street,
    'city', v_quote.shipping_city,
    'state', v_quote.shipping_state,
    'zip', v_quote.shipping_zip,
    'local_pickup', coalesce(v_quote.local_pickup, false)
  );

  if v_quote.converted_order_id is not null then
    select customer_order.*
    into v_order
    from public.orders customer_order
    where customer_order.id = v_quote.converted_order_id;
  end if;

  if v_order.id is null then
    insert into public.orders (
      owner_user_id,
      created_by_email,
      customer_email,
      customer_name,
      customer_phone,
      business_name,
      preferred_contact,
      order_items,
      total_amount,
      amount_paid,
      balance_due,
      status,
      payment_status,
      payment_date,
      has_physical_items,
      shipping_address,
      delivery_notes,
      notes,
      internal_notes,
      quote_request_id,
      assigned_vendor_name,
      vendor_cost_estimate,
      estimated_profit,
      garment_type,
      quantity,
      sizes_needed,
      garment_colors,
      print_method,
      date_needed,
      project_notes
    )
    values (
      auth.uid(),
      (select email from auth.users where id = auth.uid()),
      v_quote.email,
      v_quote.full_name,
      v_quote.phone,
      v_quote.business_name,
      v_quote.preferred_contact,
      v_items,
      coalesce(v_quote.customer_quote_price, 0),
      case when v_is_paid then coalesce(v_quote.customer_quote_price, 0) else 0 end,
      case when v_is_paid then 0 else coalesce(v_quote.customer_quote_price, 0) end,
      case when v_is_paid then 'paid' else 'awaiting_payment' end,
      case when v_is_paid then 'paid' else 'unpaid' end,
      case when v_is_paid then v_quote.payment_received_at else null end,
      true,
      v_shipping,
      v_quote.delivery_notes,
      v_quote.customer_notes,
      v_quote.admin_notes,
      v_quote.id,
      'S&S Activewear',
      coalesce(v_quote.vendor_estimate_total, 0),
      coalesce(v_quote.estimated_profit, 0),
      v_quote.product_type,
      v_quote.quantity,
      v_quote.sizes_needed,
      v_quote.garment_colors,
      v_quote.print_method,
      v_quote.date_needed::text,
      v_quote.project_notes
    )
    returning * into v_order;
  end if;

  insert into public.vendor_order_drafts (
    owner_user_id,
    created_by_email,
    vendor_order_number,
    customer_order_id,
    customer_order_number,
    quote_request_id,
    customer_name,
    customer_email,
    customer_phone,
    order_date,
    vendor_status,
    workflow_status,
    vendor_name,
    items,
    notes,
    shipping_address,
    shipping_method,
    garment_cost,
    sale_price,
    estimated_profit,
    admin_notes,
    customer_notes,
    payment_status,
    payment_link_sent_at,
    payment_received_at,
    has_sku_warnings,
    has_missing_warnings,
    total_quantity,
    item_count,
    live_submission_enabled,
    safety_mode_message
  )
  values (
    auth.uid(),
    (select email from auth.users where id = auth.uid()),
    'SS-DRAFT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
    v_order.id,
    upper(right(v_order.id, 8)),
    v_quote.id,
    v_quote.full_name,
    v_quote.email,
    v_quote.phone,
    now(),
    'draft',
    'vendor_order_draft_created',
    'S&S Activewear',
    v_items,
    v_quote.project_notes,
    v_shipping,
    v_quote.shipping_method,
    coalesce(v_quote.blank_garment_cost, 0),
    coalesce(v_quote.customer_quote_price, 0),
    coalesce(v_quote.estimated_profit, 0),
    v_quote.admin_notes,
    v_quote.customer_notes,
    case when v_is_paid then 'paid' else 'unpaid' end,
    v_quote.payment_link_sent_at,
    v_quote.payment_received_at,
    nullif(v_quote.vendor_sku, '') is null,
    nullif(v_quote.vendor_sku, '') is null
      or nullif(coalesce(v_quote.selected_color, v_quote.garment_colors), '') is null
      or nullif(coalesce(v_quote.selected_size, v_quote.sizes_needed), '') is null
      or coalesce(v_quote.quantity, 0) <= 0,
    coalesce(v_quote.quantity, 0),
    1,
    false,
    'Do Not Submit Live Order Yet'
  )
  returning * into v_draft;

  update public.quote_requests quote_request
  set
    status = 'converted_to_order',
    workflow_status = 'vendor_order_draft_created',
    converted_order_id = v_order.id,
    assigned_vendor_name = 'S&S Activewear'
  where quote_request.id = v_quote.id;

  update public.orders customer_order
  set
    vendor_order_id = v_draft.id,
    assigned_vendor_name = 'S&S Activewear',
    fulfillment_status = 'vendor_order_needed'
  where customer_order.id = v_order.id;

  return jsonb_build_object(
    'created', true,
    'draft_id', v_draft.id,
    'customer_order_id', v_order.id,
    'workflow_status', v_draft.workflow_status,
    'payment_status', v_draft.payment_status,
    'safety_mode', true,
    'live_order_submitted', false
  );
end;
$$;

revoke all on function public.create_ss_vendor_order_draft_from_quote(text)
from public, anon;
grant execute on function public.create_ss_vendor_order_draft_from_quote(text)
to authenticated;

create or replace function public.set_ss_quote_workflow_stage(
  p_quote_request_id text,
  p_stage text,
  p_admin_note text default null,
  p_customer_note text default null
)
returns public.quote_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote public.quote_requests%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  if p_stage not in (
    'quote_request_received',
    'quote_reviewed',
    'customer_approved',
    'payment_link_sent',
    'payment_received'
  ) then
    raise exception 'This quote-stage transition is not allowed';
  end if;

  update public.quote_requests quote_request
  set
    workflow_status = p_stage,
    status = case
      when p_stage = 'quote_request_received' then 'new'
      when p_stage = 'quote_reviewed' then 'reviewing'
      when p_stage = 'customer_approved' then 'approved'
      else quote_request.status
    end,
    admin_notes = coalesce(p_admin_note, quote_request.admin_notes),
    customer_notes = coalesce(p_customer_note, quote_request.customer_notes),
    payment_link_sent_at = case
      when p_stage = 'payment_link_sent' then now()
      else quote_request.payment_link_sent_at
    end,
    payment_received_at = case
      when p_stage = 'payment_received' then now()
      else quote_request.payment_received_at
    end
  where quote_request.id = p_quote_request_id
  returning quote_request.* into v_quote;

  if not found then
    raise exception 'Quote request not found'
      using errcode = 'P0002';
  end if;

  if p_stage = 'payment_received' then
    update public.orders customer_order
    set
      status = 'paid',
      payment_status = 'paid',
      payment_date = now(),
      amount_paid = customer_order.total_amount,
      balance_due = 0
    where customer_order.quote_request_id = p_quote_request_id;

    update public.vendor_order_drafts draft
    set
      payment_status = 'paid',
      payment_received_at = now()
    where draft.quote_request_id = p_quote_request_id;
  elsif p_stage = 'payment_link_sent' then
    update public.vendor_order_drafts draft
    set
      payment_status = 'payment_link_sent',
      payment_link_sent_at = now()
    where draft.quote_request_id = p_quote_request_id
      and draft.payment_status = 'unpaid';
  end if;

  return v_quote;
end;
$$;

revoke all on function public.set_ss_quote_workflow_stage(text, text, text, text)
from public, anon;
grant execute on function public.set_ss_quote_workflow_stage(text, text, text, text)
to authenticated;

create or replace function public.advance_ss_vendor_order_stage(
  p_draft_id text,
  p_stage text,
  p_admin_note text default null,
  p_customer_note text default null
)
returns public.vendor_order_drafts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft public.vendor_order_drafts%rowtype;
  v_validation jsonb;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  select draft.*
  into v_draft
  from public.vendor_order_drafts draft
  where draft.id = p_draft_id
  for update;

  if not found then
    raise exception 'S&S vendor order draft not found'
      using errcode = 'P0002';
  end if;

  if p_stage in (
    'submitted_to_ss',
    'vendor_order_confirmed',
    'tracking_received',
    'completed'
  ) then
    raise exception 'Do Not Submit Live Order Yet safety mode is enabled'
      using errcode = '55000';
  end if;

  if p_stage not in ('vendor_order_reviewed', 'ready_to_submit_to_ss') then
    raise exception 'This vendor-order stage transition is not allowed';
  end if;

  if p_stage = 'ready_to_submit_to_ss' then
    v_validation := public.get_ss_vendor_order_draft_validation(p_draft_id);
    if not coalesce((v_validation ->> 'payload_valid')::boolean, false) then
      raise exception 'Payment and all required vendor order fields must be complete before submission readiness';
    end if;
    if not v_draft.validation_passed or not v_draft.ss_api_connected then
      raise exception 'Run the S&S test-mode payload validation before marking this order ready';
    end if;
  end if;

  update public.vendor_order_drafts draft
  set
    workflow_status = p_stage,
    vendor_status = case
      when p_stage = 'ready_to_submit_to_ss' then 'ready_to_order'
      else 'draft'
    end,
    admin_notes = coalesce(p_admin_note, draft.admin_notes),
    customer_notes = coalesce(p_customer_note, draft.customer_notes)
  where draft.id = p_draft_id
  returning draft.* into v_draft;

  return v_draft;
end;
$$;

revoke all on function public.advance_ss_vendor_order_stage(text, text, text, text)
from public, anon;
grant execute on function public.advance_ss_vendor_order_stage(text, text, text, text)
to authenticated;

do $$
declare
  v_public_before bigint;
  v_public_after bigint;
  v_batch_four_count bigint;
  v_pause_enabled boolean;
begin
  select count(*) into v_public_before
  from public.storefront_products;

  select workflow.product_loading_paused
  into v_pause_enabled
  from public.ss_catalog_workflow_status workflow
  where workflow.id;

  select count(*) into v_batch_four_count
  from public.ss_launch_batches batch
  where batch.batch_sequence > 3;

  select count(*) into v_public_after
  from public.storefront_products;

  if not coalesce(v_pause_enabled, false)
    or v_batch_four_count <> 0
    or v_public_before <> v_public_after then
    raise exception 'Vendor workflow installation changed protected catalog state';
  end if;

  raise notice 'SS_VENDOR_ORDER_SAFE_WORKFLOW %', jsonb_build_object(
    'live_submission_enabled', false,
    'safety_message', 'Do Not Submit Live Order Yet',
    'workflow_stage_count', 12,
    'batch_four_count', v_batch_four_count,
    'product_loading_paused', v_pause_enabled,
    'public_product_count_before', v_public_before,
    'public_product_count_after', v_public_after
  );
end;
$$;
