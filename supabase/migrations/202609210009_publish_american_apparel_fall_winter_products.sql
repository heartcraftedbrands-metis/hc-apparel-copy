-- Publish only the twelve new American Apparel seasonal drafts that passed
-- authenticated S&S data checks and private product/cart QA. The three blocked
-- seasonal candidates and two unrelated legacy drafts remain private.
begin;

do $$
declare
  v_approved_ids text[] := array[
    '849d3985-2db1-4b8a-b1aa-4478bed86ba5', -- FTJ00
    'efd1c20a-c264-499a-ba38-b755a5659b26', -- RF491
    'f2b732d9-0ee6-4fad-9c96-5ed10d7f1fb0', -- RF497
    '9a6a7605-e6bb-44fd-92e4-7df6aca7b68e', -- RF494
    '2a6df416-d2b5-4657-8ae7-80dde1533975', -- 1304
    '2382bc29-850d-42db-9f4f-bae0fdc770d9', -- 9410
    '1322eed5-91da-44d0-9b43-7eb858daeb29', -- BR2107
    'fbe722a5-2c7c-467a-a84d-88d01d4a619d', -- RF496
    '05535b3c-6529-452d-8e3d-db1ea739c6b3', -- FTP00
    '06e815bb-78a1-4700-a0a9-265faed99e3f', -- 2003CVC
    '083aa936-1505-4b65-9431-196d9241350b', -- 2007
    'fbd98472-3b47-448a-a68a-7072a77b61bc'  -- FTJ77
  ];
  v_approved_styles text[] := array['FTJ00','RF491','RF497','RF494','1304','9410','BR2107','RF496','FTP00','2003CVC','2007','FTJ77'];
  v_before_count integer;
  v_after_count integer;
  v_changed_count integer;
  v_bad_styles text;
