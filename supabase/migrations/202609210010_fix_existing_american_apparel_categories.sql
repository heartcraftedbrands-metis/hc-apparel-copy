-- Correct garment grouping for the four American Apparel products that were
-- already public. Do not change their prices, variants, or visibility.
update public.products
set primary_garment_type = case
      when id = 'bf4b8a0f-4a7e-4126-8afa-ed6685df7f4a' then 'hoodies'
      else 't_shirts'
    end,
    category = case
      when id = 'bf4b8a0f-4a7e-4126-8afa-ed6685df7f4a' then 'hoodies'
      else 'short_sleeve_shirts'
    end,
    secondary_tags = case
      when id = 'bf4b8a0f-4a7e-4126-8afa-ed6685df7f4a' then '["winter_cold_weather"]'::jsonb
      else coalesce(secondary_tags, '[]'::jsonb)
    end,
    tags = case
      when id = 'bf4b8a0f-4a7e-4126-8afa-ed6685df7f4a' then '["storefront:winter_cold_weather"]'::jsonb
      else coalesce(tags, '[]'::jsonb)
    end
where id in (
  'c1314f21-cbb9-4939-b2f1-e49b60d603d2',
  'bf4b8a0f-4a7e-4126-8afa-ed6685df7f4a',
  'abaf816a-774d-407b-8598-c24f88916dd9',
  '87e3cf23-d6c4-4996-9be1-9eacdcf2b932'
)
  and visibility = 'public'
  and is_active is true;

do $$
begin
  if (select count(*) from public.products
      where id in (
        'c1314f21-cbb9-4939-b2f1-e49b60d603d2',
        'bf4b8a0f-4a7e-4126-8afa-ed6685df7f4a',
        'abaf816a-774d-407b-8598-c24f88916dd9',
        '87e3cf23-d6c4-4996-9be1-9eacdcf2b932'
      )
        and primary_garment_type in ('t_shirts','hoodies')) <> 4 then
    raise exception 'Existing American Apparel category normalization did not cover all four public products';
  end if;
end;
$$;
