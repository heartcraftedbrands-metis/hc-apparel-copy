begin;

create or replace function public.enforce_bulk_quote_minimum()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
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

drop trigger if exists quote_requests_enforce_bulk_minimum
on public.quote_requests;

create trigger quote_requests_enforce_bulk_minimum
before insert or update of quantity
on public.quote_requests
for each row
execute function public.enforce_bulk_quote_minimum();

revoke all on function public.enforce_bulk_quote_minimum()
from public, anon, authenticated;

comment on function public.enforce_bulk_quote_minimum() is
  'Enforces the 50-item minimum for new or quantity-edited bulk quote requests without invalidating historical rows during unrelated workflow updates.';

do $$
declare
  v_product_loading_paused boolean;
  v_vendor_draft_function regprocedure;
begin
  select workflow.product_loading_paused
  into v_product_loading_paused
  from public.ss_catalog_workflow_status workflow
  where workflow.id = true
  limit 1;

  if v_product_loading_paused is distinct from true then
    raise exception 'S&S product loading pause must remain enabled';
  end if;

  select to_regprocedure('public.create_ss_vendor_order_draft_from_quote(text)')
  into v_vendor_draft_function;

  if v_vendor_draft_function is null then
    raise exception 'Vendor order draft workflow must remain available';
  end if;
end;
$$;

commit;
