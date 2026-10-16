do $$
declare
  v_product_id text := 'bf4b8a0f-4a7e-4126-8afa-ed6685df7f4a';
begin
  if not exists (
    select 1 from public.products
    where id = v_product_id
      and brand = 'American Apparel'
      and name = 'American Apparel T-Shirt'
  ) then
    raise exception 'The verified American Apparel RF498 product was not found; no catalog record was changed';
  end if;

  update public.products
  set name = 'American Apparel Unisex ReFlex Fleece Hoodie Sweatshirt',
      description = case
        when description is null or description = '' or description = 'American Apparel T-Shirt is available as blank apparel in the listed colors and sizes. Custom printing is optional when you need it.'
          then 'American Apparel RF498 Unisex ReFlex Fleece Hoodie Sweatshirt. Available as a blank garment in the listed colors and sizes. DTF and DTG printing are quoted separately after garment and artwork review.'
        else description
      end,
      updated_date = now()
  where id = v_product_id;

  if not exists (select 1 from public.storefront_products where id = v_product_id) then
    raise exception 'RF498 was updated but is not visible in the public storefront view';
  end if;
end;
$$;
