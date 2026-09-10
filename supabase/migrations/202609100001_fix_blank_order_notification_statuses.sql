begin;

-- Customer notification routing only. This migration never sends email, changes
-- product/catalog data, or enables S&S/ZeroTouch submission.
create temporary table qa_notification_safety_snapshot on commit drop as
select
  (select count(*) from public.storefront_products) as public_product_count,
  (select count(*) from public.vendor_order_drafts where live_submission_enabled) as live_ss_count,
  (
    select count(*)
    from public.vendor_order_drafts
    where coalesce(zerotouch_enabled, false) or coalesce(zerotouch_ready, false)
  ) as zerotouch_enabled_count;

do $$
declare
  v_table text;
begin
  foreach v_table in array array['orders', 'vendor_order_drafts', 'vendor_orders']
  loop
    execute format(
      'alter table public.%I drop constraint if exists %I',
      v_table,
      v_table || '_production_status_check'
    );
    execute format(
      'alter table public.%I add constraint %I check (production_status in (
        ''order_received'',
        ''payment_confirmed'',
        ''order_reviewed'',
        ''artwork_needed'',
        ''artwork_received'',
        ''artwork_under_review'',
        ''artwork_correction_needed'',
        ''artwork_approved'',
        ''production_packet_ready'',
        ''vendor_draft_ready'',
        ''sent_to_production'',
        ''sent_to_fulfillment'',
        ''shipped'',
        ''delivered'',
        ''completed'',
        ''issue_on_hold'',
        ''cancelled'',
        ''refunded''
      ))',
      v_table,
      v_table || '_production_status_check'
    );
  end loop;
end;
$$;

alter table public.customer_notifications
drop constraint if exists customer_notifications_notification_type_check;

alter table public.customer_notifications
add constraint customer_notifications_notification_type_check check (
  notification_type in (
    'order_received',
    'awaiting_payment',
    'payment_confirmed',
    'order_received_payment_confirmed',
    'order_reviewed',
    'artwork_needed',
    'artwork_received',
    'artwork_under_review',
    'artwork_correction_needed',
    'artwork_approved',
    'production_packet_ready',
    'vendor_draft_ready',
    'preparing_order',
    'sent_to_production',
    'sent_to_fulfillment',
    'in_production',
    'shipped',
    'delivered',
    'completed',
    'issue_on_hold',
    'order_on_hold',
    'cancelled',
    'refunded',
    'custom_update'
  )
);

