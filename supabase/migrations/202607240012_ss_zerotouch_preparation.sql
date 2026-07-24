-- S&S ZeroTouch preparation only.
-- No live S&S endpoint or order submission is enabled by this migration.

alter table public.vendor_order_drafts
add column if not exists zerotouch_enabled boolean not null default false,
add column if not exists zerotouch_mode text not null default 'none',
add column if not exists design_id text,
add column if not exists design_group_id text,
add column if not exists decoration_method text,
add column if not exists decoration_location text,
add column if not exists decoration_notes text,
add column if not exists artwork_file_url text,
add column if not exists qr_payload jsonb,
add column if not exists label_text_line_1 text,
add column if not exists label_text_line_2 text,
add column if not exists label_barcode_value text,
add column if not exists label_quantity integer not null default 0,
add column if not exists label_cost_estimate numeric(10, 2) not null default 0,
add column if not exists zerotouch_trial_applied boolean not null default false,
add column if not exists zerotouch_ready boolean not null default false,
add column if not exists zerotouch_validation_errors jsonb not null default '[]'::jsonb;

alter table public.vendor_order_drafts
drop constraint if exists vendor_order_drafts_zerotouch_mode_check;
alter table public.vendor_order_drafts
add constraint vendor_order_drafts_zerotouch_mode_check
check (zerotouch_mode in ('none', 'box_level', 'garment_level'));

alter table public.vendor_order_drafts
drop constraint if exists vendor_order_drafts_decoration_method_check;
alter table public.vendor_order_drafts
add constraint vendor_order_drafts_decoration_method_check
check (
  decoration_method is null
  or decoration_method in ('DTF', 'DTG', 'embroidery', 'screen_print', 'other')
);

alter table public.vendor_order_drafts
drop constraint if exists vendor_order_drafts_decoration_location_check;
alter table public.vendor_order_drafts
add constraint vendor_order_drafts_decoration_location_check
check (
  decoration_location is null
  or decoration_location in ('front', 'left_chest', 'back', 'sleeve', 'custom')
);

alter table public.vendor_order_drafts
drop constraint if exists vendor_order_drafts_label_quantity_check;
alter table public.vendor_order_drafts
add constraint vendor_order_drafts_label_quantity_check
check (label_quantity >= 0);

alter table public.vendor_order_drafts
drop constraint if exists vendor_order_drafts_label_cost_estimate_check;
alter table public.vendor_order_drafts
add constraint vendor_order_drafts_label_cost_estimate_check
check (label_cost_estimate >= 0);

create or replace function public.get_zerotouch_validation_errors(
  p_draft public.vendor_order_drafts
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_errors jsonb := '[]'::jsonb;
  v_items jsonb;
  v_order_paid boolean;
begin
  v_items := case
    when jsonb_typeof(p_draft.items) = 'array' then p_draft.items
    else '[]'::jsonb
  end;

  select exists (
    select 1
    from public.orders customer_order
    where customer_order.id = p_draft.customer_order_id
      and customer_order.payment_status = 'paid'
  ) or p_draft.payment_status = 'paid'
  into v_order_paid;

  if not p_draft.zerotouch_enabled then
    v_errors := v_errors || jsonb_build_array('ZeroTouch is not enabled');
  end if;
  if p_draft.zerotouch_mode = 'none' then
    v_errors := v_errors || jsonb_build_array('ZeroTouch mode is required');
  end if;
  if nullif(btrim(coalesce(p_draft.design_id, '')), '') is null then
    v_errors := v_errors || jsonb_build_array('DesignID is required');
  end if;
  if nullif(btrim(coalesce(p_draft.artwork_file_url, '')), '') is null then
    v_errors := v_errors || jsonb_build_array('Artwork file URL is required');
  end if;
  if p_draft.decoration_method is null then
    v_errors := v_errors || jsonb_build_array('Decoration method is required');
  end if;
  if p_draft.decoration_location is null then
    v_errors := v_errors || jsonb_build_array('Decoration placement is required');
  end if;
  if jsonb_array_length(v_items) = 0 then
    v_errors := v_errors || jsonb_build_array('At least one product item is required');
  elsif exists (
    select 1
    from jsonb_array_elements(v_items) item
    where nullif(btrim(item ->> 'sku'), '') is null
  ) then
    v_errors := v_errors || jsonb_build_array('Every item requires an SKU');
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_items) item
    where case
      when coalesce(item ->> 'quantity', '') ~ '^\s*[+-]?(\d+(\.\d*)?|\.\d+)\s*$'
        then (item ->> 'quantity')::numeric
      else 0
    end <= 0
  ) then
    v_errors := v_errors || jsonb_build_array('Every item requires a quantity');
  end if;
  if nullif(btrim(coalesce(
    p_draft.shipping_address ->> 'street',
    p_draft.shipping_address ->> 'line1',
    p_draft.shipping_address ->> 'address1'
  )), '') is null
    or nullif(btrim(p_draft.shipping_address ->> 'city'), '') is null
    or nullif(btrim(p_draft.shipping_address ->> 'state'), '') is null
    or nullif(btrim(coalesce(
      p_draft.shipping_address ->> 'zip',
      p_draft.shipping_address ->> 'postal_code'
    )), '') is null then
    v_errors := v_errors || jsonb_build_array('Complete shipping address is required');
  end if;
  if not v_order_paid then
    v_errors := v_errors || jsonb_build_array('Payment confirmation is required');
  end if;
  if p_draft.label_quantity <= 0 then
    v_errors := v_errors || jsonb_build_array('Label quantity must be at least 1');
  end if;

  return v_errors;
