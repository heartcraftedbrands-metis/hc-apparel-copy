-- A Stripe order is not awaiting payment until a Checkout session exists.
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check check (status in (
  'awaiting_payment', 'checkout_pending', 'checkout_failed', 'paid',
  'awaiting_fulfillment', 'in_production', 'shipped', 'completed',
  'canceled', 'refunded'
));

alter table public.orders drop constraint if exists orders_payment_status_check;
alter table public.orders add constraint orders_payment_status_check check (payment_status in (
  'unpaid', 'partially_paid', 'paid', 'refunded', 'awaiting_payment',
  'checkout_pending', 'checkout_failed', 'pay_later', 'demo'
));

alter table public.orders
  add column if not exists checkout_failure_reason text,
  add column if not exists checkout_failure_at timestamptz,
  add column if not exists checkout_issue_resolved_at timestamptz,
  add column if not exists checkout_issue_archived_at timestamptz;

create or replace function public.start_small_stripe_order_pending()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_payment_mode text;
begin
  if new.checkout_source <> 'customized_small_order' then return new; end if;
  select payment_mode into v_payment_mode from public.payment_settings
  order by updated_date desc limit 1;
  if v_payment_mode = 'stripe' then
    new.status := 'checkout_pending';
    new.payment_status := 'checkout_pending';
  elsif new.payment_method is null and v_payment_mode = 'manual' then
    new.payment_method := 'Manual';
  elsif new.payment_method is null and v_payment_mode = 'pay_later' then
    new.payment_method := 'Pay Later';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_small_stripe_checkout_pending on public.orders;
create trigger orders_small_stripe_checkout_pending before insert on public.orders
for each row execute function public.start_small_stripe_order_pending();

create or replace function public.describe_pending_checkout_history()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status_title = 'Order Received' and new.new_value = 'awaiting_payment'
    and exists (
      select 1 from public.orders o where o.id = new.order_id
      and o.checkout_source = 'customized_small_order' and o.status = 'checkout_pending'
    )
  then
    new.status_title := 'Checkout Started';
    new.customer_message := 'Your checkout is being prepared. No payment has been taken.';
    new.admin_note := 'Stripe session not yet created. No vendor order was submitted.';
    new.new_value := 'checkout_pending';
  end if;
  return new;
end;
$$;

drop trigger if exists order_history_pending_checkout on public.order_status_history;
create trigger order_history_pending_checkout before insert on public.order_status_history
for each row execute function public.describe_pending_checkout_history();
