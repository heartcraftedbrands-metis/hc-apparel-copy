begin;

create table if not exists public.homepage_specials (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.products(id) on delete cascade,
  sku text not null,
  approved boolean not null default false,
  active boolean not null default false,
  headline text,
  subtitle text,
  promo_image_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  display_order integer not null default 0,
  rejected_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, sku),
  constraint homepage_special_dates check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create index if not exists homepage_specials_public_order on public.homepage_specials (display_order, starts_at, ends_at) where approved and active;
create index if not exists homepage_specials_sku_lookup on public.ss_sku_staging (sku, fetched_at desc);
create index if not exists homepage_specials_style_lookup on public.ss_sku_staging
  (upper(btrim(part_number)), lower(btrim(brand)), sku, fetched_at desc);

alter table public.homepage_specials enable row level security;
drop policy if exists homepage_specials_admin on public.homepage_specials;
create policy homepage_specials_admin on public.homepage_specials
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.homepage_specials from anon, authenticated;
grant select, insert, update, delete on public.homepage_specials to authenticated;

-- Uses only stored, read-only S&S SKU data. There is no order API call and no
-- alteration of products or their normal/variant prices.
create or replace function public.homepage_special_candidates()
returns table (
  product_id text, sku text, brand text, product_name text, category text,
  image_url text, inventory_qty integer, vendor_price numeric,
  vendor_special_price numeric, reference_vendor_price numeric,
  public_price numeric, markup numeric, is_vendor_special boolean,
  fetched_at timestamptz, eligible boolean, reason text
)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  return query
  with matched as (
    select distinct on (p.id) p, s,
      coalesce(nullif(p.storefront_price_buffer, 0), 3.00)::numeric as buffer,
      coalesce((
        select (v.value ->> 'price')::numeric
        from jsonb_array_elements(case when jsonb_typeof(p.size_prices) = 'array' then p.size_prices else '[]'::jsonb end) v(value)
        where v.value ->> 'sku' = s.sku
          and v.value ->> 'price' ~ '^\d+(\.\d+)?$'
        limit 1
      ), coalesce(p.sale_price, p.price))::numeric as checkout_price
    from public.products p
    cross join lateral (
      select latest.* from (
        select distinct on (staged.sku) staged.*
        from public.ss_sku_staging staged
        where upper(btrim(staged.part_number)) = upper(btrim(p.style_number))
          and lower(btrim(staged.brand)) = lower(btrim(p.brand))
          and staged.customer_price > 0
        order by staged.sku, staged.fetched_at desc
      ) latest
      order by (latest.inventory_qty > 0) desc,
        (latest.sale_price > 0 and latest.sale_price = latest.customer_price
          and latest.piece_price > latest.sale_price and latest.sale_expiration is null) desc,
        latest.customer_price asc
      limit 1
    ) s
    where p.vendor_source = 'S&S Activewear'
      and p.visibility = 'public' and p.is_active is true and p.is_sample is false
      and p.product_type = 'physical'
    order by p.id,
      (s.inventory_qty > 0) desc,
      (s.sale_price > 0 and s.sale_price = s.customer_price and s.piece_price > s.sale_price and s.sale_expiration is null) desc,
      s.customer_price asc,
      s.fetched_at desc
  )
  select p.id, s.sku, p.brand, p.name, p.category,
    coalesce(nullif(s.color_front_image, ''), nullif(s.color_on_model_front_image, ''), p.image_url),
    s.inventory_qty, s.customer_price,
    case when s.sale_price > 0 and s.sale_price = s.customer_price
      and s.piece_price > s.sale_price
      and s.sale_expiration is null
      then s.sale_price else null end,
    case when s.sale_price > 0 and s.sale_price = s.customer_price
      and s.piece_price > s.sale_price
      and s.sale_expiration is null
      then s.piece_price else null end,
    checkout_price, buffer,
    s.sale_price > 0 and s.sale_price = s.customer_price
      and s.piece_price > s.sale_price
      and s.sale_expiration is null,
    s.fetched_at,
    s.inventory_qty > 0 and p.stock > 0 and s.noe_retailing is false
      and nullif(btrim(p.name), '') is not null
      and lower(p.name) !~ '(test|qa|sample|placeholder)'
      and nullif(btrim(coalesce(s.color_name, '')), '') is not null
      and lower(s.color_name) not in ('?', 'unknown', 'color unavailable')
      and nullif(btrim(coalesce(s.size_name, '')), '') is not null
      and nullif(btrim(coalesce(s.color_front_image, s.color_on_model_front_image, p.image_url)), '') is not null
      and checkout_price >= s.customer_price + buffer
      and s.fetched_at >= now() - interval '30 days',
    case
      when s.inventory_qty <= 0 or p.stock <= 0 then 'Out of stock'
      when s.noe_retailing then 'Vendor restriction'
      when s.fetched_at < now() - interval '30 days' then 'Refresh S&S inventory/pricing before approval'
      when checkout_price < s.customer_price + buffer then 'Public price is below the applicable vendor-plus-buffer floor'
      when nullif(btrim(p.name), '') is null or lower(p.name) ~ '(test|qa|sample|placeholder)' then 'Unusable product name'
      when nullif(btrim(coalesce(s.color_name, '')), '') is null or lower(s.color_name) in ('?', 'unknown', 'color unavailable') then 'Missing color'
      when nullif(btrim(coalesce(s.size_name, '')), '') is null then 'Missing size'
      when nullif(btrim(coalesce(s.color_front_image, s.color_on_model_front_image, p.image_url)), '') is null then 'Missing image'
      else 'Ready for admin review'
    end
  from matched m
  cross join lateral (select (m.p).*) p
  cross join lateral (select (m.s).*) s;
