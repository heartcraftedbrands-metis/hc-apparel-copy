-- Checkout pricing runs in an Edge Function and must not expose this protected
-- settings row to browser roles. The function is intentionally executable only
-- by service_role and returns a fixed, checkout-only field list.
create or replace function public.get_checkout_pricing_settings_server()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', s.id,
    'minimum_margin_per_item', s.minimum_margin_per_item,
    'processing_enabled', s.processing_enabled,
    'processing_percent', s.processing_percent,
    'processing_fixed_fee', s.processing_fixed_fee,
    'payment_method_costs', s.payment_method_costs,
    'sales_tax_enabled', s.sales_tax_enabled,
    'sales_tax_rate_percent', s.sales_tax_rate_percent,
    'ss_shipping_enabled', s.ss_shipping_enabled,
    'ss_free_freight_threshold', s.ss_free_freight_threshold,
    'ss_tier_1_2', s.ss_tier_1_2,
    'ss_tier_3_5', s.ss_tier_3_5,
    'ss_tier_6_12', s.ss_tier_6_12,
    'ss_tier_13_plus', s.ss_tier_13_plus,
    'ss_shipping_buffer', s.ss_shipping_buffer,
    'usps_enabled', s.usps_enabled,
    'usps_ground_advantage_enabled', s.usps_ground_advantage_enabled,
    'usps_priority_mail_enabled', s.usps_priority_mail_enabled,
    'origin_street', s.origin_street,
    'origin_city', s.origin_city,
    'origin_state', s.origin_state,
    'origin_zip', s.origin_zip,
    'default_product_weight_oz', s.default_product_weight_oz,
    'default_product_weight_unit', s.default_product_weight_unit,
    'default_package_length_in', s.default_package_length_in,
    'default_package_width_in', s.default_package_width_in,
    'default_package_height_in', s.default_package_height_in,
    'default_package_dimension_unit', s.default_package_dimension_unit,
    'hc_fallback_enabled', s.hc_fallback_enabled,
    'hc_fallback_rate', s.hc_fallback_rate,
    'hc_free_shipping_enabled', s.hc_free_shipping_enabled,
    'hc_free_shipping_threshold', s.hc_free_shipping_threshold,
    'hc_handling_amount', s.hc_handling_amount
  )
  from public.checkout_financial_settings s
  where s.id = 'default'
  limit 1;
$$;

revoke all on function public.get_checkout_pricing_settings_server() from public, anon, authenticated;
grant execute on function public.get_checkout_pricing_settings_server() to service_role;

comment on function public.get_checkout_pricing_settings_server() is
  'Server-only checkout configuration reader. Never grant to anon or authenticated.';
