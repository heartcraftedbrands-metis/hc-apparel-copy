begin;

-- The legacy schema deliberately revoked service writes to shared commerce
-- tables. Keep that boundary intact: this feature gets CRUD on its dedicated
-- records and narrowly scoped SECURITY DEFINER functions for shared products
-- and orders.
grant select, insert, update, delete on table
  public.digital_mockup_assets,
  public.digital_mockup_versions,
  public.digital_mockup_settings,
  public.digital_mockup_order_access,
  public.digital_download_entitlements,
  public.digital_download_audit
to service_role;

grant select on table
  public.products,
  public.orders,
  public.payment_settings,
  public.storefront_digital_mockups
to service_role;

create or replace function public.digital_mockup_create_product(
  p_id text, p_owner_user_id uuid, p_created_by_email text,
  p_name text, p_description text, p_price numeric,
  p_image_url text, p_tags jsonb, p_supplier_sku text
)
returns text language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if p_id is null or p_name is null or p_price is null or p_price <= 0
     or p_image_url is null or p_supplier_sku is null then
    raise exception 'Invalid digital mockup product payload';
  end if;
  insert into public.products (
    id, owner_user_id, created_by_email, name, description, price,
    product_type, product_subtype, design_type, visibility, image_url,
    mockup_images, file_url, stock, category, categories, tags, is_active,
    supplier_sku, shipping_note
  ) values (
    p_id, p_owner_user_id, p_created_by_email, p_name, p_description, p_price,
    'digital', 'other', '', 'draft', p_image_url, jsonb_build_array(p_image_url),
    null, 1, 'digital_designs', '["digital_designs"]'::jsonb,
    coalesce(p_tags, '[]'::jsonb), false, p_supplier_sku,
    'Digital image download. No physical garment included.'
  );
  return p_id;
end;
$$;

create or replace function public.digital_mockup_update_product(
  p_product_id text, p_name text, p_description text, p_price numeric,
  p_visibility text, p_is_active boolean, p_tags jsonb
)
returns boolean language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if p_price is null or p_price <= 0
     or p_visibility not in ('draft', 'public', 'hidden', 'admin_archive')
     or not exists (select 1 from public.digital_mockup_assets where product_id = p_product_id) then
    raise exception 'Invalid digital mockup product update';
  end if;
  update public.products
  set name = p_name, description = p_description, price = p_price,
      sale_price = null, visibility = p_visibility, is_active = p_is_active,
      tags = coalesce(p_tags, '[]'::jsonb)
  where id = p_product_id and product_type = 'digital' and category = 'digital_designs';
  return found;
end;
$$;

create or replace function public.digital_mockup_hide_orphan_product(p_product_id text)
returns boolean language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  update public.products set visibility = 'hidden', is_active = false
  where id = p_product_id and product_type = 'digital'
    and category = 'digital_designs' and visibility = 'draft';
  return found;
end;
$$;

create or replace function public.digital_mockup_create_order(p_order jsonb)
returns text language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_id text := nullif(p_order ->> 'id', '');
  v_email text := lower(nullif(p_order ->> 'customer_email', ''));
  v_total numeric := (p_order ->> 'total_amount')::numeric;
  v_mode text := p_order ->> 'stripe_mode';
begin
  if v_id is null or v_email is null or v_total is null or v_total <= 0
     or v_mode not in ('test', 'live') or jsonb_typeof(p_order -> 'order_items') <> 'array' then
    raise exception 'Invalid digital mockup order payload';
  end if;
  insert into public.orders (
    id, owner_user_id, created_by_email, customer_email, customer_name,
    order_items, total_amount, product_subtotal, shipping_amount,
    shipping_charged_to_customer, sales_tax_amount, sales_tax_rate_percent,
    sales_tax_jurisdiction_code, sales_tax_jurisdiction_name,
    sales_tax_rate_source, amount_paid, balance_due, status, payment_status,
    fulfillment_status, has_physical_items, shipping_address, billing_address,
    checkout_source, quantity, stripe_mode, pricing_snapshot
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
    coalesce(p_order -> 'pricing_snapshot', '{}'::jsonb)
  );
  return v_id;
end;
$$;

create or replace function public.digital_mockup_set_checkout_session(
  p_order_id text, p_session_id text, p_payment_method text
)
returns boolean language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  update public.orders set stripe_session_id = p_session_id, payment_method = p_payment_method
  where id = p_order_id and checkout_source = 'digital_mockup_order'
    and payment_status = 'awaiting_payment';
  return found;
end;
$$;

create or replace function public.digital_mockup_fail_checkout(p_order_id text, p_reason text)
returns boolean language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  update public.orders set status = 'checkout_failed', payment_status = 'checkout_failed',
    checkout_failure_reason = left(coalesce(p_reason, 'Digital checkout failed'), 500)
  where id = p_order_id and checkout_source = 'digital_mockup_order'
    and payment_status <> 'paid';
  return found;
end;
$$;

create or replace function public.digital_mockup_mark_paid(
  p_order_id text, p_payment_method text, p_payment_method_type text,
  p_actual_processing_cost numeric, p_confirmation_source text,
  p_provider_event_id text, p_session_id text, p_payment_intent_id text
)
returns boolean language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  update public.orders
  set payment_status = 'paid',
      status = case when checkout_source = 'mixed_storefront_order' then 'awaiting_fulfillment' else 'completed' end,
      fulfillment_status = case when checkout_source = 'mixed_storefront_order' then 'not_started' else 'completed' end,
      payment_method = p_payment_method, payment_method_type = p_payment_method_type,
      actual_processing_cost = p_actual_processing_cost, amount_paid = total_amount,
      balance_due = 0, payment_date = now(), payment_confirmed_at = now(),
      payment_confirmation_source = p_confirmation_source,
      payment_provider_event_id = p_provider_event_id, stripe_session_id = p_session_id,
      stripe_payment_intent_id = p_payment_intent_id
  where id = p_order_id
    and checkout_source in ('digital_mockup_order', 'mixed_storefront_order')
    and payment_status <> 'paid';
  return found;
end;
$$;

revoke all on function public.digital_mockup_create_product(text, uuid, text, text, text, numeric, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.digital_mockup_update_product(text, text, text, numeric, text, boolean, jsonb) from public, anon, authenticated;
revoke all on function public.digital_mockup_hide_orphan_product(text) from public, anon, authenticated;
revoke all on function public.digital_mockup_create_order(jsonb) from public, anon, authenticated;
revoke all on function public.digital_mockup_set_checkout_session(text, text, text) from public, anon, authenticated;
revoke all on function public.digital_mockup_fail_checkout(text, text) from public, anon, authenticated;
revoke all on function public.digital_mockup_mark_paid(text, text, text, numeric, text, text, text, text) from public, anon, authenticated;

grant execute on function public.digital_mockup_create_product(text, uuid, text, text, text, numeric, text, jsonb, text) to service_role;
grant execute on function public.digital_mockup_update_product(text, text, text, numeric, text, boolean, jsonb) to service_role;
grant execute on function public.digital_mockup_hide_orphan_product(text) to service_role;
grant execute on function public.digital_mockup_create_order(jsonb) to service_role;
grant execute on function public.digital_mockup_set_checkout_session(text, text, text) to service_role;
grant execute on function public.digital_mockup_fail_checkout(text, text) to service_role;
grant execute on function public.digital_mockup_mark_paid(text, text, text, numeric, text, text, text, text) to service_role;

commit;
