begin;

drop policy if exists customer_files_owner_insert on storage.objects;
create policy customer_files_owner_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'customer-files'
  and (storage.foldername(name))[1] = 'uploads'
  and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists customer_files_owner_select on storage.objects;
create policy customer_files_owner_select
on storage.objects for select to authenticated
using (
  bucket_id = 'customer-files'
  and (storage.foldername(name))[1] = 'uploads'
  and (storage.foldername(name))[2] = auth.uid()::text
);

create or replace function public.submit_order_help_request(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id text;
  v_email text := lower(trim(coalesce(payload->>'customer_email', '')));
  v_name text := trim(coalesce(payload->>'customer_name', ''));
  v_product_name text := trim(coalesce(payload->>'product_name', ''));
  v_quantity numeric := nullif(payload->>'quantity', '')::numeric;
  v_shipping jsonb := coalesce(payload->'shipping_address', '{}'::jsonb);
  v_artwork_file text := nullif(trim(coalesce(payload->>'artwork_file_url', '')), '');
  v_user_id uuid := auth.uid();
begin
  if v_name = '' or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'A valid customer name and email are required' using errcode = '22023';
  end if;

  if v_product_name = '' then
    raise exception 'Product is required' using errcode = '22023';
  end if;

  if v_quantity is null
    or v_quantity <> trunc(v_quantity)
    or v_quantity < 1
    or v_quantity > 49
  then
    raise exception 'Request Order Help is for orders of 1–49 items. Use Bulk Quote 50+ for larger orders.'
      using errcode = '22023';
  end if;

  if trim(coalesce(payload->>'color', '')) = ''
    or trim(coalesce(payload->>'size', '')) = ''
  then
    raise exception 'Color and size are required' using errcode = '22023';
  end if;

  if trim(coalesce(v_shipping->>'street', '')) = ''
    or trim(coalesce(v_shipping->>'city', '')) = ''
    or trim(coalesce(v_shipping->>'state', '')) = ''
    or trim(coalesce(v_shipping->>'postal_code', '')) = ''
  then
    raise exception 'A complete shipping address is required' using errcode = '22023';
  end if;

  if v_artwork_file is not null and (
    v_user_id is null
    or v_artwork_file not like
      ('supabase://customer-files/uploads/' || v_user_id::text || '/%')
  ) then
    raise exception 'Artwork upload does not belong to the signed-in customer'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.orders recent
    where lower(recent.customer_email) = v_email
      and recent.notes = 'Small order help request'
      and recent.created_date > now() - interval '60 seconds'
  ) then
    raise exception 'Please wait before submitting another order help request'
      using errcode = '42900';
  end if;

  insert into public.orders (
    created_by_email,
    owner_user_id,
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
    has_physical_items,
    shipping_address,
    notes,
    project_notes,
    artwork_file_url,
    artwork_link,
    needs_artwork_help,
    assigned_vendor_name,
    quantity,
    sizes_needed,
    garment_colors
  )
  values (
    v_email,
    v_user_id,
    v_email,
    v_name,
    nullif(trim(coalesce(payload->>'customer_phone', '')), ''),
    jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'product_id', nullif(payload->>'product_id', ''),
      'product_name', v_product_name,
      'brand', nullif(payload->>'brand', ''),
      'style_number', nullif(payload->>'style_number', ''),
      'sku', nullif(payload->>'sku', ''),
      'color', trim(payload->>'color'),
      'size', trim(payload->>'size'),
      'quantity', trunc(v_quantity),
      'image_url', nullif(payload->>'image_url', ''),
      'price', 0
    ))),
    0,
    0,
    0,
    'awaiting_payment',
    'unpaid',
    'not_started',
    true,
    v_shipping || jsonb_build_object(
      'shipping_method', coalesce(nullif(payload->>'shipping_method', ''), 'standard')
    ),
    'Small order help request',
    nullif(trim(coalesce(payload->>'notes', '')), ''),
    v_artwork_file,
    nullif(trim(coalesce(payload->>'artwork_link', '')), ''),
    coalesce((payload->>'needs_artwork_help')::boolean, false),
    'S&S Activewear',
    trunc(v_quantity),
    trim(payload->>'size'),
    trim(payload->>'color')
  )
  returning id into v_order_id;

  insert into public.order_status_history (
    order_id,
    order_number,
    status_title,
    status_type,
    customer_message,
    admin_note,
    customer_visible,
    created_by_email,
    owner_user_id,
    created_by,
    new_value
  )
  values (
    v_order_id,
    '#' || upper(right(v_order_id, 8)),
    'Order help request received',
    'order',
    'HC Apparel received your custom order request and will review it before payment.',
    'Small order flow. No vendor order may be created until payment is received.',
    true,
    v_email,
    v_user_id,
    'customer',
    'awaiting_payment'
  );

  return jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'payment_status', 'unpaid',
    'vendor_order_created', false,
    'live_ss_submission', false
  );
end;
$$;

revoke all on function public.submit_order_help_request(jsonb) from public;
grant execute on function public.submit_order_help_request(jsonb) to anon, authenticated;

comment on function public.submit_order_help_request(jsonb) is
  'Creates an unpaid 1–49 item customer order-help request. It never creates or submits an S&S vendor order.';

do $$
declare
  v_product_loading_paused boolean;
  v_max_batch_sequence integer;
begin
  select
    workflow.product_loading_paused,
    workflow.max_batch_sequence
  into
    v_product_loading_paused,
    v_max_batch_sequence
  from public.ss_catalog_workflow_status workflow
  where workflow.id = true
  limit 1;

  if v_product_loading_paused is distinct from true
    or v_max_batch_sequence is distinct from 3
  then
    raise exception 'S&S product loading must remain paused after Batch 3';
  end if;

  if not exists (
    select 1
    from pg_constraint constraint_record
    where constraint_record.conname = 'vendor_order_drafts_live_submission_disabled_check'
  ) then
    raise exception 'Live S&S submission safety constraint is missing';
  end if;
end;
$$;

commit;
