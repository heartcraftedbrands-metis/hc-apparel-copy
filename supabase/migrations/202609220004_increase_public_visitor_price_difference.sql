alter table public.checkout_financial_settings
  alter column public_visitor_price_difference set default 5;

update public.checkout_financial_settings
set public_visitor_price_difference = 5
where id = 'default';

create or replace function public.get_public_visitor_pricing()
returns table(enabled boolean, difference numeric)
language sql security definer set search_path = public stable
as $$
  select coalesce(public_visitor_price_markup_enabled, true),
         greatest(coalesce(public_visitor_price_difference, 5), 0)
  from public.checkout_financial_settings where id = 'default' limit 1;
$$;

revoke all on function public.get_public_visitor_pricing() from public;
grant execute on function public.get_public_visitor_pricing() to anon, authenticated;