create or replace function public.customer_notification_order_context(p_order_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with selected_order as (
    select customer_order.*
    from public.orders customer_order
    where customer_order.id = p_order_id
  ), item_flags as (
    select
      selected_order.id,
      selected_order.customer_name,
      selected_order.customer_email,
      selected_order.artwork_needs_correction,
      selected_order.artwork_attention_notes,
      coalesce(selected_order.order_items, '[]'::jsonb) as items,
      exists (
        select 1
        from jsonb_array_elements(coalesce(selected_order.order_items, '[]'::jsonb)) item
        where lower(coalesce(item ->> 'purchase_mode', '')) = 'customized'
           or lower(coalesce(item ->> 'is_customized', 'false')) = 'true'
           or nullif(btrim(coalesce(item ->> 'artwork_file_url', '')), '') is not null
           or nullif(btrim(coalesce(item ->> 'decoration_method', '')), '') is not null
           or nullif(btrim(coalesce(item ->> 'print_placement', '')), '') is not null
           or nullif(btrim(coalesce(item ->> 'print_size_option', '')), '') is not null
      ) as has_custom_printing,
      exists (
        select 1
        from jsonb_array_elements(coalesce(selected_order.order_items, '[]'::jsonb)) item
        where nullif(btrim(coalesce(item ->> 'artwork_file_url', '')), '') is not null
      ) as has_artwork
    from selected_order
  )
  select jsonb_build_object(
    'exists', true,
    'blank_only', jsonb_array_length(items) > 0 and not has_custom_printing,
    'has_custom_printing', has_custom_printing,
    'has_artwork', has_artwork,
    'artwork_needs_correction', coalesce(artwork_needs_correction, false),
    'artwork_attention_notes', coalesce(artwork_attention_notes, ''),
    'customer_name', coalesce(customer_name, 'Customer'),
    'customer_email', coalesce(customer_email, ''),
    'product_name', coalesce(items -> 0 ->> 'product_name', 'HC Apparel order'),
    'quantity', coalesce((
      select sum(coalesce((item ->> 'quantity')::integer, 0))
      from jsonb_array_elements(items) item
    ), 0)
  )
  from item_flags;
$$;

revoke all on function public.customer_notification_order_context(text)
from public, anon, authenticated;

create or replace function public.enforce_customer_notification_order_kind()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_context jsonb;
  v_blank_only boolean;
  v_custom_printing boolean;
  v_has_artwork boolean;
  v_needs_correction boolean;
  v_order_number text;
  v_customer_name text;
  v_product_name text;
  v_quantity text;
  v_attention text;
begin
  v_context := public.customer_notification_order_context(new.order_id);
  if v_context is null or coalesce((v_context ->> 'exists')::boolean, false) is false then
    return new;
  end if;

  v_blank_only := coalesce((v_context ->> 'blank_only')::boolean, false);
  v_custom_printing := coalesce((v_context ->> 'has_custom_printing')::boolean, false);
  v_has_artwork := coalesce((v_context ->> 'has_artwork')::boolean, false);
  v_needs_correction := coalesce((v_context ->> 'artwork_needs_correction')::boolean, false);
  v_order_number := '#' || upper(right(new.order_id, 8));
  v_customer_name := coalesce(nullif(v_context ->> 'customer_name', ''), 'Customer');
  v_product_name := coalesce(nullif(v_context ->> 'product_name', ''), 'HC Apparel order');
  v_quantity := coalesce(nullif(v_context ->> 'quantity', ''), '0');
  v_attention := coalesce(nullif(v_context ->> 'artwork_attention_notes', ''), 'Please contact us for correction details.');

  if tg_op = 'INSERT' then
    new.sent_status := 'draft';
    new.sent_date := null;
  end if;

  if v_blank_only then
    new.trigger_event := case
      when new.notification_type in ('order_received_payment_confirmed', 'artwork_received')
        then 'paid_blank_order'
      else new.trigger_event
    end;
    if new.notification_type = 'order_received_payment_confirmed' then
      new.notification_type := 'payment_confirmed';
    elsif new.notification_type = 'artwork_received' then
      new.notification_type := 'vendor_draft_ready';
    elsif new.notification_type in (
      'artwork_needed',
      'artwork_under_review',
      'artwork_correction_needed',
      'artwork_approved',
      'production_packet_ready'
    ) then
      new.notification_type := 'order_reviewed';
    end if;

    new.related_status := new.notification_type;
    if new.notification_type = 'order_received' then
      new.subject := 'We received ' || v_order_number;
      new.customer_message := 'Hi ' || v_customer_name || ', we received your blank apparel order '
        || v_order_number || ' for ' || v_product_name || ' (quantity ' || v_quantity || '). '
        || 'We will confirm payment and review the order details. Questions? support@ilovehcapparel.net';
    elsif new.notification_type = 'payment_confirmed' then
      new.subject := 'Payment confirmed for ' || v_order_number;
      new.customer_message := 'Hi ' || v_customer_name || ', payment is confirmed for your blank apparel order '
        || v_order_number || ' for ' || v_product_name || ' (quantity ' || v_quantity || '). '
        || 'We will review the order and prepare it for fulfillment. Questions? support@ilovehcapparel.net';
    elsif new.notification_type = 'order_reviewed' then
      new.subject := 'Blank apparel order reviewed for ' || v_order_number;
      new.customer_message := 'Hi ' || v_customer_name || ', we reviewed your blank apparel order '
        || v_order_number || ' for ' || v_product_name || ' (quantity ' || v_quantity || '). '
        || 'We will prepare it for fulfillment. Questions? support@ilovehcapparel.net';
    elsif new.notification_type = 'vendor_draft_ready' then
      new.subject := 'Fulfillment preparation ready for ' || v_order_number;
      new.customer_message := 'Hi ' || v_customer_name || ', your blank apparel order '
        || v_order_number || ' for ' || v_product_name || ' (quantity ' || v_quantity || ') '
        || 'is ready for fulfillment preparation. Nothing has been submitted to a vendor automatically. '
        || 'Questions? support@ilovehcapparel.net';
    end if;
  elsif v_custom_printing and not v_has_artwork and new.notification_type in (
    'artwork_received',
    'artwork_under_review',
    'artwork_approved',
    'production_packet_ready'
  ) then
    if v_needs_correction then
      new.notification_type := 'artwork_correction_needed';
      new.subject := 'Artwork correction needed for ' || v_order_number;
      new.customer_message := 'Hi ' || v_customer_name || ', corrected artwork is needed for custom print order '
        || v_order_number || '. Needs attention: ' || v_attention
        || ' Questions? support@ilovehcapparel.net';
    else
      new.notification_type := 'artwork_needed';
      new.subject := 'Artwork needed for ' || v_order_number;
      new.customer_message := 'Hi ' || v_customer_name || ', artwork is still needed for custom print order '
        || v_order_number || ' before production can continue. Questions? support@ilovehcapparel.net';
    end if;
    new.related_status := new.notification_type;
  end if;

  if tg_op = 'INSERT' then
    new.admin_note := concat_ws(
      E'\n',
      nullif(new.admin_note, ''),
      'Copy-only notification draft. No automatic email was sent.'
    );
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_customer_notification_order_kind()
from public, anon, authenticated;

drop trigger if exists customer_notifications_enforce_order_kind
on public.customer_notifications;
create trigger customer_notifications_enforce_order_kind
before insert or update of notification_type, subject, customer_message
on public.customer_notifications
for each row execute function public.enforce_customer_notification_order_kind();

-- Preserve existing records while correcting unsent drafts created with artwork
-- wording for blank-only orders, including the controlled QA record.
update public.customer_notifications notification
set
  notification_type = notification.notification_type,
  subject = notification.subject,
  customer_message = notification.customer_message
where notification.sent_status = 'draft'
  and notification.notification_type in (
    'order_received_payment_confirmed',
    'artwork_needed',
    'artwork_received',
    'artwork_under_review',
    'artwork_correction_needed',
    'artwork_approved',
    'production_packet_ready'
  )
  and coalesce(
    (public.customer_notification_order_context(notification.order_id) ->> 'blank_only')::boolean,
    false
  );

do $$
declare
  v_public_before bigint;
  v_live_ss_before bigint;
  v_zerotouch_before bigint;
  v_public_after bigint;
  v_live_ss_after bigint;
  v_zerotouch_after bigint;
begin
  select public_product_count, live_ss_count, zerotouch_enabled_count
  into v_public_before, v_live_ss_before, v_zerotouch_before
  from qa_notification_safety_snapshot;
  select count(*) into v_public_after from public.storefront_products;
  select count(*) into v_live_ss_after
  from public.vendor_order_drafts where live_submission_enabled;
  select count(*) into v_zerotouch_after
  from public.vendor_order_drafts
  where coalesce(zerotouch_enabled, false) or coalesce(zerotouch_ready, false);

  if v_public_after <> v_public_before
    or v_live_ss_after <> 0
    or v_zerotouch_after <> 0
    or v_live_ss_after <> v_live_ss_before
    or v_zerotouch_after <> v_zerotouch_before then
    raise exception 'Blank-order notification migration changed a protected safety invariant';
  end if;
end;
$$;

commit;
