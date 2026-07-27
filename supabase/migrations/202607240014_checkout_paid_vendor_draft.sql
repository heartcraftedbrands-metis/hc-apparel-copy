-- Secure customized small-order checkout and paid-order vendor-draft connection.
-- This migration never submits an S&S or ZeroTouch order.

alter table public.orders
add column if not exists checkout_source text,
add column if not exists billing_address jsonb not null default '{}'::jsonb;

alter table public.orders
drop constraint if exists orders_checkout_source_check;
alter table public.orders
add constraint orders_checkout_source_check
check (checkout_source is null or checkout_source = 'customized_small_order');

create or replace function public.small_order_required_data_errors(
  p_items jsonb,
  p_shipping_address jsonb,
  p_owner_user_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_errors jsonb := '[]'::jsonb;
  v_total_quantity integer := 0;
  v_item jsonb;
  v_artwork text;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    return jsonb_build_array('At least one customized item is required');
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if nullif(btrim(coalesce(v_item ->> 'product_id', '')), '') is null
      or nullif(btrim(coalesce(v_item ->> 'product_name', '')), '') is null then
      v_errors := v_errors || jsonb_build_array('Every item requires a product');
    end if;
    if nullif(btrim(coalesce(v_item ->> 'color', '')), '') is null then
      v_errors := v_errors || jsonb_build_array('Every item requires a color');
    end if;
    if nullif(btrim(coalesce(v_item ->> 'size', '')), '') is null then
      v_errors := v_errors || jsonb_build_array('Every item requires a size');
    end if;
    if coalesce(v_item ->> 'quantity', '') !~ '^\d+$'
      or coalesce((v_item ->> 'quantity')::integer, 0) <= 0 then
      v_errors := v_errors || jsonb_build_array('Every item requires a positive whole-number quantity');
    else
      v_total_quantity := v_total_quantity + (v_item ->> 'quantity')::integer;
    end if;

    v_artwork := nullif(btrim(coalesce(v_item ->> 'artwork_file_url', '')), '');
    if v_artwork is null then
      v_errors := v_errors || jsonb_build_array('Every item requires private artwork');
    elsif v_artwork not like 'supabase://customer-files/uploads/%' then
      v_errors := v_errors || jsonb_build_array('Artwork must use a private customer-files reference');
    elsif p_owner_user_id is not null
      and v_artwork not like 'supabase://customer-files/uploads/' || p_owner_user_id::text || '/%' then
      v_errors := v_errors || jsonb_build_array('Artwork does not belong to the signed-in customer');
    end if;

    if nullif(btrim(coalesce(v_item ->> 'decoration_method', '')), '') is null then
      v_errors := v_errors || jsonb_build_array('Every item requires a decoration method');
    end if;
    if nullif(btrim(coalesce(v_item ->> 'print_placement', '')), '') is null then
      v_errors := v_errors || jsonb_build_array('Every item requires a print placement');
    end if;
    if nullif(btrim(coalesce(v_item ->> 'print_size_option', '')), '') is null then
      v_errors := v_errors || jsonb_build_array('Every item requires a print size option');
    end if;
  end loop;

  if v_total_quantity >= 50 then
    v_errors := v_errors || jsonb_build_array('Orders of 50 or more require a Bulk Quote 50+');
  end if;

  if nullif(btrim(coalesce(
    p_shipping_address ->> 'street',
    p_shipping_address ->> 'line1',
    p_shipping_address ->> 'address1'
  )), '') is null
    or nullif(btrim(coalesce(p_shipping_address ->> 'city', '')), '') is null
    or nullif(btrim(coalesce(p_shipping_address ->> 'state', '')), '') is null
    or nullif(btrim(coalesce(
      p_shipping_address ->> 'zip',
      p_shipping_address ->> 'postal_code'
    )), '') is null then
    v_errors := v_errors || jsonb_build_array('Complete shipping address is required');
  end if;

  return (
    select coalesce(jsonb_agg(distinct value), '[]'::jsonb)
    from jsonb_array_elements(v_errors)
  );
end;
$$;

revoke all on function public.small_order_required_data_errors(jsonb, jsonb, uuid)
from public, anon, authenticated;

create or replace function public.get_public_payment_settings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'payment_mode', settings.payment_mode,
        'stripe_connected', coalesce(settings.stripe_connected, false),
        'test_mode_enabled', coalesce(settings.test_mode_enabled, false),
        'invoice_instructions', settings.invoice_instructions,
        'payment_notes_customer', settings.payment_notes_customer
      )
      from public.payment_settings settings
      order by settings.updated_date desc
      limit 1
    ),
    jsonb_build_object(
      'payment_mode', 'manual',
      'stripe_connected', false,
      'test_mode_enabled', false
    )
  );
