begin;

alter table public.storefront_pricing_rules
  add column if not exists storefront_margin_buffer numeric(10, 2) not null default 0
    check (storefront_margin_buffer >= 0);

update public.storefront_pricing_rules
set storefront_margin_buffer = 3.00,
    updated_date = now()
where is_active;

insert into public.storefront_pricing_rules (
  rule_key,
  display_name,
  minimum_price,
  maximum_price,
  cost_multiplier,
  fixed_allowance,
  minimum_margin_percent,
  hide_above_maximum,
  is_active,
  sort_order,
  storefront_margin_buffer
)
values
  (
    'outerwear',
    'Premium outerwear',
    24.99,
    79.99,
    1.20,
    1.50,
    0.08,
    true,
    true,
    95,
    3.00
  ),
  (
    'premium_cold_weather',
    'Premium cold-weather apparel',
    21.99,
    69.99,
    1.20,
    1.50,
    0.08,
    true,
    true,
    96,
    3.00
  )
on conflict (rule_key) do update set
  display_name = excluded.display_name,
  minimum_price = excluded.minimum_price,
  maximum_price = excluded.maximum_price,
  cost_multiplier = excluded.cost_multiplier,
  fixed_allowance = excluded.fixed_allowance,
  minimum_margin_percent = excluded.minimum_margin_percent,
  hide_above_maximum = excluded.hide_above_maximum,
  is_active = true,
  sort_order = excluded.sort_order,
  storefront_margin_buffer = excluded.storefront_margin_buffer,
  updated_date = now();

alter table public.products
  add column if not exists storefront_price_buffer numeric(10, 2) not null default 0,
  add column if not exists storefront_price_before_buffer numeric(10, 2);

with eligible as (
  select
    product.id,
    product.price as prior_price,
    least(
      product.price + rule.storefront_margin_buffer,
      rule.maximum_price + rule.storefront_margin_buffer
    )::numeric(10, 2) as buffered_price,
    rule.storefront_margin_buffer,
    rule.rule_key
  from public.products product
  join public.storefront_pricing_rules rule
    on rule.rule_key = product.storefront_pricing_rule_key
   and rule.is_active
  where product.visibility = 'public'
    and product.is_active
    and product.product_type = 'physical'
    and coalesce(product.storefront_price_buffer, 0) < rule.storefront_margin_buffer
),
audit as (
  insert into public.storefront_pricing_adjustments (
    product_id,
    pricing_rule_key,
    previous_price,
    public_price,
    vendor_cost,
    estimated_profit,
    visibility_action,
    reason
  )
  select
    eligible.id,
    eligible.rule_key,
    eligible.prior_price,
    eligible.buffered_price,
    greatest(coalesce(product.blank_garment_cost, 0), coalesce(product.vendor_cost, 0), 0),
    greatest(
      eligible.buffered_price
        - greatest(coalesce(product.blank_garment_cost, 0), coalesce(product.vendor_cost, 0), 0),
      0
    ),
    'repriced',
    'Configured $3.00 storefront margin buffer applied; decoration remains separate.'
  from eligible
  join public.products product on product.id = eligible.id
  returning product_id
)
update public.products product
set
  storefront_price_before_buffer = eligible.prior_price,
  storefront_price_buffer = eligible.storefront_margin_buffer,
  price = eligible.buffered_price,
  sale_price = null,
  size_prices = case
    when jsonb_typeof(product.size_prices) = 'array' then (
      select coalesce(
        jsonb_agg(
          case
            when jsonb_typeof(variant.value) = 'object'
              and nullif(variant.value ->> 'price', '') is not null
              then jsonb_set(
                variant.value,
                '{price}',
                to_jsonb(
                  least(
                    (variant.value ->> 'price')::numeric + eligible.storefront_margin_buffer,
                    eligible.buffered_price
                  )::numeric(10, 2)
                ),
                true
              )
            else variant.value
          end
          order by variant.ordinality
        ),
        '[]'::jsonb
      )
      from jsonb_array_elements(product.size_prices)
        with ordinality as variant(value, ordinality)
    )
    else product.size_prices
  end,
  profit_estimate = greatest(
    eligible.buffered_price
      - greatest(coalesce(product.blank_garment_cost, 0), coalesce(product.vendor_cost, 0), 0),
    0
  ),
  storefront_premium = case
    when lower(product.name) ~ '^(adidas|oakley|columbia) ' then true
    else product.storefront_premium
  end,
  updated_date = now()
