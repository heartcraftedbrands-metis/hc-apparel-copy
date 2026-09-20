alter table public.checkout_financial_settings
  add column if not exists default_product_weight_unit text not null default 'oz',
  add column if not exists default_package_dimension_unit text not null default 'in';

alter table public.checkout_financial_settings drop constraint if exists checkout_financial_settings_weight_unit_check;
alter table public.checkout_financial_settings add constraint checkout_financial_settings_weight_unit_check check (default_product_weight_unit in ('oz', 'lb'));
alter table public.checkout_financial_settings drop constraint if exists checkout_financial_settings_dimension_unit_check;
alter table public.checkout_financial_settings add constraint checkout_financial_settings_dimension_unit_check check (default_package_dimension_unit in ('in', 'cm'));
