-- Admin-only, idempotent internal draft creation. S&S inventory is checked by
-- the Edge Function immediately before this RPC; this function never submits.
create or replace function public.create_blank_ss_fulfillment_draft(p_order_id text)
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
  v_address jsonb;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Customer order not found';
  end if;
  if v_order.payment_status <> 'paid'
    or coalesce(v_order.balance_due, v_order.total_amount - v_order.amount_paid, 0) > 0
    or coalesce(v_order.amount_paid, 0) < coalesce(v_order.total_amount, 0) then
    raise exception 'Payment must be confirmed with no balance due';
  end if;

  v_address := coalesce(v_order.shipping_address, '{}'::jsonb);
  if nullif(btrim(coalesce(v_address->>'street', v_address->>'line1', v_address->>'address1', '')), '') is null
    or nullif(btrim(coalesce(v_address->>'city', '')), '') is null
    or nullif(btrim(coalesce(v_address->>'state', '')), '') is null
    or nullif(btrim(coalesce(v_address->>'zip', v_address->>'postal_code', '')), '') is null then
    raise exception 'Complete shipping address is required';
  end if;

  v_items := coalesce(v_order.order_items, '[]'::jsonb);
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'Order has no garment items';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_items) item
    where nullif(btrim(coalesce(item->>'sku', '')), '') is null
      or nullif(btrim(coalesce(item->>'product_name', '')), '') is null
      or nullif(btrim(coalesce(item->>'color', '')), '') is null
      or nullif(btrim(coalesce(item->>'size', '')), '') is null
      or coalesce((item->>'quantity')::numeric, 0) <= 0
      or item->>'purchase_mode' = 'customized'
      or coalesce(item->>'is_customized', 'false') = 'true'
      or nullif(btrim(coalesce(item->>'artwork_file_url', '')), '') is not null
      or nullif(btrim(coalesce(item->>'decoration_method', '')), '') is not null
      or nullif(btrim(coalesce(item->>'print_method', '')), '') is not null
      or btrim(coalesce(item->>'print_placement', '')) not in ('', '[]')
  ) then
    raise exception 'Blank garment SKU, variant, quantity, and no-print validation failed';
  end if;
  if nullif(btrim(coalesce(v_order.artwork_file_url, '')), '') is not null
    or nullif(btrim(coalesce(v_order.artwork_link, '')), '') is not null
    or nullif(btrim(coalesce(v_order.print_method, '')), '') is not null
    or (v_order.print_placement is not null and v_order.print_placement not in ('[]'::jsonb, '""'::jsonb))
    or nullif(btrim(coalesce(v_order.what_to_print, '')), '') is not null then
    raise exception 'Custom printing orders require the production workflow';
  end if;

  select * into v_existing from public.vendor_order_drafts
    where customer_order_id = p_order_id order by created_date desc limit 1;
  if found then
    return jsonb_build_object('created', false, 'draft_id', v_existing.id, 'submitted', false);
  end if;
  if exists (select 1 from public.vendor_orders where customer_order_id = p_order_id) then
    raise exception 'Order is already linked to a vendor order';
  end if;

  select coalesce(jsonb_agg(item || jsonb_build_object(
    'garment_cost', 0,
    'sale_price', coalesce((item->>'price')::numeric, 0),
    'estimated_profit', 0,
    'notes', ''
  )), '[]'::jsonb) into v_items from jsonb_array_elements(v_items) item;

  insert into public.vendor_order_drafts (
    owner_user_id, created_by_email, vendor_order_number, customer_order_id,
    customer_order_number, customer_name, customer_email, customer_phone,
    order_date, vendor_status, workflow_status, vendor_name, items,
    shipping_address, shipping_method, sale_price, payment_status,
    payment_received_at, total_quantity, item_count, production_status,
    live_submission_enabled, safety_mode_message, zerotouch_enabled,
    zerotouch_mode, admin_notes, is_sample
  ) values (
    v_order.owner_user_id, v_order.created_by_email,
    'SS-DRAFT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
    v_order.id, upper(right(v_order.id, 8)), v_order.customer_name,
    v_order.customer_email, v_order.customer_phone, v_order.created_date,
    'draft', 'vendor_order_draft_created', 'S&S Activewear', v_items,
    v_address, coalesce(v_address->>'shipping_method', 'standard'),
    v_order.total_amount, 'paid', coalesce(v_order.payment_date, now()),
    (select sum((item->>'quantity')::numeric) from jsonb_array_elements(v_items) item),
    jsonb_array_length(v_items), 'payment_confirmed', false,
    'No S&S order is submitted until final admin confirmation.', false,
    'none', 'Ready for S&S review. Paid blank garment order; no artwork or printing.',
    coalesce(v_order.is_sample, false)
  ) returning * into v_draft;

  update public.orders set vendor_order_id = v_draft.id,
    assigned_vendor_name = 'S&S Activewear',
    fulfillment_status = 'vendor_order_needed'
  where id = v_order.id;

  return jsonb_build_object('created', true, 'draft_id', v_draft.id,
    'customer_order_id', v_order.id, 'submitted', false,
    'live_submission_enabled', false);
end;
$$;

revoke all on function public.create_blank_ss_fulfillment_draft(text) from public, anon;
grant execute on function public.create_blank_ss_fulfillment_draft(text) to authenticated;
