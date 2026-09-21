-- Publish only the 19 newly imported Champion drafts explicitly approved by the owner.
-- CHP180 and every pre-existing Champion draft remain private.
begin;

do $$
declare
  v_before_count integer;
  v_changed_count integer;
  v_after_count integer;
  v_bad_styles text;
  v_styles text[] := array[
    'CO100','CO126','8187','S171','CO125','P930','S800','S450','S149','S101',
    'CHP200','CHP115','CHP160','SL650','CHP100','CHP120','CHP140','CHP130','S790'
  ];
begin
  select count(*) into v_before_count from public.storefront_products;
  if v_before_count <> 107 then
    raise exception 'Live storefront count changed; expected 107 before Champion publication, found %', v_before_count;
  end if;

  select count(*) into v_changed_count
  from public.products p
  where p.brand = 'Champion' and p.style_number = any(v_styles)
    and p.visibility = 'draft' and p.is_active is false
    and p.internal_notes like 'Ready for Admin Approval only.%';
  if v_changed_count <> 19 then
    raise exception 'Expected exactly 19 approved private Champion drafts, found %', v_changed_count;
  end if;

  if (select count(*) from public.products p
      join public.storefront_pricing_rules r
        on r.rule_key = p.storefront_pricing_rule_key and r.is_active
      where p.brand = 'Champion' and p.style_number = any(v_styles)) <> 19 then
    raise exception 'One or more approved Champion products lacks an active pricing rule';
  end if;
  select string_agg(p.style_number, ', ' order by p.style_number) into v_bad_styles
  from public.products p
  where p.brand = 'Champion' and p.style_number = any(v_styles)
    and (p.product_type <> 'physical'
      or p.vendor_data_refreshed_at is null
      or p.stock <= 1 or p.price <= 0 or p.vendor_cost <= 0
      or nullif(btrim(p.name), '') is null
      or nullif(btrim(p.description), '') is null
      or nullif(btrim(p.image_url), '') is null
      or jsonb_array_length(coalesce(p.size_prices, '[]'::jsonb)) = 0
      or jsonb_array_length(coalesce(p.available_sizes, '[]'::jsonb)) = 0
      or jsonb_array_length(coalesce(p.available_colors, '[]'::jsonb)) = 0
      or p.name ~* '(^|[^[:alnum:]_])(private|qa|test)([^[:alnum:]_]|$)|(launch|catalog)[-[:space:]]?batch|not[[:space:]]+approved'
      or p.description ~* '(^|[^[:alnum:]_])(private|qa|test)([^[:alnum:]_]|$)|(launch|catalog)[-[:space:]]?batch|not[[:space:]]+approved');
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
      else 'unknown variant failure' end, ', ' order by p.style_number || ': ' || case
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
      else 'unknown variant failure' end)
    into v_bad_styles
    from public.products p
    join public.storefront_pricing_rules r
      on r.rule_key = p.storefront_pricing_rule_key and r.is_active
    cross join lateral jsonb_array_elements(p.size_prices) v
    where p.brand = 'Champion' and p.style_number = any(v_styles)
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
      )
  ;
  if v_bad_styles is not null then
    raise exception 'Approved Champion SKU guard failure: %', v_bad_styles;
  end if;

  update public.products p
  set visibility = 'public',
      is_active = true,
      draft_qa_status = 'approved',
      draft_qa_reviewed_at = now(),
      internal_notes = 'Published after explicit owner approval and private product-detail, isolated cart, pricing, inventory, image, variant, and mobile QA on 2026-09-21. Owner explicitly approved the reviewed prices as a merchandising-cap override; vendor-cost, minimum-margin, and MAP protections remain enforced. Vendor cost and QA history remain admin-only.'
  where p.brand = 'Champion'
    and p.style_number = any(v_styles)
    and p.visibility = 'draft' and p.is_active is false
    and p.internal_notes like 'Ready for Admin Approval only.%';
  get diagnostics v_changed_count = row_count;
  if v_changed_count <> 19 then
    raise exception 'Expected to publish exactly 19 Champion rows, updated %', v_changed_count;
  end if;

  select count(*) into v_after_count from public.storefront_products;
  if v_after_count <> v_before_count + 19 then
    raise exception 'Expected 19 additional storefront rows, found %', v_after_count - v_before_count;
  end if;

  if (select count(*) from public.storefront_products p
      where p.brand = 'Champion' and p.style_number = any(v_styles)) < 19 then
    raise exception 'All 19 approved Champion products are not visible in the storefront projection';
  end if;

  if exists (
    select 1 from public.products p
    where p.brand = 'Champion' and p.style_number = 'CHP180'
      and (p.visibility <> 'draft' or p.is_active is true)
  ) then
    raise exception 'Blocked Champion CHP180 must remain private';
  end if;

  if exists (
    select 1 from public.products p
    where p.brand = 'Champion' and p.style_number in ('CH1000', 'T105')
      and (p.visibility <> 'draft' or p.is_active is true)
  ) then
    raise exception 'Pre-existing Champion drafts must remain private';
  end if;
end;
$$;

commit;
