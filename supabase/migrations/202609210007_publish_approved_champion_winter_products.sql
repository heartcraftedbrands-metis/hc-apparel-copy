-- Publish only the six Champion winter products explicitly approved by the owner.
-- Every other Champion draft and blocked candidate remains private.
begin;

do $$
declare
  v_approved_ids text[] := array[
    'e64794e5-2cc2-4c9d-a9be-494c18eb98d6', -- P800
    '824f5d5a-a64a-4fc8-a3f6-4fc299a5875c', -- S7CB0
    'd09fcd70-83c5-4747-b620-c65d2ca46f25', -- RW01W
    'af54d2d1-a385-4413-93e0-532c2c5a0b09', -- CC8C
    '2156135e-6bc4-4a44-a6a4-54581da3c25d', -- CH1751
    '33dfb8c5-d58a-4875-baa9-a5394419f5bf'  -- T137
  ];
  v_approved_styles text[] := array['P800','S7CB0','RW01W','CC8C','CH1751','T137'];
  v_blocked_styles text[] := array['CHP190','S760','CD400D','CD450','T453','RW10','RW25'];
  v_before_count integer;
  v_after_count integer;
  v_changed_count integer;
  v_bad_styles text;
begin
  select count(*) into v_before_count
  from public.storefront_products
  where brand = 'Champion' or lower(name) like 'champion %';
  if v_before_count <> 24 then
    raise exception 'Champion storefront count changed; expected 24 before publication, found %', v_before_count;
  end if;

  select count(*) into v_changed_count
  from public.products p
  where p.id = any(v_approved_ids)
    and p.brand = 'Champion'
    and p.style_number = any(v_approved_styles)
    and p.visibility = 'draft'
    and p.is_active is false
    and p.draft_qa_status = 'ready_for_admin_approval';
  if v_changed_count <> 6 then
    raise exception 'Expected exactly six approved private Champion products, found %', v_changed_count;
  end if;

  if exists (
    select 1
    from public.products p
    where p.id = any(v_approved_ids)
      and p.style_number <> case p.id
        when 'e64794e5-2cc2-4c9d-a9be-494c18eb98d6' then 'P800'
        when '824f5d5a-a64a-4fc8-a3f6-4fc299a5875c' then 'S7CB0'
        when 'd09fcd70-83c5-4747-b620-c65d2ca46f25' then 'RW01W'
        when 'af54d2d1-a385-4413-93e0-532c2c5a0b09' then 'CC8C'
        when '2156135e-6bc4-4a44-a6a4-54581da3c25d' then 'CH1751'
        when '33dfb8c5-d58a-4875-baa9-a5394419f5bf' then 'T137'
      end
  ) then
    raise exception 'An approved Champion product ID no longer matches its reviewed style';
  end if;

  if (select count(*)
      from public.products p
      join public.storefront_pricing_rules r
        on r.rule_key = p.storefront_pricing_rule_key and r.is_active
      where p.id = any(v_approved_ids)) <> 6 then
    raise exception 'One or more approved Champion products lacks an active pricing rule';
  end if;

  select string_agg(p.style_number, ', ' order by p.style_number) into v_bad_styles
  from public.products p
  where p.id = any(v_approved_ids)
    and (
      p.product_type <> 'physical'
      or p.vendor_source <> 'S&S Activewear'
      or p.vendor_data_refreshed_at is null
      or p.stock <= 0
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
    raise exception 'Approved Champion product fields failed publication checks: %', v_bad_styles;
  end if;

  select string_agg(distinct p.style_number || ': ' || case
      when nullif(v->>'sku', '') is null then 'missing SKU'
      when nullif(v->>'size', '') is null then 'missing size'
      when nullif(v->>'color', '') is null then 'missing color'
      when coalesce((v->>'inventory')::numeric, 0) <= 0 then 'missing inventory'
      when coalesce((v->>'vendor_cost')::numeric, 0) <= 0 then 'missing vendor cost'
      when coalesce((v->>'price')::numeric, 0) < round(greatest(
        (v->>'vendor_cost')::numeric + coalesce(r.storefront_margin_buffer, 3),
        (v->>'vendor_cost')::numeric * r.cost_multiplier
          + r.fixed_allowance + coalesce(r.storefront_margin_buffer, 3),
        (v->>'vendor_cost')::numeric / (1 - r.minimum_margin_percent)
      ), 2) then 'below margin floor'
      else 'variant validation failed' end, ', ' order by p.style_number || ': ' || case
      when nullif(v->>'sku', '') is null then 'missing SKU'
      when nullif(v->>'size', '') is null then 'missing size'
      when nullif(v->>'color', '') is null then 'missing color'
      when coalesce((v->>'inventory')::numeric, 0) <= 0 then 'missing inventory'
      when coalesce((v->>'vendor_cost')::numeric, 0) <= 0 then 'missing vendor cost'
      when coalesce((v->>'price')::numeric, 0) < round(greatest(
        (v->>'vendor_cost')::numeric + coalesce(r.storefront_margin_buffer, 3),
        (v->>'vendor_cost')::numeric * r.cost_multiplier
          + r.fixed_allowance + coalesce(r.storefront_margin_buffer, 3),
        (v->>'vendor_cost')::numeric / (1 - r.minimum_margin_percent)
      ), 2) then 'below margin floor'
      else 'variant validation failed' end)
    into v_bad_styles
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
    raise exception 'Approved Champion SKU guard failure: %', v_bad_styles;
  end if;

  if exists (
    select 1 from public.products
    where brand = 'Champion' and style_number = any(v_blocked_styles)
      and (visibility = 'public' or is_active is true)
  ) then
    raise exception 'A blocked Champion style is unexpectedly public';
  end if;

  update public.products p
  set name = case p.id
        when 'e64794e5-2cc2-4c9d-a9be-494c18eb98d6' then 'Champion Powerblend Open-Bottom Sweatpants'
        when '824f5d5a-a64a-4fc8-a3f6-4fc299a5875c' then 'Champion Powerblend Contrast Hooded Sweatshirt'
        when 'd09fcd70-83c5-4747-b620-c65d2ca46f25' then 'Champion Women''s Reverse Weave Cropped Hoodie'
        when 'af54d2d1-a385-4413-93e0-532c2c5a0b09' then 'Champion Unisex Long Sleeve T-Shirt'
        when '2156135e-6bc4-4a44-a6a4-54581da3c25d' then 'Champion Youth Long Sleeve T-Shirt'
        when '33dfb8c5-d58a-4875-baa9-a5394419f5bf' then 'Champion Raglan Baseball T-Shirt'
      end,
      description = case
        when p.id = 'e64794e5-2cc2-4c9d-a9be-494c18eb98d6'
          then regexp_replace(p.description, '\minternal\M', 'inside', 'gi')
        else p.description
      end,
      category = case p.id
        when 'e64794e5-2cc2-4c9d-a9be-494c18eb98d6' then 'sportswear'
        when '824f5d5a-a64a-4fc8-a3f6-4fc299a5875c' then 'hoodies'
        when 'd09fcd70-83c5-4747-b620-c65d2ca46f25' then 'hoodies'
        when 'af54d2d1-a385-4413-93e0-532c2c5a0b09' then 'long_sleeve_shirts'
        when '2156135e-6bc4-4a44-a6a4-54581da3c25d' then 'youth_long_sleeve_shirts'
        when '33dfb8c5-d58a-4875-baa9-a5394419f5bf' then 'sportswear'
      end,
      primary_garment_type = case p.id
        when 'e64794e5-2cc2-4c9d-a9be-494c18eb98d6' then 'pants'
        when '824f5d5a-a64a-4fc8-a3f6-4fc299a5875c' then 'hoodies'
        when 'd09fcd70-83c5-4747-b620-c65d2ca46f25' then 'hoodies'
        when 'af54d2d1-a385-4413-93e0-532c2c5a0b09' then 'long_sleeve'
        when '2156135e-6bc4-4a44-a6a4-54581da3c25d' then 'long_sleeve'
        when '33dfb8c5-d58a-4875-baa9-a5394419f5bf' then 't_shirts'
      end,
      secondary_tags = case p.id
        when 'e64794e5-2cc2-4c9d-a9be-494c18eb98d6' then '["winter_cold_weather"]'::jsonb
        when '824f5d5a-a64a-4fc8-a3f6-4fc299a5875c' then '["winter_cold_weather"]'::jsonb
        when 'd09fcd70-83c5-4747-b620-c65d2ca46f25' then '["womens","winter_cold_weather"]'::jsonb
        when 'af54d2d1-a385-4413-93e0-532c2c5a0b09' then '[]'::jsonb
        when '2156135e-6bc4-4a44-a6a4-54581da3c25d' then '["kids"]'::jsonb
        when '33dfb8c5-d58a-4875-baa9-a5394419f5bf' then '["sportswear"]'::jsonb
      end,
      tags = case p.id
        when 'e64794e5-2cc2-4c9d-a9be-494c18eb98d6' then '["storefront:winter_cold_weather"]'::jsonb
        when '824f5d5a-a64a-4fc8-a3f6-4fc299a5875c' then '["storefront:winter_cold_weather"]'::jsonb
        when 'd09fcd70-83c5-4747-b620-c65d2ca46f25' then '["storefront:womens","storefront:winter_cold_weather"]'::jsonb
        when 'af54d2d1-a385-4413-93e0-532c2c5a0b09' then '[]'::jsonb
        when '2156135e-6bc4-4a44-a6a4-54581da3c25d' then '["storefront:kids"]'::jsonb
        when '33dfb8c5-d58a-4875-baa9-a5394419f5bf' then '["storefront:sportswear"]'::jsonb
      end,
      visibility = 'public',
      is_active = true,
      draft_qa_status = 'approved',
      draft_qa_reviewed_at = now(),
      internal_notes = 'Published after explicit owner approval and private product-detail, isolated cart, image, current inventory, SKU, size/color, guardrail pricing, classification, and mobile-layout QA on 2026-09-21. Vendor cost and QA history remain admin-only.'
  where p.id = any(v_approved_ids)
    and p.brand = 'Champion'
    and p.visibility = 'draft'
    and p.is_active is false
    and p.draft_qa_status = 'ready_for_admin_approval';
  get diagnostics v_changed_count = row_count;
  if v_changed_count <> 6 then
    raise exception 'Expected to publish exactly six Champion products, updated %', v_changed_count;
  end if;

  select count(*) into v_after_count
  from public.storefront_products
  where brand = 'Champion' or lower(name) like 'champion %';
  if v_after_count <> v_before_count + 6 then
    raise exception 'Expected six additional public Champion products, found %', v_after_count - v_before_count;
  end if;

  if (select count(*) from public.storefront_products
      where id = any(v_approved_ids)) <> 6 then
    raise exception 'All six approved Champion products are not visible in the storefront projection';
  end if;

  if exists (
    select 1 from public.products
    where brand = 'Champion' and style_number = any(v_blocked_styles)
      and (visibility = 'public' or is_active is true)
  ) then
    raise exception 'A blocked Champion style changed visibility during publication';
  end if;
end;
$$;

commit;
