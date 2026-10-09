begin;

-- A mixed cart keeps its downloadable lines in the paid order while every
-- shipping and production check applies only to the physical lines.
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
  v_physical_quantity integer := 0;
  v_has_physical boolean := false;
  v_item jsonb;
  v_artwork text;
  v_is_customized boolean;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    return jsonb_build_array('At least one item is required');
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if nullif(btrim(coalesce(v_item ->> 'product_id', '')), '') is null
      or nullif(btrim(coalesce(v_item ->> 'product_name', '')), '') is null then
      v_errors := v_errors || jsonb_build_array('Every item requires a product');
    end if;
    if coalesce(v_item ->> 'quantity', '') !~ '^\d+$'
      or coalesce((v_item ->> 'quantity')::integer, 0) <= 0 then
      v_errors := v_errors || jsonb_build_array('Every item requires a positive whole-number quantity');
      continue;
    end if;

    if lower(coalesce(v_item ->> 'product_type', 'physical')) = 'digital' then
      if (v_item ->> 'quantity')::integer <> 1 then
        v_errors := v_errors || jsonb_build_array('Digital mockups can be purchased once per order');
      end if;
      if nullif(v_item ->> 'digital_mockup_version_id', '') is null then
        v_errors := v_errors || jsonb_build_array('Every digital mockup requires a protected file version');
      end if;
      continue;
    end if;

    v_has_physical := true;
    v_physical_quantity := v_physical_quantity + (v_item ->> 'quantity')::integer;
    if nullif(btrim(coalesce(v_item ->> 'color', '')), '') is null then
      v_errors := v_errors || jsonb_build_array('Every garment item requires a color');
    end if;
    if nullif(btrim(coalesce(v_item ->> 'size', '')), '') is null then
      v_errors := v_errors || jsonb_build_array('Every garment item requires a size');
    end if;

    v_is_customized :=
      lower(coalesce(v_item ->> 'purchase_mode', '')) = 'customized'
      or lower(coalesce(v_item ->> 'is_customized', 'false')) = 'true'
      or nullif(btrim(coalesce(v_item ->> 'artwork_file_url', '')), '') is not null
      or nullif(btrim(coalesce(v_item ->> 'decoration_method', '')), '') is not null
      or nullif(btrim(coalesce(v_item ->> 'print_placement', '')), '') is not null
      or nullif(btrim(coalesce(v_item ->> 'print_size_option', '')), '') is not null;

    if v_is_customized then
      v_artwork := nullif(btrim(coalesce(v_item ->> 'artwork_file_url', '')), '');
      if v_artwork is null then
        v_errors := v_errors || jsonb_build_array('Customized items require private artwork');
      elsif v_artwork not like 'supabase://customer-files/uploads/%' then
        v_errors := v_errors || jsonb_build_array('Artwork must use a private customer-files reference');
      elsif p_owner_user_id is not null
        and v_artwork not like 'supabase://customer-files/uploads/' || p_owner_user_id::text || '/%' then
        v_errors := v_errors || jsonb_build_array('Artwork does not belong to the signed-in customer');
      end if;
      if nullif(btrim(coalesce(v_item ->> 'decoration_method', '')), '') is null then
        v_errors := v_errors || jsonb_build_array('Customized items require a decoration method');
      end if;
      if nullif(btrim(coalesce(v_item ->> 'print_placement', '')), '') is null then
        v_errors := v_errors || jsonb_build_array('Customized items require a print placement');
      end if;
      if nullif(btrim(coalesce(v_item ->> 'print_size_option', '')), '') is null then
        v_errors := v_errors || jsonb_build_array('Customized items require a print size option');
      end if;
    end if;
  end loop;

  if v_physical_quantity >= 50 then
    v_errors := v_errors || jsonb_build_array('Orders of 50 or more require a Bulk Quote 50+');
  end if;
  if v_has_physical and (
    nullif(btrim(coalesce(p_shipping_address ->> 'street', p_shipping_address ->> 'line1', p_shipping_address ->> 'address1')), '') is null
    or nullif(btrim(coalesce(p_shipping_address ->> 'city', '')), '') is null
    or nullif(btrim(coalesce(p_shipping_address ->> 'state', '')), '') is null
    or nullif(btrim(coalesce(p_shipping_address ->> 'zip', p_shipping_address ->> 'postal_code')), '') is null
  ) then
    v_errors := v_errors || jsonb_build_array('Complete shipping address is required for physical items');
  end if;

  return (select coalesce(jsonb_agg(distinct value), '[]'::jsonb) from jsonb_array_elements(v_errors));
end;
$$;

revoke all on function public.small_order_required_data_errors(jsonb, jsonb, uuid)
from public, anon, authenticated;

