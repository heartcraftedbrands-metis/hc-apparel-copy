begin;

-- Digital Mockups end-to-end verification runs against Stripe test mode. Keep
-- those records out of live operations and financial reporting from creation.
create or replace function public.digital_mockup_create_order(p_order jsonb)
returns text language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_id text := nullif(p_order ->> 'id', '');
  v_email text := lower(nullif(p_order ->> 'customer_email', ''));
  v_total numeric := (p_order ->> 'total_amount')::numeric;
  v_mode text := p_order ->> 'stripe_mode';
  v_is_sample boolean := coalesce((p_order ->> 'is_sample')::boolean, false);
begin
  if v_id is null or v_email is null or v_total is null or v_total <= 0
     or v_mode not in ('test', 'live') or jsonb_typeof(p_order -> 'order_items') <> 'array'
     or (v_is_sample and v_mode <> 'test') then
    raise exception 'Invalid digital mockup order payload';
  end if;
  insert into public.orders (
    id, owner_user_id, created_by_email, customer_email, customer_name,
    order_items, total_amount, product_subtotal, shipping_amount,
    shipping_charged_to_customer, sales_tax_amount, sales_tax_rate_percent,
    sales_tax_jurisdiction_code, sales_tax_jurisdiction_name,
    sales_tax_rate_source, amount_paid, balance_due, status, payment_status,
    fulfillment_status, has_physical_items, shipping_address, billing_address,
    checkout_source, quantity, stripe_mode, pricing_snapshot, is_sample,
    record_environment
  ) values (
    v_id, nullif(p_order ->> 'owner_user_id', '')::uuid, v_email, v_email,
    nullif(p_order ->> 'customer_name', ''), p_order -> 'order_items', v_total,
    (p_order ->> 'product_subtotal')::numeric, 0, 0,
    coalesce((p_order ->> 'sales_tax_amount')::numeric, 0),
    coalesce((p_order ->> 'sales_tax_rate_percent')::numeric, 0),
    nullif(p_order ->> 'sales_tax_jurisdiction_code', ''),
    nullif(p_order ->> 'sales_tax_jurisdiction_name', ''),
    nullif(p_order ->> 'sales_tax_rate_source', ''), 0, v_total,
    'awaiting_payment', 'awaiting_payment', 'not_started', false, '{}'::jsonb,
    coalesce(p_order -> 'billing_address', '{}'::jsonb), 'digital_mockup_order',
    jsonb_array_length(p_order -> 'order_items'), v_mode,
    coalesce(p_order -> 'pricing_snapshot', '{}'::jsonb), v_is_sample,
    case when v_is_sample then 'test' else 'live' end
  );
  return v_id;
end;
$$;

revoke all on function public.digital_mockup_create_order(jsonb) from public, anon, authenticated;
grant execute on function public.digital_mockup_create_order(jsonb) to service_role;

commit;
