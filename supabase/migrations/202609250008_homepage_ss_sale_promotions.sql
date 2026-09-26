begin;

alter table public.homepage_specials
  add column if not exists promotion_slot smallint,
  add column if not exists sale_field_source text;

alter table public.homepage_specials
  drop constraint if exists homepage_specials_promotion_slot_check;
alter table public.homepage_specials
  add constraint homepage_specials_promotion_slot_check
  check (promotion_slot is null or promotion_slot between 1 and 3);

alter table public.homepage_specials
  drop constraint if exists homepage_specials_badge_label_check;
alter table public.homepage_specials
  add constraint homepage_specials_badge_label_check check (badge_label in (
    'Current Pick', 'Great Blank Price', 'Bulk Friendly', 'Cold Weather Pick',
    'Creator Favorite', 'Team Order Pick', 'Brand Builder Pick',
    'adidas Sale Pick', 'American Apparel Sale Pick', 'Columbia Sale Pick'
  ));

create unique index if not exists homepage_specials_active_slot
  on public.homepage_specials (promotion_slot) where active and promotion_slot is not null;

create or replace function public.ss_sale_is_current(p_sale_price numeric, p_sale_expiration text)
returns boolean language plpgsql stable set search_path = public, pg_temp as $$
begin
  if coalesce(p_sale_price, 0) <= 0 then return false; end if;
  if nullif(btrim(coalesce(p_sale_expiration, '')), '') is null then return true; end if;
  begin
    return p_sale_expiration::timestamptz >= now();
  exception when others then
    return false;
  end;
end;
$$;

drop function if exists public.homepage_special_candidates();
create function public.homepage_special_candidates()
returns table (
  product_id text, sku text, brand text, product_name text, style_number text, category text,
  image_url text, inventory_qty integer, vendor_price numeric,
  vendor_special_price numeric, reference_vendor_price numeric,
  public_price numeric, markup numeric, is_vendor_special boolean,
  sale_field_source text, sale_expiration text,
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
        where v.value ->> 'sku' = s.sku and v.value ->> 'price' ~ '^\d+(\.\d+)?$'
        limit 1
      ), coalesce(p.sale_price, p.price))::numeric as customer_price
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
      order by public.ss_sale_is_current(latest.sale_price, latest.sale_expiration) desc,
        (latest.inventory_qty > 0) desc, latest.inventory_qty desc,
        (latest.fetched_at >= now() - interval '30 days') desc, latest.fetched_at desc
      limit 1
    ) s
    where p.vendor_source = 'S&S Activewear' and p.visibility = 'public'
      and p.is_active is true and p.is_sample is false and p.product_type = 'physical'
    order by p.id, public.ss_sale_is_current(s.sale_price, s.sale_expiration) desc,
      (s.inventory_qty > 0) desc, s.inventory_qty desc, s.fetched_at desc
  )
  select p.id, s.sku, p.brand, p.name, p.style_number, p.category,
    coalesce(nullif(s.color_front_image, ''), nullif(s.color_on_model_front_image, ''), p.image_url),
    s.inventory_qty, s.customer_price,
    case when public.ss_sale_is_current(s.sale_price, s.sale_expiration) then s.sale_price else null end,
    case when public.ss_sale_is_current(s.sale_price, s.sale_expiration) then s.piece_price else null end,
    customer_price, buffer, public.ss_sale_is_current(s.sale_price, s.sale_expiration),
    case when public.ss_sale_is_current(s.sale_price, s.sale_expiration) then 'S&S salePrice' else null end,
    s.sale_expiration, s.fetched_at,
    s.inventory_qty > 0 and p.stock > 0 and s.noe_retailing is false
      and nullif(btrim(p.name), '') is not null
      and lower(p.name) !~ '(test|qa|sample|placeholder)'
      and nullif(btrim(coalesce(s.color_name, '')), '') is not null
      and lower(s.color_name) not in ('?', 'unknown', 'color unavailable')
      and nullif(btrim(coalesce(s.size_name, '')), '') is not null
      and nullif(btrim(coalesce(s.color_front_image, s.color_on_model_front_image, p.image_url)), '') is not null
      and customer_price >= s.customer_price + buffer
      and s.fetched_at >= now() - interval '30 days',
    case
      when not public.ss_sale_is_current(s.sale_price, s.sale_expiration) then 'S&S salePrice is missing or expired'
      when s.inventory_qty <= 0 or p.stock <= 0 then 'Out of stock'
      when s.noe_retailing then 'Vendor restriction'
      when s.fetched_at < now() - interval '30 days' then 'Refresh S&S inventory/pricing before approval'
      when customer_price < s.customer_price + buffer then 'HC Apparel customer price is below the applicable vendor-plus-buffer floor'
      when nullif(btrim(p.name), '') is null or lower(p.name) ~ '(test|qa|sample|placeholder)' then 'Unusable product name'
      when nullif(btrim(coalesce(s.color_name, '')), '') is null or lower(s.color_name) in ('?', 'unknown', 'color unavailable') then 'Missing color'
      when nullif(btrim(coalesce(s.size_name, '')), '') is null then 'Missing size'
      when nullif(btrim(coalesce(s.color_front_image, s.color_on_model_front_image, p.image_url)), '') is null then 'Missing image'
      else 'Ready for admin review'
    end
  from matched m cross join lateral (select (m.p).*) p cross join lateral (select (m.s).*) s;
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
    if not found or not v_candidate.eligible or not v_candidate.is_vendor_special then
      raise exception 'This SKU is not an eligible current S&S sale; refresh sale status, inventory, price, image, and product data';
    end if;
    if new.promotion_slot is null then raise exception 'Choose Promo 1, Promo 2, or Promo 3'; end if;
    if new.active and not new.approved then raise exception 'Approve before activating'; end if;
    if new.active and new.rejected_at is not null then raise exception 'Rejected promotions cannot be active'; end if;
    new.sale_field_source := v_candidate.sale_field_source;
  end if;
  new.updated_at := now();
  if tg_op = 'INSERT' then
    if new.approved then new.approved_at := now(); end if;
  elsif new.approved and not old.approved then new.approved_at := now();
  end if;
  return new;
end;
$$;

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
  null::numeric as comparison_price, h.badge_label as badge,
  h.display_order, p.style_number, h.promotion_slot
from public.homepage_specials h
join public.products p on p.id = h.product_id
join lateral (
  select staged.* from public.ss_sku_staging staged
  where staged.sku = h.sku and staged.customer_price > 0
  order by staged.fetched_at desc limit 1
) s on true
where h.approved and h.active and h.rejected_at is null
  and h.promotion_slot between 1 and 3
  and (h.starts_at is null or h.starts_at <= now())
  and (h.ends_at is null or h.ends_at > now())
  and p.visibility = 'public' and p.is_active is true and p.is_sample is false
  and p.product_type = 'physical' and p.vendor_source = 'S&S Activewear'
  and p.stock > 0 and s.inventory_qty > 0 and s.noe_retailing is false
  and s.fetched_at >= now() - interval '30 days'
  and public.ss_sale_is_current(s.sale_price, s.sale_expiration)
  and upper(btrim(s.part_number)) = upper(btrim(p.style_number))
  and lower(btrim(s.brand)) = lower(btrim(p.brand))
  and nullif(btrim(coalesce(h.promo_image_url, s.color_front_image, s.color_on_model_front_image, p.image_url)), '') is not null;

revoke all on public.storefront_homepage_specials from public;
grant select on public.storefront_homepage_specials to anon, authenticated;

commit;