begin
  select count(*) into v_before_count
  from public.storefront_products
  where brand = 'American Apparel' or lower(name) like 'american apparel %';
  if v_before_count <> 4 then
    raise exception 'American Apparel storefront count changed; expected 4 before publication, found %', v_before_count;
  end if;

  select count(*) into v_changed_count
  from public.products p
  where p.id = any(v_approved_ids)
    and p.brand = 'American Apparel'
    and p.style_number = any(v_approved_styles)
    and p.visibility = 'draft'
    and p.is_active is false
    and p.draft_qa_status = 'ready_for_admin_approval';
  if v_changed_count <> 12 then
    raise exception 'Expected exactly twelve approved private American Apparel products, found %', v_changed_count;
  end if;

  if (select count(*)
      from public.products p
      join public.storefront_pricing_rules r
        on r.rule_key = p.storefront_pricing_rule_key and r.is_active
      where p.id = any(v_approved_ids)) <> 12 then
    raise exception 'One or more approved American Apparel products lacks an active pricing rule';
  end if;

  -- Recalculate only the new private draft variants with PostgreSQL numeric
  -- rounding so every published SKU meets the authoritative current rule.
  -- Existing public American Apparel prices are intentionally untouched.
  with repriced as (
    select p.id,
      jsonb_agg(
        v.item || jsonb_build_object('price', round(greatest(
          coalesce((v.item->>'price')::numeric, 0),
          (v.item->>'vendor_cost')::numeric + coalesce(r.storefront_margin_buffer, 3),
          (v.item->>'vendor_cost')::numeric * r.cost_multiplier
            + r.fixed_allowance + coalesce(r.storefront_margin_buffer, 3),
          (v.item->>'vendor_cost')::numeric / (1 - r.minimum_margin_percent)
        ), 2)) order by v.ordinality
      ) as size_prices,
      min(round(greatest(
        coalesce((v.item->>'price')::numeric, 0),
        (v.item->>'vendor_cost')::numeric + coalesce(r.storefront_margin_buffer, 3),
        (v.item->>'vendor_cost')::numeric * r.cost_multiplier
          + r.fixed_allowance + coalesce(r.storefront_margin_buffer, 3),
        (v.item->>'vendor_cost')::numeric / (1 - r.minimum_margin_percent)
      ), 2)) as base_price
    from public.products p
    join public.storefront_pricing_rules r
      on r.rule_key = p.storefront_pricing_rule_key and r.is_active
    cross join lateral jsonb_array_elements(p.size_prices) with ordinality as v(item, ordinality)
    where p.id = any(v_approved_ids)
    group by p.id
  )
  update public.products p
  set size_prices = repriced.size_prices,
      price = repriced.base_price,
      storefront_price_applied_at = now()
  from repriced
  where p.id = repriced.id;

  select string_agg(p.style_number, ', ' order by p.style_number) into v_bad_styles
  from public.products p
  where p.id = any(v_approved_ids)
    and (
      p.product_type <> 'physical'
      or p.vendor_source <> 'S&S Activewear'
      or p.vendor_data_refreshed_at is null
      or p.vendor_data_refreshed_at < now() - interval '24 hours'
      or p.stock < 25
      or p.price <= 0
      or p.vendor_cost <= 0
      or nullif(btrim(p.name), '') is null
      or nullif(btrim(p.description), '') is null
      or nullif(btrim(p.image_url), '') is null
      or jsonb_array_length(coalesce(p.size_prices, '[]'::jsonb)) = 0
      or jsonb_array_length(coalesce(p.available_sizes, '[]'::jsonb)) = 0
      or jsonb_array_length(coalesce(p.available_colors, '[]'::jsonb)) = 0
      or p.name ~* '(^|[^[:alnum:]_])(private|qa|test)([^[:alnum:]_]|$)|not[[:space:]]+approved|internal[[:space:]]+(only|note|use)'
      or p.description ~* '(^|[^[:alnum:]_])(private|qa|test)([^[:alnum:]_]|$)|not[[:space:]]+approved|internal[[:space:]]+(only|note|use)'
    );
  if v_bad_styles is not null then
    raise exception 'Approved American Apparel product fields failed publication checks: %', v_bad_styles;
  end if;

  select string_agg(p.style_number || '/' || coalesce(v->>'sku', 'missing-sku')
      || ' price=' || coalesce(v->>'price', 'missing')
      || ' cost=' || coalesce(v->>'vendor_cost', 'missing')
      || ' required=' || round(greatest(
        coalesce((v->>'vendor_cost')::numeric, 0) + coalesce(r.storefront_margin_buffer, 3),
        coalesce((v->>'vendor_cost')::numeric, 0) * r.cost_multiplier
          + r.fixed_allowance + coalesce(r.storefront_margin_buffer, 3),
        coalesce((v->>'vendor_cost')::numeric, 0) / (1 - r.minimum_margin_percent)
      ), 2)::text, ', ' order by p.style_number, v->>'sku') into v_bad_styles
  from public.products p
  join public.storefront_pricing_rules r
    on r.rule_key = p.storefront_pricing_rule_key and r.is_active
  cross join lateral jsonb_array_elements(p.size_prices) v
  where p.id = any(v_approved_ids)
    and (
      nullif(v->>'sku', '') is null
      or nullif(v->>'size', '') is null
      or nullif(v->>'color', '') is null
      or coalesce((v->>'inventory')::numeric, 0) <= 0
      or coalesce((v->>'vendor_cost')::numeric, 0) <= 0
      or coalesce((v->>'price')::numeric, 0) < round(greatest(
        (v->>'vendor_cost')::numeric + coalesce(r.storefront_margin_buffer, 3),
        (v->>'vendor_cost')::numeric * r.cost_multiplier
          + r.fixed_allowance + coalesce(r.storefront_margin_buffer, 3),
        (v->>'vendor_cost')::numeric / (1 - r.minimum_margin_percent)
      ), 2)
    );
  if v_bad_styles is not null then
    raise exception 'Approved American Apparel SKU guard failure: %', v_bad_styles;
  end if;

  update public.products p
  set visibility = 'public',
      is_active = true,
      draft_qa_status = 'approved',
      draft_qa_reviewed_at = now(),
      internal_notes = 'Published after authenticated S&S data validation and private product-detail, isolated cart, image, current inventory, SKU, size/color, guardrail pricing, classification, desktop, and mobile QA on 2026-09-21. Vendor cost and QA history remain admin-only.'
  where p.id = any(v_approved_ids)
    and p.brand = 'American Apparel'
    and p.visibility = 'draft'
    and p.is_active is false
    and p.draft_qa_status = 'ready_for_admin_approval';
  get diagnostics v_changed_count = row_count;
  if v_changed_count <> 12 then
    raise exception 'Expected to publish exactly twelve American Apparel products, updated %', v_changed_count;
  end if;

  -- Correct only the four existing American Apparel records that were already
  -- public but grouped under Other. Prices, variants, and visibility do not change.
  update public.products
  set primary_garment_type = case supplier_sku
        when 'RF498' then 'hoodies'
        else 't_shirts'
      end,
      category = case supplier_sku
        when 'RF498' then 'hoodies'
        else 'short_sleeve_shirts'
      end,
      secondary_tags = case supplier_sku
        when 'RF498' then '["winter_cold_weather"]'::jsonb
        else coalesce(secondary_tags, '[]'::jsonb)
      end,
      tags = case supplier_sku
        when 'RF498' then '["storefront:winter_cold_weather"]'::jsonb
        else coalesce(tags, '[]'::jsonb)
      end
  where brand = 'American Apparel'
    and supplier_sku in ('1301','RF498','2001CVC','2001')
    and visibility = 'public'
    and is_active is true;

  update public.brand_pages
  set categories = array['t_shirts','long_sleeve','hoodies','crewnecks','outerwear','pants','winter_cold_weather','womens','mens'],
      updated_at = now()
  where slug = 'american-apparel';

  select count(*) into v_after_count
  from public.storefront_products
  where brand = 'American Apparel' or lower(name) like 'american apparel %';
  if v_after_count <> v_before_count + 12 then
    raise exception 'Expected twelve additional public American Apparel products, found %', v_after_count - v_before_count;
  end if;

  if (select count(*) from public.storefront_products where id = any(v_approved_ids)) <> 12 then
    raise exception 'All twelve approved American Apparel products are not visible in the storefront projection';
  end if;
end;
$$;

commit;
