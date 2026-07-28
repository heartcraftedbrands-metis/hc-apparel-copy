-- Extend the admin-only customer notification draft workflow across every
-- production lifecycle status. This migration does not send email, alter
-- products, create catalog batches, or enable S&S/ZeroTouch submission.

alter table public.orders
add column if not exists artwork_needs_correction boolean not null default false,
add column if not exists artwork_attention_notes text;

alter table public.vendor_order_drafts
add column if not exists artwork_needs_correction boolean not null default false,
add column if not exists artwork_attention_notes text;

alter table public.vendor_orders
add column if not exists artwork_needs_correction boolean not null default false,
add column if not exists artwork_attention_notes text;

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
        ''artwork_received'',
        ''artwork_under_review'',
        ''artwork_approved'',
        ''production_packet_ready'',
        ''sent_to_production'',
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
add column if not exists copied_at timestamptz,
add column if not exists copied_by uuid references auth.users(id) on delete set null,
add column if not exists copied_by_email text,
add column if not exists manually_sent_at timestamptz,
add column if not exists manually_sent_by uuid references auth.users(id) on delete set null,
add column if not exists manually_sent_by_email text;

alter table public.customer_notifications
drop constraint if exists customer_notifications_notification_type_check;

alter table public.customer_notifications
add constraint customer_notifications_notification_type_check check (
  notification_type in (
    'order_received',
    'awaiting_payment',
    'payment_confirmed',
    'order_received_payment_confirmed',
    'artwork_received',
    'artwork_under_review',
    'artwork_approved',
    'production_packet_ready',
    'preparing_order',
    'sent_to_production',
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

create index if not exists idx_customer_notifications_manual_audit
on public.customer_notifications(order_id, manually_sent_at desc, copied_at desc);

comment on column public.customer_notifications.copied_at is
  'When an admin last copied the subject or message. Copying does not send email.';
comment on column public.customer_notifications.manually_sent_at is
  'When an admin recorded that the draft was sent outside the application.';
comment on column public.orders.artwork_attention_notes is
  'Customer-facing artwork correction details; never contains a private artwork URL.';

do $$
declare
  v_public_before bigint;
  v_public_after bigint;
  v_batch_four_count bigint;
  v_pause_enabled boolean;
  v_live_submission_count bigint;
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

  select count(*) into v_live_submission_count
  from public.vendor_order_drafts draft
  where draft.live_submission_enabled;

  select count(*) into v_public_after
  from public.storefront_products;

  if not coalesce(v_pause_enabled, false)
    or v_batch_four_count <> 0
    or v_live_submission_count <> 0
    or v_public_before <> v_public_after then
    raise exception 'Notification draft workflow changed protected catalog or S&S safety state';
  end if;

  raise notice 'CUSTOMER_NOTIFICATION_DRAFT_WORKFLOW_SAFE %', jsonb_build_object(
    'automatic_email_enabled', false,
    'live_ss_submission_enabled', false,
    'zerotouch_live_submission_enabled', false,
    'batch_four_count', v_batch_four_count,
    'product_loading_paused', v_pause_enabled,
    'public_product_count_before', v_public_before,
    'public_product_count_after', v_public_after
  );
end;
$$;