end;
$$;
revoke all on function public.homepage_special_candidates() from public;
grant execute on function public.homepage_special_candidates() to authenticated;

create or replace function public.validate_homepage_special()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_candidate record;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if new.active or (new.approved and (tg_op = 'INSERT' or not old.approved)) then
    select * into v_candidate from public.homepage_special_candidates() c
      where c.product_id = new.product_id and c.sku = new.sku;
    if not found or not v_candidate.eligible then
      raise exception 'This SKU is not eligible for a homepage special; refresh S&S data and verify price, image, inventory, and product status';
    end if;
    if new.active and not new.approved then raise exception 'Approve before activating'; end if;
    if new.active and new.rejected_at is not null then raise exception 'Rejected specials cannot be active'; end if;
  end if;
  new.updated_at := now();
  if tg_op = 'INSERT' then
    if new.approved then new.approved_at := now(); end if;
  elsif new.approved and not old.approved then
    new.approved_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists validate_homepage_special_before_write on public.homepage_specials;
create trigger validate_homepage_special_before_write
before insert or update on public.homepage_specials
for each row execute function public.validate_homepage_special();

-- A narrow public view: never exposes S&S/vendor cost or the manager record.
-- Prices come from the same current product/variant data used by checkout.
create or replace view public.storefront_homepage_specials
with (security_barrier = true) as
select h.id, p.id as product_id, h.sku, p.brand,
  coalesce(nullif(btrim(h.headline), ''), p.name) as name,
  h.subtitle, p.category,
  coalesce(nullif(h.promo_image_url, ''), nullif(s.color_front_image, ''),
    nullif(s.color_on_model_front_image, ''), p.image_url) as image_url,
  coalesce((
    select (v.value ->> 'price')::numeric
    from jsonb_array_elements(case when jsonb_typeof(p.size_prices) = 'array' then p.size_prices else '[]'::jsonb end) v(value)
    where v.value ->> 'sku' = h.sku and v.value ->> 'price' ~ '^\d+(\.\d+)?$'
    limit 1
  ), coalesce(p.sale_price, p.price)) as price,
  case when s.sale_price > 0 and s.sale_price = s.customer_price
    and s.piece_price > s.sale_price and s.sale_expiration is null
    then s.piece_price + coalesce((
      select (v.value ->> 'price')::numeric
      from jsonb_array_elements(case when jsonb_typeof(p.size_prices) = 'array' then p.size_prices else '[]'::jsonb end) v(value)
      where v.value ->> 'sku' = h.sku and v.value ->> 'price' ~ '^\d+(\.\d+)?$'
      limit 1
    ), coalesce(p.sale_price, p.price)) - s.customer_price
    else null end as comparison_price,
  case when s.sale_price > 0 and s.sale_price = s.customer_price
      and s.piece_price > s.sale_price and s.sale_expiration is null then 'Special'
    when p.category in ('hoodies', 'jackets', 'crewnecks') then 'Cold Weather Pick'
    else 'Bulk Friendly' end as badge,
  h.display_order
from public.homepage_specials h
join public.products p on p.id = h.product_id
join lateral (
  select staged.* from public.ss_sku_staging staged
  where staged.sku = h.sku and staged.customer_price > 0
  order by staged.fetched_at desc limit 1
) s on true
where h.approved and h.active and h.rejected_at is null
  and (h.starts_at is null or h.starts_at <= now())
  and (h.ends_at is null or h.ends_at > now())
  and p.visibility = 'public' and p.is_active is true and p.is_sample is false
  and p.product_type = 'physical' and p.vendor_source = 'S&S Activewear'
  and p.stock > 0 and s.inventory_qty > 0 and s.noe_retailing is false
  and s.fetched_at >= now() - interval '30 days'
  and upper(btrim(s.part_number)) = upper(btrim(p.style_number))
  and lower(btrim(s.brand)) = lower(btrim(p.brand))
  and nullif(btrim(p.name), '') is not null
  and lower(p.name) !~ '(test|qa|sample|placeholder)'
  and nullif(btrim(coalesce(s.color_name, '')), '') is not null
  and lower(s.color_name) not in ('?', 'unknown', 'color unavailable')
  and nullif(btrim(coalesce(s.size_name, '')), '') is not null
  and nullif(btrim(coalesce(h.promo_image_url, s.color_front_image, s.color_on_model_front_image, p.image_url)), '') is not null
  and coalesce((
    select (v.value ->> 'price')::numeric
    from jsonb_array_elements(case when jsonb_typeof(p.size_prices) = 'array' then p.size_prices else '[]'::jsonb end) v(value)
    where v.value ->> 'sku' = h.sku and v.value ->> 'price' ~ '^\d+(\.\d+)?$'
    limit 1
  ), coalesce(p.sale_price, p.price)) >= s.customer_price + coalesce(nullif(p.storefront_price_buffer, 0), 3.00);

revoke all on public.storefront_homepage_specials from public;
grant select on public.storefront_homepage_specials to anon, authenticated;

commit;