create or replace function public.create_small_order_checkout(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user auth.users%rowtype;
  v_input_items jsonb := coalesce(payload -> 'items', '[]'::jsonb);
  v_normalized_items jsonb := '[]'::jsonb;
  v_input jsonb;
  v_product public.products%rowtype;
  v_asset public.digital_mockup_assets%rowtype;
  v_variant jsonb;
  v_price numeric;
  v_quantity integer;
  v_total numeric := 0;
  v_total_quantity integer := 0;
  v_physical_quantity integer := 0;
  v_digital_count integer := 0;
  v_has_physical boolean := false;
  v_has_digital boolean := false;
  v_shipping jsonb := coalesce(payload -> 'shipping_address', '{}'::jsonb);
  v_billing jsonb := coalesce(payload -> 'billing_address', '{}'::jsonb);
  v_errors jsonb;
  v_first_physical jsonb := '{}'::jsonb;
  v_order public.orders%rowtype;
begin
  select account.* into v_user from auth.users account where account.id = auth.uid();
  if v_user.id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if lower(btrim(coalesce(payload ->> 'customer_email', ''))) <> lower(v_user.email) then
    raise exception 'Checkout email must match the signed-in account' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(payload ->> 'customer_name', '')), '') is null then raise exception 'Customer name is required'; end if;

  for v_input in select value from jsonb_array_elements(v_input_items)
  loop
    select product.* into v_product from public.products product
      where product.id = v_input ->> 'product_id' and product.visibility = 'public' and product.is_active is true;
    if not found then raise exception 'A checkout product is unavailable'; end if;
    if coalesce(v_input ->> 'quantity', '') !~ '^\d+$' then raise exception 'Cart quantity is invalid'; end if;
    v_quantity := (v_input ->> 'quantity')::integer;
    if v_quantity <= 0 then raise exception 'Cart quantity is invalid'; end if;
    v_price := coalesce(v_product.sale_price, v_product.price);
    if v_price is null or v_price <= 0 then raise exception 'A product price is unavailable'; end if;

    if v_product.product_type = 'digital' then
      if v_quantity <> 1 then raise exception 'Digital mockups can be purchased once per order'; end if;
      select asset.* into v_asset from public.digital_mockup_assets asset
        where asset.product_id = v_product.id and asset.publication_status = 'published' and asset.current_version_id is not null;
      if not found then raise exception 'A digital mockup is unavailable'; end if;
      v_has_digital := true;
      v_digital_count := v_digital_count + 1;
      v_total_quantity := v_total_quantity + 1;
      v_total := v_total + v_price;
      v_normalized_items := v_normalized_items || jsonb_build_array(jsonb_build_object(
        'product_id', v_product.id, 'product_name', v_product.name, 'quantity', 1,
        'price', v_price, 'image_url', coalesce(v_product.image_url, ''),
        'product_type', 'digital', 'digital_mockup_asset_id', v_asset.id,
        'digital_mockup_version_id', v_asset.current_version_id,
        'delivery', 'secure_download'
      ));
      continue;
    end if;

    v_has_physical := true;
    v_physical_quantity := v_physical_quantity + v_quantity;
    v_total_quantity := v_total_quantity + v_quantity;
    v_variant := null;
    select candidate into v_variant
      from jsonb_array_elements(coalesce(v_product.size_prices, '[]'::jsonb)) candidate
      where lower(btrim(coalesce(candidate ->> 'size', ''))) = lower(
        btrim(coalesce(v_input ->> 'color', '')) || ' / ' || btrim(coalesce(v_input ->> 'size', ''))
      ) limit 1;
    v_total := v_total + v_price * v_quantity;
    v_normalized_items := v_normalized_items || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id, 'product_name', v_product.name,
      'brand', coalesce(nullif(v_input ->> 'brand', ''), split_part(v_product.name, ' ', 1)),
      'style_number', coalesce(nullif(v_input ->> 'style_number', ''), v_product.supplier_sku, ''),
      'sku', coalesce(nullif(v_variant ->> 'sku', ''), nullif(v_input ->> 'sku', '')),
      'color', btrim(v_input ->> 'color'), 'size', btrim(v_input ->> 'size'),
      'quantity', v_quantity, 'price', v_price,
      'image_url', coalesce(nullif(v_variant ->> 'image_url', ''), v_product.image_url, ''),
      'product_type', 'physical',
      'purchase_mode', case when lower(coalesce(v_input ->> 'purchase_mode', '')) = 'customized'
        or lower(coalesce(v_input ->> 'is_customized', 'false')) = 'true' then 'customized' else 'blank' end,
      'is_customized', (lower(coalesce(v_input ->> 'purchase_mode', '')) = 'customized'
        or lower(coalesce(v_input ->> 'is_customized', 'false')) = 'true'),
      'artwork_file_url', coalesce(v_input ->> 'artwork_file_url', ''),
      'artwork_file_name', coalesce(v_input ->> 'artwork_file_name', ''),
      'decoration_method', coalesce(v_input ->> 'decoration_method', ''),
      'print_placement', coalesce(v_input ->> 'print_placement', ''),
      'print_size_option', coalesce(v_input ->> 'print_size_option', ''),
      'print_notes', coalesce(v_input ->> 'print_notes', '')
    ));
  end loop;

  if not v_has_physical then raise exception 'Digital-only checkout uses the secure Digital Mockups checkout'; end if;
  v_errors := public.small_order_required_data_errors(v_normalized_items, v_shipping, v_user.id);
  if jsonb_array_length(v_errors) > 0 then raise exception 'Checkout validation failed: %', v_errors::text using errcode = '23514'; end if;
  if nullif(btrim(coalesce(v_billing ->> 'street', v_billing ->> 'line1', v_billing ->> 'address1')), '') is null
    or nullif(btrim(coalesce(v_billing ->> 'city', '')), '') is null
    or nullif(btrim(coalesce(v_billing ->> 'state', '')), '') is null
    or nullif(btrim(coalesce(v_billing ->> 'zip', v_billing ->> 'postal_code', '')), '') is null then
    raise exception 'Complete billing address is required';
  end if;
  select value into v_first_physical from jsonb_array_elements(v_normalized_items)
    where value ->> 'product_type' = 'physical' limit 1;

  insert into public.orders (
    owner_user_id, created_by_email, customer_email, customer_name, customer_phone,
    order_items, total_amount, amount_paid, balance_due, status, payment_status,
    fulfillment_status, production_status, has_physical_items, shipping_address,
    billing_address, delivery_notes, checkout_source, quantity, artwork_file_url, print_method
  ) values (
    v_user.id, v_user.email, v_user.email, btrim(payload ->> 'customer_name'),
    nullif(btrim(coalesce(payload ->> 'customer_phone', '')), ''), v_normalized_items,
    round(v_total, 2), 0, round(v_total, 2), 'awaiting_payment', 'awaiting_payment',
    'not_started', 'order_received', true,
    v_shipping || jsonb_build_object('shipping_method', coalesce(nullif(payload ->> 'shipping_method', ''), 'standard')),
    v_billing, nullif(btrim(coalesce(payload ->> 'delivery_notes', '')), ''),
    case when v_has_digital then 'mixed_storefront_order' else 'customized_small_order' end,
    v_total_quantity, nullif(v_first_physical ->> 'artwork_file_url', ''),
    nullif(v_first_physical ->> 'decoration_method', '')
  ) returning * into v_order;

  insert into public.order_status_history (
    owner_user_id, created_by_email, order_id, order_number, status_title, status_type,
    customer_message, admin_note, customer_visible, created_by, new_value
  ) values (
    v_user.id, v_user.email, v_order.id, upper(right(v_order.id, 8)), 'Order Received', 'system',
    'Your order was received and is awaiting payment confirmation.',
    case when v_has_digital then 'Mixed digital and physical checkout validated server-side.' else 'Checkout validated server-side. No vendor order was submitted.' end,
    true, 'system', 'awaiting_payment'
  );

  return jsonb_build_object(
    'created', true, 'order_id', v_order.id, 'payment_status', v_order.payment_status,
    'order_status', v_order.status, 'checkout_source', v_order.checkout_source,
    'physical_quantity', v_physical_quantity, 'digital_items', v_digital_count,
    'vendor_draft_created', false, 'live_submission_enabled', false,
    'ss_order_submitted', false, 'zerotouch_submitted', false
  );
