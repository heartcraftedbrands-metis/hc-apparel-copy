alter table public.integration_settings
  add column if not exists ss_default_payment_profile_id bigint,
  add column if not exists ss_payment_profile_email text,
  add column if not exists ss_payment_profile_verified_at timestamptz;

comment on column public.integration_settings.ss_default_payment_profile_id is
  'S&S PaymentProfile identifier only; never stores card or bank credentials.';
comment on column public.integration_settings.ss_payment_profile_email is
  'S&S account email required by the Orders API paymentProfile object; admin-only.';