from eligible
where product.id = eligible.id;

alter table public.ss_catalog_workflow_status
  add column if not exists controlled_cold_weather_batch_allowed boolean not null default true,
  add column if not exists controlled_cold_weather_batch_sequence integer not null default 4
    check (controlled_cold_weather_batch_sequence = 4);

update public.ss_catalog_workflow_status
set
  product_loading_paused = true,
  controlled_cold_weather_batch_allowed = true,
  controlled_cold_weather_batch_sequence = 4,
  pause_message = 'Product loading remains paused. Controlled cold-weather Batch 4 is private-only and requires QA.',
  updated_at = now()
where id;

create or replace function public.ss_hc_catalog_category(
  p_style_name text,
  p_brand text default null
)
returns text
language sql
immutable
parallel safe
as $$
  with source as (
    select
      lower(coalesce(p_style_name, '')) as style_text,
      lower(coalesce(p_brand, '')) as brand_text
  )
  select case
    when style_text ~
      '(backpack|back pack|duffel|d(u|o)ffle|tote|cinch|drawstring bag|messenger bag|gear bag|travel bag|laptop bag|waist pack|pouch)'
      then 'accessories'
    when style_text ~
      '(cap|hat|beanie|visor|snapback|bucket hat|headwear)'
      then 'hats'
    when style_text ~ '(hood|hoodie|hooded sweatshirt)'
      then 'hoodies'
    when style_text ~
      '(jacket|outerwear|coat|soft[ -]?shell|shell jacket|vest|parka|anorak|windbreaker)'
      then 'outerwear'
    when brand_text = 'columbia'
      and style_text ~ '(fleece|pullover|quarter[ -]?zip|half[ -]?zip|full[ -]?zip)'
      then 'outerwear'
    when style_text ~ '(youth|toddler|infant|baby)'
      and style_text ~ '(long sleeve|l/s|long-sleeve)'
      then 'youth_long_sleeve_shirts'
    when style_text ~ '(youth|toddler|infant|baby)'
      and style_text ~ '(sweat|fleece|crew)'
      then 'youth_crewnecks'
    when style_text ~ '(youth|toddler|infant|baby)'
      and style_text ~ '(polo)'
      then 'youth_polo_shirts'
    when style_text ~ '(youth|toddler|infant|baby)'
      and style_text ~ '(performance|sport|jersey|active|athletic|moisture)'
      then 'youth_sportswear'
    when style_text ~ '(youth|toddler|infant|baby)'
      then 'youth_short_sleeve_shirts'
    when style_text ~ '(crewneck|crew neck|sweatshirt|fleece crew|sweater)'
      then 'crewnecks'
    when style_text ~ '(polo|golf shirt)'
      then 'polo_shirts'
    when style_text ~ '(performance|sport|jersey|active|athletic|moisture|training|compression)'
      then 'sportswear'
    when style_text ~ '(long sleeve|l/s|long-sleeve)'
      then 'long_sleeve_shirts'
    when style_text ~ '(tank|sleeveless|tee|t-shirt|t shirt|shirt)'
      then 'short_sleeve_shirts'
    else null
  end
  from source;
$$;

revoke all on function public.ss_hc_catalog_category(text, text)
from public, anon;
grant execute on function public.ss_hc_catalog_category(text, text)
to authenticated;

