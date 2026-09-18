begin;

alter table public.products add column if not exists price_edit_note text;

create table if not exists public.product_price_audit (
  id bigint generated always as identity primary key,
  product_id text not null,
  old_price numeric(10,2),
  new_price numeric(10,2),
  old_sale_price numeric(10,2),
  new_sale_price numeric(10,2),
  edited_by uuid,
  reason text,
  edited_at timestamptz not null default now()
);

alter table public.product_price_audit enable row level security;
create policy product_price_audit_admin_read on public.product_price_audit
  for select to authenticated using (public.is_admin());
revoke all on public.product_price_audit from public, anon, authenticated;
grant select on public.product_price_audit to authenticated;

create or replace function public.guard_admin_product_price()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_rule public.storefront_pricing_rules%rowtype;
  v_floor numeric;
begin
  if auth.role() <> 'authenticated' or not public.is_admin() then
    return new;
  end if;
  if new.price is not distinct from old.price
     and new.sale_price is not distinct from old.sale_price then
    return new;
  end if;

  if new.vendor_cost is null or new.vendor_cost <= 0 then
    -- Existing products without verified cost remain editable; the admin UI
    -- warns that their margin cannot be verified.
    return new;
  end if;

  select * into v_rule from public.storefront_pricing_rules
  where rule_key = new.storefront_pricing_rule_key and is_active;
  if not found then
    select * into v_rule from public.storefront_pricing_rules
    where rule_key = case
      when new.category ilike '%hood%' then 'hoodie'
      when new.category ilike '%crew%' or new.category ilike '%sweat%' then 'crewneck'
      when new.category ilike '%long_sleeve%' then 'long_sleeve'
      when new.category ilike '%jacket%' or new.category ilike '%outerwear%' then 'outerwear'
      when new.category ilike '%fleece%' then 'fleece'
      when new.category ilike '%hat%' then 'hat'
      when new.category ilike '%youth%' then 'youth_kids'
      else 'premium_tshirt'
    end and is_active;
  end if;

  v_floor := greatest(
    coalesce(v_rule.minimum_price, 0),
    new.vendor_cost + coalesce(v_rule.storefront_margin_buffer, 3),
    new.vendor_cost / (1 - coalesce(v_rule.minimum_margin_percent, 0))
  );
  if new.price < round(v_floor, 2)
     or (new.sale_price is not null and new.sale_price < round(v_floor, 2)) then
    raise exception 'Public price is below the current cost and margin floor ($%).', round(v_floor, 2);
  end if;
  return new;
end;
$$;

create or replace function public.audit_product_price_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.price is distinct from old.price
     or new.sale_price is distinct from old.sale_price then
    insert into public.product_price_audit (
      product_id, old_price, new_price, old_sale_price, new_sale_price,
      edited_by, reason
    ) values (
      new.id, old.price, new.price, old.sale_price, new.sale_price,
      auth.uid(), nullif(btrim(new.price_edit_note), '')
    );
  end if;
  return new;
end;
$$;

drop trigger if exists products_guard_admin_price on public.products;
create trigger products_guard_admin_price before update of price, sale_price on public.products
  for each row execute function public.guard_admin_product_price();
drop trigger if exists products_audit_price_change on public.products;
create trigger products_audit_price_change after update of price, sale_price on public.products
  for each row execute function public.audit_product_price_change();

commit;
