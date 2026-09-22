alter table public.checkout_financial_settings
  add column if not exists public_visitor_price_markup_enabled boolean not null default true,
  add column if not exists public_visitor_price_difference numeric not null default 3
    check (public_visitor_price_difference >= 0);

update public.checkout_financial_settings
set public_visitor_price_markup_enabled = true,
    public_visitor_price_difference = 3
where id = 'default'
  and (public_visitor_price_difference is null or public_visitor_price_difference < 0);

create or replace function public.get_public_visitor_pricing()
returns table(enabled boolean, difference numeric)
language sql
security definer
set search_path = public
stable
as $$
  select
    coalesce(public_visitor_price_markup_enabled, true),
    greatest(coalesce(public_visitor_price_difference, 3), 0)
  from public.checkout_financial_settings
  where id = 'default'
  limit 1;
$$;

revoke all on function public.get_public_visitor_pricing() from public;
grant execute on function public.get_public_visitor_pricing() to anon, authenticated;

comment on column public.checkout_financial_settings.public_visitor_price_difference is
  'Display-only merchandise difference for logged-out visitors. Stored product prices remain authenticated HC Apparel customer prices.';
