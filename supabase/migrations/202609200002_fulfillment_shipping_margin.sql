create table if not exists public.checkout_financial_settings (
  id text primary key default 'default',
  minimum_margin_per_item numeric not null default 3.00 check (minimum_margin_per_item >= 0),
  processing_enabled boolean not null default true,
  processing_percent numeric not null default 3.50 check (processing_percent >= 0),
  processing_fixed_fee numeric not null default 0.50 check (processing_fixed_fee >= 0),
  sales_tax_enabled boolean not null default false,
  sales_tax_rate_percent numeric not null default 0 check (sales_tax_rate_percent >= 0),
  ss_shipping_enabled boolean not null default true,
  ss_free_freight_threshold numeric not null default 200.00 check (ss_free_freight_threshold >= 0),
  ss_tier_1_2 numeric check (ss_tier_1_2 >= 0),
  ss_tier_3_5 numeric check (ss_tier_3_5 >= 0),
  ss_tier_6_12 numeric check (ss_tier_6_12 >= 0),
  ss_tier_13_plus numeric check (ss_tier_13_plus >= 0),
  ss_shipping_buffer numeric not null default 0 check (ss_shipping_buffer >= 0),
  ss_admin_note text not null default 'Fallback freight is a customer-facing estimate, not an exact S&S quote. Actual freight is captured after S&S confirms the order.',
  usps_enabled boolean not null default false,
  usps_ground_advantage_enabled boolean not null default true,
  usps_priority_mail_enabled boolean not null default true,
  origin_name text,
  origin_street text,
  origin_city text,
  origin_state text,
  origin_zip text,
  default_product_weight_oz numeric check (default_product_weight_oz > 0),
  default_package_length_in numeric check (default_package_length_in > 0),
  default_package_width_in numeric check (default_package_width_in > 0),
  default_package_height_in numeric check (default_package_height_in > 0),
  package_presets jsonb not null default '[]'::jsonb,
  hc_fallback_enabled boolean not null default false,
  hc_fallback_rate numeric check (hc_fallback_rate >= 0),
  hc_free_shipping_enabled boolean not null default false,
  hc_free_shipping_threshold numeric check (hc_free_shipping_threshold >= 0),
  hc_handling_amount numeric not null default 0 check (hc_handling_amount >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.checkout_financial_settings (id, processing_percent, processing_fixed_fee)
select 'default',
       coalesce((select stripe_fee_buffer_percent from public.payment_fee_settings order by updated_date desc nulls last limit 1), 3.50),
       coalesce((select stripe_fixed_fee_buffer from public.payment_fee_settings order by updated_date desc nulls last limit 1), 0.50)
on conflict (id) do nothing;

alter table public.products
  add column if not exists fulfillment_source text not null default 'ss_activewear',
  add column if not exists shipping_weight_oz numeric,
  add column if not exists package_length_in numeric,
  add column if not exists package_width_in numeric,
  add column if not exists package_height_in numeric;

alter table public.products drop constraint if exists products_fulfillment_source_check;
alter table public.products add constraint products_fulfillment_source_check
  check (fulfillment_source in ('ss_activewear', 'hc_apparel'));

alter table public.orders
  add column if not exists product_subtotal numeric,
  add column if not exists shipping_amount numeric,
  add column if not exists sales_tax_amount numeric,
  add column if not exists printing_revenue numeric,
  add column if not exists vendor_garment_cost numeric,
  add column if not exists estimated_vendor_shipping numeric,
  add column if not exists actual_vendor_shipping numeric,
  add column if not exists usps_quoted_shipping numeric,
  add column if not exists actual_shipping_cost numeric,
  add column if not exists shipping_variance numeric,
  add column if not exists payment_processing_estimate numeric,
  add column if not exists printing_cost_estimate numeric,
  add column if not exists other_vendor_fees numeric,
  add column if not exists net_margin_before_shipping numeric,
  add column if not exists estimated_net_margin numeric,
  add column if not exists final_net_margin numeric,
  add column if not exists shipping_components jsonb,
  add column if not exists pricing_snapshot jsonb,
  add column if not exists shipping_carrier text,
  add column if not exists shipping_service text,
  add column if not exists shipping_quote_at timestamptz,
  add column if not exists shipping_package jsonb;

alter table public.checkout_financial_settings enable row level security;
drop policy if exists checkout_financial_settings_admin_all on public.checkout_financial_settings;
create policy checkout_financial_settings_admin_all on public.checkout_financial_settings
for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.checkout_financial_settings from anon, authenticated;
grant select, insert, update on public.checkout_financial_settings to authenticated;

create or replace function public.set_checkout_financial_settings_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;
drop trigger if exists checkout_financial_settings_updated_at on public.checkout_financial_settings;
create trigger checkout_financial_settings_updated_at before update on public.checkout_financial_settings
for each row execute function public.set_checkout_financial_settings_updated_at();

comment on column public.checkout_financial_settings.ss_tier_1_2 is 'Admin-configured S&S fallback freight. NULL blocks checkout; never silently treated as zero.';
comment on column public.products.fulfillment_source is 'ss_activewear uses configured fallback freight; hc_apparel uses USPS live rates.';
