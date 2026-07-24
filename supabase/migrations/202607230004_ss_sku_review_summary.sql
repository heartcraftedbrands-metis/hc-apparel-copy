create or replace function public.ss_sku_review_summary(p_style_session_id text)
returns table (
  brand text,
  total_styles bigint,
  total_skus bigint,
  priced_skus bigint,
  in_stock_skus bigint,
  image_skus bigint,
  missing_price_skus bigint,
  missing_image_skus bigint,
  missing_color_skus bigint,
  missing_size_skus bigint,
  marketplace_restricted_skus bigint,
  unique_colors bigint,
  unique_sizes bigint,
  total_inventory bigint,
  minimum_customer_price numeric,
  maximum_customer_price numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  return query
  select
    s.brand,
    count(distinct s.style_id)::bigint as total_styles,
    count(*)::bigint as total_skus,
    count(*) filter (where coalesce(s.customer_price, 0) > 0)::bigint as priced_skus,
    count(*) filter (where coalesce(s.inventory_qty, 0) > 0)::bigint as in_stock_skus,
    count(*) filter (
      where coalesce(
        nullif(s.color_front_image, ''),
        nullif(s.color_on_model_front_image, ''),
        nullif(s.color_swatch_image, '')
      ) is not null
    )::bigint as image_skus,
    count(*) filter (where coalesce(s.customer_price, 0) <= 0)::bigint as missing_price_skus,
    count(*) filter (
      where coalesce(
        nullif(s.color_front_image, ''),
        nullif(s.color_on_model_front_image, ''),
        nullif(s.color_swatch_image, '')
      ) is null
    )::bigint as missing_image_skus,
    count(*) filter (where nullif(trim(s.color_name), '') is null)::bigint as missing_color_skus,
    count(*) filter (where nullif(trim(s.size_name), '') is null)::bigint as missing_size_skus,
    count(*) filter (where s.noe_retailing is true)::bigint as marketplace_restricted_skus,
    count(distinct nullif(trim(s.color_name), ''))::bigint as unique_colors,
    count(distinct nullif(trim(s.size_name), ''))::bigint as unique_sizes,
    coalesce(sum(greatest(coalesce(s.inventory_qty, 0), 0)), 0)::bigint as total_inventory,
    min(s.customer_price) filter (where coalesce(s.customer_price, 0) > 0)
      as minimum_customer_price,
    max(s.customer_price) filter (where coalesce(s.customer_price, 0) > 0)
      as maximum_customer_price
  from public.ss_sku_staging s
  where s.style_session_id = p_style_session_id
  group by s.brand
  order by s.brand;
end;
$$;

revoke all on function public.ss_sku_review_summary(text) from public, anon;
grant execute on function public.ss_sku_review_summary(text) to authenticated;