create or replace function public.approve_ss_cold_weather_pricing(
  p_style_session_id text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule_id text;
  v_label text;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.ss_import_staging import_row
    join public.ss_sku_staging staged
      on staged.style_session_id = import_row.import_session_id
    where import_row.import_session_id = p_style_session_id
      and import_row.import_session_id like 'ss-cold-weather-%'
      and import_row.row_status = 'pending'
      and staged.customer_price > 0
  ) then
    raise exception 'No priced cold-weather SKU staging session was found'
      using errcode = 'P0002';
  end if;

  select id into v_rule_id
  from public.ss_pricing_rule_versions
  where style_session_id = p_style_session_id;

  if v_rule_id is not null then
    return v_rule_id;
  end if;

  v_rule_id := gen_random_uuid()::text;
  v_label := 'ss-cold-weather-' || to_char(clock_timestamp(), 'YYYYMMDD-HH24MISS-MS');

  insert into public.ss_pricing_rule_versions (
    id,
    style_session_id,
    version_label,
    status,
    exception_policy,
    rule_config,
    approved_by,
    approved_at
  )
  values (
    v_rule_id,
    p_style_session_id,
    v_label,
    'approved_private',
    'use_recommended_prices',
    jsonb_build_object(
      'storefront_margin_buffer', 3.00,
      'cold_weather_private_only', true,
      'live_submission_enabled', false,
      'automatic_publish', false
    ),
    auth.uid(),
    now()
  );

  with priced as (
    select
      staged.*,
      greatest(
        coalesce(nullif(staged.map_price, 0), 0),
        case
          when coalesce(staged.retail_price, 0) > 0
            then least(
              (ceil(greatest(staged.customer_price * 1.20 + 1.50, 7.99) - 0.99) + 0.99)::numeric,
              staged.retail_price
            )
          else (ceil(greatest(staged.customer_price * 1.20 + 1.50, 7.99) - 0.99) + 0.99)::numeric
        end
      )::numeric(10, 2) as approved_public_base
    from public.ss_sku_staging staged
    where staged.style_session_id = p_style_session_id
      and staged.customer_price > 0
  )
  insert into public.ss_sku_approved_prices (
    rule_version_id,
    style_session_id,
    brand,
    style_id,
    part_number,
    style_name,
    sku,
    customer_cost,
    map_price,
    vendor_retail,
    approved_price,
    contribution_margin,
    marketplace_restricted,
    publish_eligible
  )
  select
    v_rule_id,
    p_style_session_id,
    priced.brand,
    priced.style_id,
    priced.part_number,
    priced.style_name,
    priced.sku,
    priced.customer_price,
    priced.map_price,
    priced.retail_price,
    priced.approved_public_base,
    round(
      (priced.approved_public_base - priced.customer_price)
        / nullif(priced.approved_public_base, 0) * 100,
      1
    ),
    priced.noe_retailing,
    not priced.noe_retailing
  from priced;

  update public.ss_pricing_rule_versions rule
  set
    approved_sku_count = counts.approved_count,
    publish_eligible_sku_count = counts.eligible_count,
    draft_product_count = 0
  from (
    select
      count(*)::integer as approved_count,
      count(*) filter (where publish_eligible)::integer as eligible_count
    from public.ss_sku_approved_prices
    where rule_version_id = v_rule_id
  ) counts
  where rule.id = v_rule_id;

  return v_rule_id;
end;
$$;

revoke all on function public.approve_ss_cold_weather_pricing(text)
from public, anon;
grant execute on function public.approve_ss_cold_weather_pricing(text)
to authenticated;