end;
$$;

revoke all on function public.create_small_order_checkout(jsonb) from public, anon;
grant execute on function public.create_small_order_checkout(jsonb) to authenticated;

create or replace function public.prepare_paid_mixed_order_vendor_draft(p_order_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_existing public.vendor_order_drafts%rowtype;
  v_draft public.vendor_order_drafts%rowtype;
  v_items jsonb;
  v_quantity numeric;
  v_sale_price numeric;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Customer order not found'; end if;
  if v_order.checkout_source <> 'mixed_storefront_order' or v_order.payment_status <> 'paid' then
    raise exception 'A verified paid mixed order is required';
  end if;
  select * into v_existing from public.vendor_order_drafts where customer_order_id = p_order_id order by created_date desc limit 1;
  if found then return jsonb_build_object('created', false, 'draft_id', v_existing.id, 'submitted', false); end if;

  select coalesce(jsonb_agg(item), '[]'::jsonb), coalesce(sum((item->>'quantity')::numeric), 0),
    coalesce(sum((item->>'price')::numeric * (item->>'quantity')::numeric), 0)
  into v_items, v_quantity, v_sale_price
  from jsonb_array_elements(v_order.order_items) item where item ->> 'product_type' = 'physical';
  if jsonb_array_length(v_items) = 0 then raise exception 'Mixed order has no physical fulfillment items'; end if;

  insert into public.vendor_order_drafts (
    owner_user_id, created_by_email, vendor_order_number, customer_order_id,
    customer_order_number, customer_name, customer_email, customer_phone, order_date,
    vendor_status, workflow_status, vendor_name, items, notes, shipping_address,
    shipping_method, garment_cost, sale_price, estimated_profit, admin_notes,
    customer_notes, payment_status, payment_received_at, has_sku_warnings,
    has_image_warnings, has_missing_warnings, total_quantity, item_count,
    production_status, live_submission_enabled, safety_mode_message, zerotouch_enabled,
    zerotouch_mode, is_sample
  ) values (
    v_order.owner_user_id, v_order.created_by_email,
    'MIXED-DRAFT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
    v_order.id, upper(right(v_order.id, 8)), v_order.customer_name, v_order.customer_email,
    v_order.customer_phone, v_order.created_date, 'draft', 'vendor_order_draft_created',
    'Physical fulfillment review', v_items, v_order.delivery_notes, v_order.shipping_address,
    coalesce(v_order.shipping_address ->> 'shipping_method', 'standard'), 0, v_sale_price, 0,
    'Paid mixed order. Digital items are excluded from this physical fulfillment draft.',
    v_order.notes, 'paid', coalesce(v_order.payment_date, now()),
    exists(select 1 from jsonb_array_elements(v_items) item where nullif(item->>'sku', '') is null),
    exists(select 1 from jsonb_array_elements(v_items) item where nullif(item->>'image_url', '') is null),
    false, v_quantity, jsonb_array_length(v_items), 'payment_confirmed', false,
    'No supplier order is submitted until final admin confirmation.', false, 'none', coalesce(v_order.is_sample, false)
  ) returning * into v_draft;

  update public.orders set vendor_order_id = v_draft.id, fulfillment_status = 'vendor_order_needed'
    where id = v_order.id;
  return jsonb_build_object('created', true, 'draft_id', v_draft.id, 'customer_order_id', v_order.id,
    'submitted', false, 'live_submission_enabled', false);
end;
$$;

revoke all on function public.prepare_paid_mixed_order_vendor_draft(text) from public, anon, authenticated;

create or replace function public.guard_paid_small_order_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_errors jsonb;
begin
  if new.archived_at is not null then return new; end if;
  if new.checkout_source in ('customized_small_order', 'mixed_storefront_order')
    and new.payment_status = 'paid' and old.payment_status is distinct from 'paid' then
    if new.payment_confirmation_source not in ('stripe_webhook', 'stripe_verification', 'legacy_stripe')
      or nullif(new.stripe_session_id, '') is null or nullif(new.stripe_payment_intent_id, '') is null
      or new.payment_confirmed_at is null then
      raise exception 'Verified Stripe payment is required before fulfillment' using errcode = '23514';
    end if;
    if round(coalesce(new.amount_paid, 0), 2) <> round(coalesce(new.total_amount, 0), 2)
      or round(coalesce(new.balance_due, 0), 2) <> 0 then
      raise exception 'Paid amount and balance are inconsistent' using errcode = '23514';
    end if;
    v_errors := public.small_order_required_data_errors(new.order_items, new.shipping_address, new.owner_user_id);
    if jsonb_array_length(v_errors) > 0 then raise exception 'Paid order validation failed: %', v_errors::text using errcode = '23514'; end if;
    new.status := 'awaiting_fulfillment';
  end if;
  if new.payment_status is distinct from 'paid'
    and new.fulfillment_status is distinct from 'not_started'
    and new.checkout_source in ('customized_small_order', 'mixed_storefront_order') then
    raise exception 'Unpaid checkout cannot enter fulfillment' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.create_paid_small_order_draft_after_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.payment_status = 'paid' and old.payment_status is distinct from 'paid' then
    if new.checkout_source = 'customized_small_order' then
      perform public.prepare_paid_small_order_vendor_draft(new.id);
    elsif new.checkout_source = 'mixed_storefront_order' then
      perform public.prepare_paid_mixed_order_vendor_draft(new.id);
    end if;
  end if;
  return new;
end;
$$;

commit;
