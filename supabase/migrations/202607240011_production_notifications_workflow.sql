-- Administrative production tracking for paid customer orders.
-- This migration does not alter checkout, catalog visibility, pricing, or S&S submission safety.

alter table public.orders
add column if not exists production_status text not null default 'order_received',
add column if not exists production_hold_reason text;

alter table public.vendor_order_drafts
add column if not exists production_status text not null default 'order_received',
add column if not exists production_hold_reason text;

alter table public.vendor_orders
add column if not exists production_status text not null default 'order_received',
add column if not exists production_hold_reason text;

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
        ''cancelled''
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
    'artwork_received',
    'artwork_approved',
    'preparing_order',
    'sent_to_production',
    'in_production',
    'shipped',
    'delivered',
    'completed',
    'order_on_hold',
    'custom_update'
  )
);

create table if not exists public.production_status_history (
  id text primary key default gen_random_uuid()::text,
  changed_at timestamptz not null default now(),
  entity_type text not null check (entity_type in ('order', 'vendor_order_draft', 'vendor_order')),
  entity_id text not null,
  customer_order_id text,
  previous_status text,
  new_status text not null,
  hold_reason text,
  admin_note text,
  changed_by uuid references auth.users(id) on delete set null,
  changed_by_email text
);

create index if not exists idx_production_status_history_entity
on public.production_status_history(entity_type, entity_id, changed_at desc);

create index if not exists idx_production_status_history_customer_order
on public.production_status_history(customer_order_id, changed_at desc);

alter table public.production_status_history enable row level security;

drop policy if exists admin_select_production_status_history
on public.production_status_history;
create policy admin_select_production_status_history
on public.production_status_history
for select to authenticated
using (public.is_admin());

revoke all on public.production_status_history from public, anon, authenticated;
grant select on public.production_status_history to authenticated;

create or replace function public.log_production_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous_status text;
  v_customer_order_id text;
  v_hold_reason text;
  v_admin_note text;
begin
  v_previous_status := case when tg_op = 'INSERT' then null else old.production_status end;

  if tg_op = 'UPDATE' and v_previous_status is not distinct from new.production_status then
    return new;
  end if;

  if tg_table_name = 'orders' then
    v_customer_order_id := new.id;
    v_hold_reason := new.production_hold_reason;
    v_admin_note := new.internal_notes;
  elsif tg_table_name = 'vendor_order_drafts' then
    v_customer_order_id := new.customer_order_id;
    v_hold_reason := new.production_hold_reason;
    v_admin_note := coalesce(new.admin_notes, new.notes);
  else
    v_customer_order_id := new.customer_order_id;
    v_hold_reason := new.production_hold_reason;
    v_admin_note := new.internal_notes;
  end if;

  insert into public.production_status_history (
    entity_type,
    entity_id,
    customer_order_id,
    previous_status,
    new_status,
    hold_reason,
    admin_note,
    changed_by,
    changed_by_email
  )
  values (
    case tg_table_name
      when 'orders' then 'order'
      when 'vendor_order_drafts' then 'vendor_order_draft'
      else 'vendor_order'
    end,
    new.id,
    v_customer_order_id,
    v_previous_status,
    new.production_status,
    v_hold_reason,
    v_admin_note,
    auth.uid(),
    coalesce(auth.jwt() ->> 'email', 'system')
  );

  return new;
end;
$$;

drop trigger if exists orders_log_production_status on public.orders;
create trigger orders_log_production_status
after insert or update of production_status on public.orders
for each row execute function public.log_production_status_change();

drop trigger if exists vendor_order_drafts_log_production_status on public.vendor_order_drafts;
create trigger vendor_order_drafts_log_production_status
after insert or update of production_status on public.vendor_order_drafts
for each row execute function public.log_production_status_change();

drop trigger if exists vendor_orders_log_production_status on public.vendor_orders;
create trigger vendor_orders_log_production_status
after insert or update of production_status on public.vendor_orders
for each row execute function public.log_production_status_change();