end;
$$;

revoke all on function public.get_zerotouch_validation_errors(public.vendor_order_drafts)
from public, anon, authenticated;

create or replace function public.enforce_zerotouch_ready_safety()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_errors jsonb;
begin
  if new.zerotouch_ready then
    v_errors := public.get_zerotouch_validation_errors(new);
    if jsonb_array_length(v_errors) > 0 then
      raise exception 'ZeroTouch preparation is incomplete: %', v_errors::text
        using errcode = '23514';
    end if;
  end if;

  if new.live_submission_enabled then
    raise exception 'Live S&S submission remains disabled'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

drop trigger if exists vendor_order_drafts_enforce_zerotouch_ready
on public.vendor_order_drafts;
create trigger vendor_order_drafts_enforce_zerotouch_ready
before insert or update on public.vendor_order_drafts
for each row execute function public.enforce_zerotouch_ready_safety();

create or replace function public.validate_zerotouch_preparation(
  p_draft_id text,
  p_mark_ready boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft public.vendor_order_drafts%rowtype;
  v_order public.orders%rowtype;
  v_errors jsonb;
  v_ready boolean;
  v_total_quantity integer;
  v_first_item jsonb;
  v_payload jsonb;
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
    raise exception 'Vendor order draft not found'
      using errcode = 'P0002';
  end if;

  select customer_order.*
  into v_order
  from public.orders customer_order
  where customer_order.id = v_draft.customer_order_id;

  v_errors := public.get_zerotouch_validation_errors(v_draft);
  v_ready := jsonb_array_length(v_errors) = 0;

  select coalesce(sum(
    case
      when coalesce(item ->> 'quantity', '') ~ '^\s*[+-]?(\d+(\.\d*)?|\.\d+)\s*$'
        then (item ->> 'quantity')::numeric
      else 0
    end
  ), 0)::integer
  into v_total_quantity
  from jsonb_array_elements(coalesce(v_draft.items, '[]'::jsonb)) item;

  v_first_item := coalesce(v_draft.items -> 0, '{}'::jsonb);

  v_payload := jsonb_build_object(
    'endpoint', 'S&S API POST - Zero Touch Orders',
    'test_mode', true,
    'submitted', false,
    'live_submission_enabled', false,
    'hc_order_number', coalesce(v_draft.customer_order_number, v_draft.customer_order_id),
    'vendor_draft_id', v_draft.id,
    'customer_name', v_draft.customer_name,
    'product_name', v_first_item ->> 'product_name',
    'brand', v_first_item ->> 'brand',
    'style_number', v_first_item ->> 'style_number',
    'sku', v_first_item ->> 'sku',
    'color', v_first_item ->> 'color',
    'size', v_first_item ->> 'size',
    'quantity', v_total_quantity,
    'artwork_file_url', v_draft.artwork_file_url,
    'decoration_method', v_draft.decoration_method,
    'decoration_location', v_draft.decoration_location,
    'print_notes', v_draft.decoration_notes,
    'production_packet_url', '/AdminVendorOrderDraft?id=' || v_draft.id || '#production-packet',
    'zerotouch', jsonb_build_object(
      'enabled', v_draft.zerotouch_enabled,
      'mode', v_draft.zerotouch_mode,
      'design_id', v_draft.design_id,
      'design_group_id', v_draft.design_group_id,
      'qr_payload', v_draft.qr_payload,
      'label_text_line_1', v_draft.label_text_line_1,
      'label_text_line_2', v_draft.label_text_line_2,
      'label_barcode_value', v_draft.label_barcode_value,
      'label_quantity', v_draft.label_quantity,
      'label_cost_estimate', v_draft.label_cost_estimate,
      'trial_applied', v_draft.zerotouch_trial_applied
    ),
    'items', coalesce(v_draft.items, '[]'::jsonb),
    'shipping_address', v_draft.shipping_address
  );

  update public.vendor_order_drafts
  set
    zerotouch_validation_errors = v_errors,
    zerotouch_ready = case when p_mark_ready then v_ready else false end,
    qr_payload = coalesce(qr_payload, v_payload - 'items' - 'shipping_address'),
    live_submission_enabled = false
  where id = p_draft_id;

  return jsonb_build_object(
    'draft_id', p_draft_id,
    'valid', v_ready,
    'zerotouch_ready', case when p_mark_ready then v_ready else false end,
    'validation_errors', v_errors,
    'payload', v_payload,
    'test_mode', true,
    'submitted', false,
    'live_submission_enabled', false,
    'safety_message', 'ZeroTouch payload preparation only. No S&S order was placed.'
  );
end;
$$;

revoke all on function public.validate_zerotouch_preparation(text, boolean)
from public, anon;
grant execute on function public.validate_zerotouch_preparation(text, boolean)
to authenticated;

