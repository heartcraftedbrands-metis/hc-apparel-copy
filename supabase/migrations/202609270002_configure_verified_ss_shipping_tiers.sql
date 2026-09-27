-- Configure the Super Admin-approved S&S fallback tiers from observed account checkout freight.
-- The 13+ tier intentionally remains NULL until a real amount is verified.
alter table public.products
  add column if not exists ss_exclude_free_freight boolean;

comment on column public.products.ss_exclude_free_freight is
  'S&S excludeFreeFreight eligibility. NULL means unknown and must never qualify automatically for free freight.';

alter table public.orders
  add column if not exists shipping_charged_to_customer numeric,
  add column if not exists estimated_s_and_s_shipping numeric,
  add column if not exists actual_s_and_s_shipping numeric;

comment on column public.orders.shipping_charged_to_customer is 'Shipping amount collected from the customer at checkout; never retroactively changed by vendor freight.';
comment on column public.orders.estimated_s_and_s_shipping is 'S&S fallback estimate used at checkout and for preliminary margin reporting.';
comment on column public.orders.actual_s_and_s_shipping is 'Actual S&S freight returned after order confirmation, used for final margin reporting.';

update public.checkout_financial_settings
set ss_shipping_enabled = true,
    ss_free_freight_threshold = 200.00,
    ss_tier_1_2 = 13.50,
    ss_tier_3_5 = 16.50,
    ss_tier_6_12 = 16.50,
    ss_tier_13_plus = null,
    ss_shipping_buffer = 0.00,
    ss_admin_note = 'S&S does not currently provide a pre-order freight quote through this integration. These configurable fallback amounts are based on observed S&S checkout freight and are replaced by actual vendor freight for margin reporting after order confirmation.'
where id = 'default';

create or replace function public.sync_confirmed_ss_freight_to_order()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actual numeric;
begin
  if new.ss_api_response_summary ? 'actual_shipping' then
    begin
      v_actual := nullif(new.ss_api_response_summary ->> 'actual_shipping', '')::numeric;
    exception when invalid_text_representation then
      v_actual := null;
    end;
  end if;

  if v_actual is not null and v_actual >= 0 and new.customer_order_id is not null then
    update public.orders
    set actual_s_and_s_shipping = v_actual,
        actual_vendor_shipping = v_actual,
        shipping_variance = coalesce(shipping_charged_to_customer, shipping_amount, 0) - v_actual
    where id = new.customer_order_id;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_confirmed_ss_freight_to_order() from public, anon, authenticated;

drop trigger if exists sync_confirmed_ss_freight_to_order on public.vendor_order_drafts;
create trigger sync_confirmed_ss_freight_to_order
after insert or update of ss_api_response_summary on public.vendor_order_drafts
for each row execute function public.sync_confirmed_ss_freight_to_order();