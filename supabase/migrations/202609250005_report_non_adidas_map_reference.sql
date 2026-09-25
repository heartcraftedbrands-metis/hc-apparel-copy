do $$
declare
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    with matched as (
      select p.id, p.brand, p.style_number, p.name,
        p.price current_customer_price,
        min(s.map_price) filter (where s.inventory_qty > 0 and s.map_price > 0.01) reference_map_price,
        public.product_payment_safe_floor(p) hc_safe_floor
      from public.products p
      join public.ss_sku_staging s
        on lower(s.brand) = lower(p.brand)
       and (
         lower(coalesce(s.style_name, '')) = lower(coalesce(p.style_number, ''))
         or lower(coalesce(s.part_number, '')) = lower(coalesce(p.supplier_sku, ''))
       )
      where p.visibility = 'public' and p.is_active and lower(p.brand) <> 'adidas'
      group by p.id
    )
    select * from matched
    where reference_map_price is not null
      and abs(current_customer_price - reference_map_price) <= 0.01
      and current_customer_price > coalesce(hc_safe_floor, 0) + 0.01
    order by brand, style_number
  loop
    v_count := v_count + 1;
    raise notice 'MAP_REFERENCE_ONLY | % | % | % | current=% | map=% | hc_floor=%',
      v_row.brand, v_row.style_number, v_row.name,
      v_row.current_customer_price, v_row.reference_map_price, v_row.hc_safe_floor;
  end loop;
  raise notice 'MAP_REFERENCE_ONLY_COUNT=%', v_count;
end;
$$;