$$;

revoke all on function public.get_public_payment_settings()
from public;
grant execute on function public.get_public_payment_settings()
to anon, authenticated;

create or replace function public.create_small_order_checkout(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user auth.users%rowtype;
  v_input_items jsonb;
  v_normalized_items jsonb := '[]'::jsonb;
  v_input jsonb;
  v_product public.products%rowtype;
  v_variant jsonb;
  v_price numeric;
  v_total numeric := 0;
  v_total_quantity integer := 0;
  v_shipping jsonb;
  v_billing jsonb;
  v_errors jsonb;
  v_order public.orders%rowtype;
begin
  select account.*
  into v_user
  from auth.users account
  where account.id = auth.uid();

  if v_user.id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if lower(btrim(coalesce(payload ->> 'customer_email', ''))) <> lower(v_user.email) then
    raise exception 'Checkout email must match the signed-in account' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(payload ->> 'customer_name', '')), '') is null then
    raise exception 'Customer name is required';
  end if;

  v_input_items := coalesce(payload -> 'items', '[]'::jsonb);
  v_shipping := coalesce(payload -> 'shipping_address', '{}'::jsonb);
  v_billing := coalesce(payload -> 'billing_address', '{}'::jsonb);

  for v_input in select value from jsonb_array_elements(v_input_items)
  loop
    select product.*
    into v_product
    from public.products product
    where product.id = v_input ->> 'product_id'
      and product.visibility = 'public'
      and product.is_active is true;

    if not found then
      raise exception 'A checkout product is unavailable';
    end if;

    v_variant := null;
    select candidate
    into v_variant
    from jsonb_array_elements(coalesce(v_product.size_prices, '[]'::jsonb)) candidate
    where lower(btrim(coalesce(candidate ->> 'size', ''))) = lower(
      btrim(coalesce(v_input ->> 'color', '')) || ' / ' || btrim(coalesce(v_input ->> 'size', ''))
    )
    limit 1;

    v_price := case
      when coalesce(v_variant ->> 'price', '') ~ '^\d+(\.\d+)?$'
        then (v_variant ->> 'price')::numeric
      else coalesce(v_product.sale_price, v_product.price)
    end;

    v_total_quantity := v_total_quantity + coalesce((v_input ->> 'quantity')::integer, 0);
    v_total := v_total + v_price * coalesce((v_input ->> 'quantity')::integer, 0);
    v_normalized_items := v_normalized_items || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id,
      'product_name', v_product.name,
      'brand', coalesce(nullif(v_input ->> 'brand', ''), split_part(v_product.name, ' ', 1)),
      'style_number', coalesce(nullif(v_input ->> 'style_number', ''), v_product.supplier_sku, ''),
      'sku', coalesce(nullif(v_variant ->> 'sku', ''), nullif(v_input ->> 'sku', '')),
      'color', btrim(v_input ->> 'color'),
      'size', btrim(v_input ->> 'size'),
      'quantity', (v_input ->> 'quantity')::integer,
      'price', v_price,
      'image_url', coalesce(nullif(v_variant ->> 'image_url', ''), v_product.image_url, ''),
      'product_type', 'physical',
      'artwork_file_url', v_input ->> 'artwork_file_url',
      'artwork_file_name', coalesce(v_input ->> 'artwork_file_name', ''),
      'decoration_method', v_input ->> 'decoration_method',
      'print_placement', v_input ->> 'print_placement',
      'print_size_option', v_input ->> 'print_size_option',
      'print_notes', coalesce(v_input ->> 'print_notes', '')
    ));
  end loop;

  v_errors := public.small_order_required_data_errors(
    v_normalized_items,
    v_shipping,
    v_user.id
  );
  if jsonb_array_length(v_errors) > 0 then
    raise exception 'Checkout validation failed: %', v_errors::text using errcode = '23514';
  end if;

  if nullif(btrim(coalesce(
    v_billing ->> 'street',
    v_billing ->> 'line1',
    v_billing ->> 'address1'
  )), '') is null
    or nullif(btrim(coalesce(v_billing ->> 'city', '')), '') is null
    or nullif(btrim(coalesce(v_billing ->> 'state', '')), '') is null
    or nullif(btrim(coalesce(v_billing ->> 'zip', v_billing ->> 'postal_code', '')), '') is null then
    raise exception 'Complete billing address is required';
  end if;

  insert into public.orders (
    owner_user_id,
    created_by_email,
    customer_email,
    customer_name,
    customer_phone,
    order_items,
    total_amount,
    amount_paid,
    balance_due,
    status,
    payment_status,
    fulfillment_status,
    production_status,
    has_physical_items,
    shipping_address,
    billing_address,
    delivery_notes,
    checkout_source,
    quantity,
    artwork_file_url,
    print_method
  )
  values (
    v_user.id,
    v_user.email,
    v_user.email,
    btrim(payload ->> 'customer_name'),
    nullif(btrim(coalesce(payload ->> 'customer_phone', '')), ''),
    v_normalized_items,
    round(v_total, 2),
    0,
    round(v_total, 2),
    'awaiting_payment',
    'awaiting_payment',
    'not_started',
    'order_received',
    true,
    v_shipping || jsonb_build_object(
      'shipping_method', coalesce(nullif(payload ->> 'shipping_method', ''), 'standard')
    ),
    v_billing,
    nullif(btrim(coalesce(payload ->> 'delivery_notes', '')), ''),
    'customized_small_order',
    v_total_quantity,
    v_normalized_items -> 0 ->> 'artwork_file_url',
    v_normalized_items -> 0 ->> 'decoration_method'
  )
  returning * into v_order;

  insert into public.order_status_history (
    owner_user_id,
    created_by_email,
    order_id,
    order_number,
    status_title,
    status_type,
    customer_message,
    admin_note,
    customer_visible,
    created_by,
    new_value
  )
  values (
    v_user.id,
    v_user.email,
    v_order.id,
    upper(right(v_order.id, 8)),
    'Order Received',
    'system',
    'Your customized order was received and is awaiting payment confirmation.',
    'Checkout validated server-side. No vendor order was submitted.',
    true,
    'system',
    'awaiting_payment'
  );

  return jsonb_build_object(
    'created', true,
    'order_id', v_order.id,
    'payment_status', v_order.payment_status,
    'order_status', v_order.status,
    'vendor_draft_created', false,
    'live_submission_enabled', false,
    'ss_order_submitted', false,
    'zerotouch_submitted', false
  );