create or replace function public.create_ss_cold_weather_private_batch(
  p_rule_version_id text,
  p_style_limit integer default 25
)
returns table (
  batch_id text,
  batch_label text,
  batch_sequence integer,
  product_count bigint,
  variant_count bigint,
  columbia_product_count bigint,
  hoodie_product_count bigint,
  already_created boolean
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_rule public.ss_pricing_rule_versions%rowtype;
  v_batch public.ss_launch_batches%rowtype;
  v_style record;
  v_detail record;
  v_price_rule public.storefront_pricing_rules%rowtype;
  v_product_id text;
  v_category text;
  v_subtype text;
  v_categories jsonb;
  v_rule_key text;
  v_public_price numeric(10, 2);
  v_product_count bigint;
  v_variant_count bigint;
  v_columbia_count bigint;
  v_hoodie_count bigint;
  v_requested integer;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  if not coalesce((
    select status.controlled_cold_weather_batch_allowed
    from public.ss_catalog_workflow_status status
    where status.id
  ), false) then
    raise exception 'The controlled cold-weather private batch is not enabled'
      using errcode = '55000';
  end if;

  select rule.* into v_rule
  from public.ss_pricing_rule_versions rule
  where rule.id = p_rule_version_id
    and rule.status = 'approved_private';

  if not found then
    raise exception 'Approved private cold-weather pricing rule not found'
      using errcode = 'P0002';
  end if;
  if not coalesce((v_rule.rule_config ->> 'cold_weather_private_only')::boolean, false) then
    raise exception 'Pricing rule is not approved for the controlled cold-weather batch'
      using errcode = '22023';
  end if;

  select batch.* into v_batch
  from public.ss_launch_batches batch
  where batch.rule_version_id = v_rule.id
  limit 1;

  if found then
    return query
    select
      v_batch.id,
      v_batch.batch_label,
      v_batch.batch_sequence,
      count(*)::bigint,
      coalesce(sum(item.variant_count), 0)::bigint,
      count(*) filter (where lower(item.brand) = 'columbia')::bigint,
      count(*) filter (where product.category = 'hoodies')::bigint,
      true
    from public.ss_launch_batch_items item
    join public.products product on product.id = item.product_id
    where item.batch_id = v_batch.id;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ss-cold-weather-batch-4', 0));

  v_requested := greatest(1, least(coalesce(p_style_limit, 25), 25));
  insert into public.ss_launch_batches (
    rule_version_id,
    style_session_id,
    batch_sequence,
    batch_label,
    status,
    requested_style_count,
    created_by
  )
  values (
    v_rule.id,
    v_rule.style_session_id,
    4,
    'ss-cold-weather-private-' || to_char(clock_timestamp(), 'YYYYMMDD-HH24MISS-MS'),
    'private_draft',
    v_requested,
    auth.uid()
  )
  returning * into v_batch;

  for v_style in
    with style_totals as (
      select
        approved.brand,
        approved.style_id,
        max(approved.part_number) as part_number,
        max(approved.style_name) as style_name,
        max(meta.product_name) as product_name,
        max(meta.product_category) as base_category,
        sum(staged.inventory_qty)::bigint as inventory,
        public.ss_hc_catalog_category(
          concat_ws(
            ' ',
            max(meta.product_name),
            max(meta.product_category),
            max(approved.style_name)
          ),
          approved.brand
        ) as normalized_category
      from public.ss_sku_approved_prices approved
      join public.ss_sku_staging staged
        on staged.style_session_id = approved.style_session_id
       and staged.sku = approved.sku
      join public.ss_import_staging meta
        on meta.import_session_id = approved.style_session_id
       and lower(meta.brand) = lower(approved.brand)
       and meta.style_number = approved.part_number
       and meta.row_status = 'pending'
      where approved.rule_version_id = v_rule.id
        and approved.publish_eligible
        and not approved.marketplace_restricted
        and staged.inventory_qty > 0
        and nullif(coalesce(
          staged.color_on_model_front_image,
          staged.color_front_image,
          staged.color_swatch_image
        ), '') is not null
        and lower(approved.brand) in (
          'columbia',
          'gildan',
          'champion',
          'lane seven',
          'independent trading co',
          'comfort colors',
          'tultex',
          'adidas',
          'oakley'
        )
        and lower(concat_ws(
          ' ',
          meta.product_name,
          meta.product_category,
          approved.style_name
        )) ~ '(hood|hoodie|fleece|jacket|pullover|outerwear|coat|beanie|hat|cap|crewneck|crew neck|sweatshirt|soft[ -]?shell|shell|vest)'
        and not exists (
          select 1
          from public.ss_launch_batch_items prior
          where lower(prior.brand) = lower(approved.brand)
            and prior.style_id = approved.style_id
        )
      group by approved.brand, approved.style_id
    ),
    ranked as (
      select
        style_totals.*,
        row_number() over (
          partition by brand
          order by
            case normalized_category
              when 'hoodies' then 1
              when 'outerwear' then 2
              when 'crewnecks' then 3
              when 'hats' then 4
              else 5
            end,
            inventory desc,
            style_id
        ) as brand_rank
      from style_totals
      where normalized_category in ('hoodies', 'outerwear', 'crewnecks', 'hats')
    )
    select *
    from ranked
    where brand_rank <= 5
    order by
      case when lower(brand) = 'columbia' then 0 else 1 end,
      brand_rank,
      case normalized_category when 'hoodies' then 0 else 1 end,
      inventory desc
    limit v_requested
  loop
    select
      round(avg(approved.customer_cost), 2) as average_cost,
      sum(staged.inventory_qty)::bigint as inventory,
      count(*)::integer as variants,
      coalesce(
        to_jsonb(
          array_agg(distinct staged.size_name order by staged.size_name)
          filter (where nullif(staged.size_name, '') is not null)
        ),
        '[]'::jsonb
      ) as sizes,
      coalesce(
        jsonb_agg(distinct jsonb_build_object(
          'name', staged.color_name,
          'hex', coalesce(nullif(staged.color_1, ''), '')
        )) filter (where nullif(staged.color_name, '') is not null),
        '[]'::jsonb
      ) as colors,
      jsonb_agg(
        jsonb_build_object(
          'size', staged.color_name || ' / ' || staged.size_name,
          'price', approved.approved_price,
          'image_url', coalesce(
            nullif(staged.color_on_model_front_image, ''),
            nullif(staged.color_front_image, ''),
            nullif(staged.color_swatch_image, '')
          ),
          'sku', staged.sku,
          'inventory', staged.inventory_qty,
          'color_hex', coalesce(nullif(staged.color_1, ''), '')
        )
        order by staged.color_name, staged.size_order, staged.size_name, staged.sku
      ) as sku_variants,
      max(coalesce(
        nullif(staged.color_on_model_front_image, ''),
        nullif(staged.color_front_image, ''),
        nullif(staged.color_swatch_image, '')
      )) as image_url
    into v_detail
    from public.ss_sku_approved_prices approved
    join public.ss_sku_staging staged
      on staged.style_session_id = approved.style_session_id
     and staged.sku = approved.sku
    where approved.rule_version_id = v_rule.id
      and approved.brand = v_style.brand
      and approved.style_id = v_style.style_id
      and approved.publish_eligible
      and not approved.marketplace_restricted
      and staged.inventory_qty > 0;

    v_category := v_style.normalized_category;
    v_rule_key := case
      when v_category = 'hats' then 'hat'
      when v_category = 'outerwear' then 'outerwear'
      when lower(v_style.brand) in ('columbia', 'oakley', 'adidas')
        then 'premium_cold_weather'
      when v_category = 'hoodies' then 'hoodie'
      else 'crewneck'
    end;

    select * into v_price_rule
    from public.storefront_pricing_rules
    where rule_key = v_rule_key
      and is_active;

    v_public_price := least(
      v_price_rule.maximum_price + v_price_rule.storefront_margin_buffer,
      (
        ceil(
          greatest(
            v_price_rule.minimum_price,
            v_detail.average_cost * v_price_rule.cost_multiplier
              + v_price_rule.fixed_allowance
          )
          + v_price_rule.storefront_margin_buffer
          - 0.99
        ) + 0.99
      )::numeric(10, 2)
    );

    if (
      v_public_price - v_detail.average_cost
    ) / nullif(v_public_price, 0) < v_price_rule.minimum_margin_percent then
      continue;
    end if;

    v_subtype := case
      when v_category = 'hoodies' then 'hoodies'
      when v_category = 'crewnecks' then 'sweatshirts'
      when v_category = 'outerwear' then 'outerwear'
      when v_category = 'hats' then 'hats'
      else 'apparel_blanks'
    end;
    v_categories := case
      when v_category = 'hats' then jsonb_build_array('hats', 'accessories')
      else jsonb_build_array(v_category)
    end;
    v_product_id := gen_random_uuid()::text;

    insert into public.products (
      id,
      owner_user_id,
      is_sample,
      name,
      description,
      price,
      product_type,
      product_subtype,
      visibility,
      image_url,
      mockup_images,
      stock,
      category,
      categories,
      tags,
      is_active,
      vendor_source,
      vendor_cost,
      blank_garment_cost,
      profit_estimate,
      internal_notes,
      supplier_sku,
      available_sizes,
      available_colors,
      size_prices,
      storefront_pricing_tier,
      storefront_pricing_rule_key,
      storefront_price_buffer,
      storefront_price_before_buffer,
      storefront_premium,
      storefront_image_approved
    )
    values (
      v_product_id,
      auth.uid(),
      true,
      coalesce(nullif(v_style.product_name, ''), v_style.brand || ' ' || v_style.part_number),
      coalesce(
        nullif(v_style.style_name, ''),
        nullif(v_style.product_name, ''),
        v_style.brand || ' ' || v_style.part_number
      )
        || '. Customer-ready blank garment; decoration is priced separately.',
      v_public_price,
      'physical',
      v_subtype,
      'draft',
      v_detail.image_url,
      jsonb_build_array(v_detail.image_url),
      v_detail.inventory,
      v_category,
      v_categories,
      case
        when lower(v_style.brand) in ('columbia', 'oakley', 'adidas')
          then jsonb_build_array(v_style.brand, 'Premium')
        else jsonb_build_array(v_style.brand)
      end,
      false,
      'S&S Activewear',
      v_detail.average_cost,
      v_detail.average_cost,
      greatest(v_public_price - v_detail.average_cost, 0),
      'Controlled cold-weather private Batch 4. Do not publish without private QA and admin approval.',
      v_style.part_number,
      v_detail.sizes,
      v_detail.colors,
      (
        select jsonb_agg(
          jsonb_set(variant.value, '{price}', to_jsonb(v_public_price), true)
          order by variant.ordinality
        )
        from jsonb_array_elements(v_detail.sku_variants)
          with ordinality as variant(value, ordinality)
      ),
      v_price_rule.display_name,
      v_rule_key,
      v_price_rule.storefront_margin_buffer,
      greatest(v_public_price - v_price_rule.storefront_margin_buffer, 0),
      lower(v_style.brand) in ('columbia', 'oakley', 'adidas'),
      true
    );

    insert into public.ss_launch_batch_items (
      batch_id,
      product_id,
      brand,
      style_id,
      part_number,
      variant_count,
      reused_test_product,
      qa_status
    )
    values (
      v_batch.id,
      v_product_id,
      v_style.brand,
      v_style.style_id,
      v_style.part_number,
      v_detail.variants,
      false,
      'pending'
    );
  end loop;

  select
    count(*)::bigint,
    coalesce(sum(item.variant_count), 0)::bigint,
    count(*) filter (where lower(item.brand) = 'columbia')::bigint,
    count(*) filter (where product.category = 'hoodies')::bigint
  into v_product_count, v_variant_count, v_columbia_count, v_hoodie_count
  from public.ss_launch_batch_items item
  join public.products product on product.id = item.product_id
  where item.batch_id = v_batch.id;

  if v_product_count = 0 or v_columbia_count = 0 or v_hoodie_count = 0 then
    raise exception
      'Controlled batch requires eligible Columbia products and at least one additional hoodie';
  end if;

  update public.ss_launch_batches batch
  set
    requested_style_count = v_product_count,
    product_count = v_product_count,
    variant_count = v_variant_count
  where batch.id = v_batch.id;

  update public.ss_catalog_workflow_status
  set
    controlled_cold_weather_batch_allowed = false,
    product_loading_paused = true,
    updated_at = now()
  where id;

  return query select
    v_batch.id,
    v_batch.batch_label,
    v_batch.batch_sequence,
    v_product_count,
    v_variant_count,
    v_columbia_count,
    v_hoodie_count,
    false;
end;
$$;

revoke all on function public.create_ss_cold_weather_private_batch(text, integer)
from public, anon;
grant execute on function public.create_ss_cold_weather_private_batch(text, integer)
to authenticated;

create or replace function public.get_ss_cold_weather_private_qa(
  p_batch_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category_errors bigint;
  v_columbia_count bigint;
  v_hoodie_count bigint;
  v_premium_errors bigint;
  v_buffer_errors bigint;
  v_tshirt_errors bigint;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  select
    count(*) filter (
      where (
        lower(product.name) ~ '(hood|hoodie|hooded sweatshirt)'
        and product.category <> 'hoodies'
      ) or (
        lower(product.name) ~ '(jacket|outerwear|coat|soft[ -]?shell|shell jacket|vest)'
        and product.category <> 'outerwear'
      ) or (
        lower(product.name) ~ '(beanie|hat|cap)'
        and product.category <> 'hats'
      )
    ),
    count(*) filter (where lower(item.brand) = 'columbia'),
    count(*) filter (where product.category = 'hoodies'),
    count(*) filter (
      where lower(item.brand) in ('columbia', 'oakley', 'adidas')
        and not product.storefront_premium
    ),
    count(*) filter (where product.storefront_price_buffer <> 3.00),
    count(*) filter (
      where product.category = 'short_sleeve_shirts'
        and lower(product.name) ~ '(hood|fleece|jacket|pullover|sweat|coat)'
    )
  into
    v_category_errors,
    v_columbia_count,
    v_hoodie_count,
    v_premium_errors,
    v_buffer_errors,
    v_tshirt_errors
  from public.ss_launch_batch_items item
  join public.products product on product.id = item.product_id
  where item.batch_id = p_batch_id;

  return jsonb_build_object(
    'all_passed',
      v_category_errors = 0
      and v_columbia_count > 0
      and v_hoodie_count > 0
      and v_premium_errors = 0
      and v_buffer_errors = 0
      and v_tshirt_errors = 0,
    'category_errors', v_category_errors,
    'columbia_products', v_columbia_count,
    'hoodie_products', v_hoodie_count,
    'premium_badge_errors', v_premium_errors,
    'pricing_buffer_errors', v_buffer_errors,
    'cold_weather_in_tshirts', v_tshirt_errors
  );
end;
$$;

revoke all on function public.get_ss_cold_weather_private_qa(text)
from public, anon;
grant execute on function public.get_ss_cold_weather_private_qa(text)
to authenticated;

create or replace function public.run_ss_private_launch_qa(
  p_batch_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.ss_launch_batches%rowtype;
  v_report jsonb;
  v_cold_report jsonb;
  v_all_passed boolean;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  select batch.* into v_batch
  from public.ss_launch_batches batch
  where batch.id = p_batch_id
  for update;

  if not found then
    raise exception 'Private S&S launch batch not found' using errcode = 'P0002';
  end if;
  if v_batch.status not in ('private_draft', 'qa_passed', 'suspended') then
    raise exception 'Private QA can run only for an unpublished or suspended S&S batch';
  end if;

  v_report := public.get_ss_private_launch_qa(p_batch_id);
  v_all_passed := coalesce((v_report ->> 'all_passed')::boolean, false);

  if v_batch.batch_sequence = 4 then
    v_cold_report := public.get_ss_cold_weather_private_qa(p_batch_id);
    v_all_passed := v_all_passed
      and coalesce((v_cold_report ->> 'all_passed')::boolean, false);
    v_report := jsonb_set(v_report, '{cold_weather}', v_cold_report, true);
    v_report := jsonb_set(v_report, '{all_passed}', to_jsonb(v_all_passed), true);
  end if;

  insert into public.ss_private_launch_qa_reports (
    batch_id,
    generated_by,
    all_passed,
    report
  )
  values (p_batch_id, auth.uid(), v_all_passed, v_report);

  update public.ss_launch_batches
  set status = case when v_all_passed then 'qa_passed' else 'private_draft' end
  where id = p_batch_id;

  update public.ss_launch_batch_items
  set qa_status = case when v_all_passed then 'passed' else 'pending' end
  where batch_id = p_batch_id;

  return jsonb_set(
    v_report,
    '{batch,status}',
    to_jsonb(case when v_all_passed then 'qa_passed' else 'private_draft' end),
    true
  );
end;
$$;

revoke all on function public.run_ss_private_launch_qa(text)
from public, anon;
grant execute on function public.run_ss_private_launch_qa(text)
to authenticated;

do $$
begin
  if exists (
    select 1
    from public.storefront_products
    where lower(name) like 'gildan 5000%'
      and price > 10.99
  ) then
    raise exception 'Buffered basic Gildan pricing is no longer customer-friendly';
  end if;

  if exists (
    select 1
    from public.storefront_products
    where price >= 55
      and not coalesce(is_premium, false)
  ) then
    raise exception 'An unmarked shocking public price remains after buffer application';
  end if;

  if (select count(*) from public.storefront_products) <> 57 then
    raise exception 'The public product count changed during private cold-weather setup';
  end if;
end;
$$;

commit;
