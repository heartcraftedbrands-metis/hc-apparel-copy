begin;

create or replace function public.enforce_bulk_quote_minimum()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- The 50-piece rule belongs only to the legacy bulk-order intake path.
  -- Personalized Design Studio requests retain their actual garment quantity.
  if coalesce(new.product_type, '') <> 'bulk_order' then
    return new;
  end if;

  if new.quantity is null
    or new.quantity <> trunc(new.quantity)
    or new.quantity < 50
  then
    raise exception
      'Bulk quotes are for orders of 50 or more. For smaller orders, please use Request Order Help on the product page.'
      using errcode = '22023';
  end if;

  new.quantity := trunc(new.quantity);
  return new;
end;
$$;

revoke all on function public.enforce_bulk_quote_minimum()
from public, anon, authenticated;

commit;