end;
$$;

revoke all on function public.create_small_order_checkout(jsonb)
from public, anon;
grant execute on function public.create_small_order_checkout(jsonb)
to authenticated;

create or replace function public.prepare_paid_small_order_vendor_draft(p_order_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_existing public.vendor_order_drafts%rowtype;
  v_draft public.vendor_order_drafts%rowtype;
  v_errors jsonb;
  v_items jsonb;
  v_missing_sku boolean;
  v_missing_image boolean;
  v_first_item jsonb;
begin
  select customer_order.*
  into v_order
  from public.orders customer_order
  where customer_order.id = p_order_id
  for update;

  if not found then
    raise exception 'Customer order not found' using errcode = 'P0002';
  end if;
  if v_order.checkout_source <> 'customized_small_order' then
    raise exception 'Only customized small orders use this vendor-draft workflow';
  end if;
  if v_order.payment_status <> 'paid' then
    raise exception 'Payment must be confirmed before creating a vendor order draft';
  end if;

  v_errors := public.small_order_required_data_errors(
    v_order.order_items,
    v_order.shipping_address,
    v_order.owner_user_id
  );
  if jsonb_array_length(v_errors) > 0 then
    raise exception 'Vendor draft validation failed: %', v_errors::text using errcode = '23514';
  end if;

  select draft.*
  into v_existing
  from public.vendor_order_drafts draft
  where draft.customer_order_id = v_order.id
  order by draft.created_date desc
  limit 1;
  if found then
    return jsonb_build_object(
      'created', false,
      'draft_id', v_existing.id,
      'customer_order_id', v_order.id,
      'payment_status', v_existing.payment_status,
      'live_submission_enabled', false
    );
  end if;

  select coalesce(jsonb_agg(
    item || jsonb_build_object(
      'garment_cost', 0,
      'sale_price', coalesce((item ->> 'price')::numeric, 0),
      'estimated_profit', 0,
      'notes', coalesce(item ->> 'print_notes', '')
    )
  ), '[]'::jsonb)
  into v_items
  from jsonb_array_elements(v_order.order_items) item;

  v_missing_sku := exists (
    select 1 from jsonb_array_elements(v_items) item
    where nullif(btrim(coalesce(item ->> 'sku', '')), '') is null
  );
  v_missing_image := exists (
    select 1 from jsonb_array_elements(v_items) item
    where nullif(btrim(coalesce(item ->> 'image_url', '')), '') is null
  );
  v_first_item := v_items -> 0;

  insert into public.vendor_order_drafts (
    owner_user_id,
    created_by_email,
    vendor_order_number,
    customer_order_id,
    customer_order_number,
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
    payment_received_at,
    has_sku_warnings,
    has_image_warnings,
    has_missing_warnings,
    total_quantity,
    item_count,
    production_status,
    live_submission_enabled,
    safety_mode_message,
    zerotouch_enabled,
    zerotouch_mode,
    decoration_method,
    decoration_location,
    decoration_notes,
    artwork_file_url,
    zerotouch_ready,
    zerotouch_validation_errors
  )
  values (
    v_order.owner_user_id,
    v_order.created_by_email,
    'SS-DRAFT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
    v_order.id,
    upper(right(v_order.id, 8)),
    v_order.customer_name,
    v_order.customer_email,
    v_order.customer_phone,
    v_order.created_date,
    'draft',
    'vendor_order_draft_created',
    'S&S Activewear',
    v_items,
    v_order.delivery_notes,
    v_order.shipping_address,
    coalesce(v_order.shipping_address ->> 'shipping_method', 'standard'),
    0,
    v_order.total_amount,
    0,
    'Automatically prepared from a paid customized order. Review all warnings before test validation.',
    v_order.notes,
    'paid',
    coalesce(v_order.payment_date, now()),
    v_missing_sku,
    v_missing_image,
    v_missing_sku or v_missing_image,
    v_order.quantity,
    jsonb_array_length(v_items),
    'payment_confirmed',
    false,
    'Do Not Submit Live Order Yet',
    false,
    'none',
    nullif(v_first_item ->> 'decoration_method', ''),
    case v_first_item ->> 'print_placement'
      when 'front_center' then 'front'
      when 'left_chest' then 'left_chest'
      when 'back' then 'back'
      when 'sleeve' then 'sleeve'
      else 'custom'
    end,
    nullif(v_first_item ->> 'print_notes', ''),
    nullif(v_first_item ->> 'artwork_file_url', ''),
    false,
    '[]'::jsonb
  )
  returning * into v_draft;

  update public.orders customer_order
  set
    status = 'paid',
    amount_paid = total_amount,
    balance_due = 0,
    payment_date = coalesce(payment_date, now()),
    fulfillment_status = 'vendor_order_needed',
    production_status = 'payment_confirmed',
    vendor_order_id = v_draft.id,
    assigned_vendor_name = 'S&S Activewear'
  where customer_order.id = v_order.id;

  insert into public.customer_notifications (
    owner_user_id,
    created_by_email,
    order_id,
    order_number,
    customer_name,
    customer_email,
    notification_type,
    subject,
    customer_message,
    related_status,
    sent_status,
    customer_visible,
    admin_note,
    auto_generated,
    trigger_event
  )
  select
    v_order.owner_user_id,
    v_order.created_by_email,
    v_order.id,
    upper(right(v_order.id, 8)),
    v_order.customer_name,
    v_order.customer_email,
    template.notification_type,
    template.subject,
    template.customer_message,
    template.related_status,
    'draft',
    true,
    'Copy-to-email draft only. Nothing was sent automatically.',
    true,
    'paid_customized_order'
  from (
    values
      (
        'order_received_payment_confirmed',
        'Payment confirmed for HC Apparel order ' || upper(right(v_order.id, 8)),
        'Hi ' || v_order.customer_name || ', payment is confirmed for order '
          || upper(right(v_order.id, 8)) || '. We are preparing your customized garments. '
          || 'Questions? support@ilovehcapparel.net',
        'payment_confirmed'
      ),
      (
        'artwork_received',
        'Artwork received for HC Apparel order ' || upper(right(v_order.id, 8)),
        'Hi ' || v_order.customer_name || ', we securely received the artwork attached to order '
          || upper(right(v_order.id, 8)) || '. Our team will review it before production. '
          || 'Questions? support@ilovehcapparel.net',
        'artwork_received'
      )
  ) as template(notification_type, subject, customer_message, related_status)
  where not exists (
    select 1
    from public.customer_notifications existing
    where existing.order_id = v_order.id
      and existing.notification_type = template.notification_type
  );

  insert into public.order_status_history (
    owner_user_id,
    created_by_email,
    order_id,
    order_number,
    status_title,
    status_type,
    customer_message,
    admin_note,
    customer_visible,
    created_by,
    previous_value,
    new_value
  )
  values (
    v_order.owner_user_id,
    v_order.created_by_email,
    v_order.id,
    upper(right(v_order.id, 8)),
    'Payment Confirmed',
    'payment',
    'Payment was confirmed and your order is moving into preparation.',
    'Private vendor draft ' || v_draft.id || ' created. No S&S order was submitted.',
    true,
    'system',
    v_order.payment_status,
    'paid'
  );

  return jsonb_build_object(
    'created', true,
    'draft_id', v_draft.id,
    'customer_order_id', v_order.id,
    'payment_status', 'paid',
    'notification_drafts_created', 2,
    'live_submission_enabled', false,
    'ss_order_submitted', false,
    'zerotouch_submitted', false
  );
end;
$$;

revoke all on function public.prepare_paid_small_order_vendor_draft(text)
from public, anon, authenticated;

create or replace function public.create_vendor_draft_from_paid_order(p_order_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  return public.prepare_paid_small_order_vendor_draft(p_order_id);
end;
$$;

revoke all on function public.create_vendor_draft_from_paid_order(text)
from public, anon;
grant execute on function public.create_vendor_draft_from_paid_order(text)
to authenticated;

create or replace function public.guard_paid_small_order_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_errors jsonb;
begin
  if new.checkout_source = 'customized_small_order'
    and new.payment_status = 'paid'
    and old.payment_status is distinct from 'paid' then
    v_errors := public.small_order_required_data_errors(
      new.order_items,
      new.shipping_address,
      new.owner_user_id
    );
    if jsonb_array_length(v_errors) > 0 then
      raise exception 'Paid order validation failed: %', v_errors::text using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_guard_paid_small_order on public.orders;
create trigger orders_guard_paid_small_order
before update of payment_status on public.orders
for each row execute function public.guard_paid_small_order_transition();

create or replace function public.create_paid_small_order_draft_after_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.checkout_source = 'customized_small_order'
    and new.payment_status = 'paid'
    and old.payment_status is distinct from 'paid' then
    perform public.prepare_paid_small_order_vendor_draft(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists orders_create_paid_small_order_draft on public.orders;
create trigger orders_create_paid_small_order_draft
after update of payment_status on public.orders
for each row execute function public.create_paid_small_order_draft_after_payment();

-- Existing catalog and fulfillment safety invariants remain unchanged.
do $$
begin
  if exists (
    select 1
    from public.vendor_order_drafts
    where live_submission_enabled is true
  ) then
    raise exception 'Live S&S submission must remain disabled';
  end if;
  if exists (
    select 1
    from public.ss_catalog_workflow_status
    where id is true
      and (product_loading_paused is not true or max_batch_sequence <> 3)
  ) then
    raise exception 'Product loading pause or no-Batch-4 invariant failed';
  end if;
end;
$$;
