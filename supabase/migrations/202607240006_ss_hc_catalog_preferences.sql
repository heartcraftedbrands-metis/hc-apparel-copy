create or replace function public.ss_hc_catalog_category(
  p_style_name text,
  p_brand text default null
)
returns text
language sql
immutable
parallel safe
as $$
  select case
    when lower(coalesce(p_style_name, '')) ~
      '(backpack|back pack|duffel|d(u|o)ffle|tote|cinch|drawstring bag|messenger bag|gear bag|travel bag|laptop bag|waist pack|pouch)'
      then 'accessories'
    when lower(coalesce(p_style_name, '')) ~
      '(cap|hat|beanie|visor|snapback|bucket hat|headwear)'
      then 'hats'
    when lower(coalesce(p_style_name, '')) ~
      '(youth|toddler|infant|baby)'
      and lower(coalesce(p_style_name, '')) ~ '(hood)'
      then 'hoodies'
    when lower(coalesce(p_style_name, '')) ~
      '(youth|toddler|infant|baby)'
      and lower(coalesce(p_style_name, '')) ~ '(long sleeve|l/s|long-sleeve)'
      then 'youth_long_sleeve_shirts'
    when lower(coalesce(p_style_name, '')) ~
      '(youth|toddler|infant|baby)'
      and lower(coalesce(p_style_name, '')) ~ '(sweat|fleece|crew)'
      then 'youth_crewnecks'
    when lower(coalesce(p_style_name, '')) ~
      '(youth|toddler|infant|baby)'
      and lower(coalesce(p_style_name, '')) ~ '(polo)'
      then 'youth_polo_shirts'
    when lower(coalesce(p_style_name, '')) ~
      '(youth|toddler|infant|baby)'
      and lower(coalesce(p_style_name, '')) ~ '(performance|sport|jersey|active|athletic|moisture)'
      then 'youth_sportswear'
    when lower(coalesce(p_style_name, '')) ~
      '(youth|toddler|infant|baby)'
      then 'youth_short_sleeve_shirts'
    when lower(coalesce(p_style_name, '')) ~ '(hood|hoodie)'
      then 'hoodies'
    when lower(coalesce(p_style_name, '')) ~ '(crewneck|crew neck|sweatshirt|fleece)'
      then 'crewnecks'
    when lower(coalesce(p_style_name, '')) ~ '(polo|golf shirt)'
      then 'polo_shirts'
    when lower(coalesce(p_style_name, '')) ~
      '(performance|sport|jersey|active|athletic|moisture|training|compression)'
      then 'sportswear'
    when lower(coalesce(p_style_name, '')) ~
      '(long sleeve|l/s|long-sleeve)'
      then 'long_sleeve_shirts'
    when lower(coalesce(p_style_name, '')) ~
      '(tank|sleeveless|tee|t-shirt|t shirt|shirt)'
      then 'short_sleeve_shirts'
    else null
  end;
$$;

revoke all on function public.ss_hc_catalog_category(text, text)
from public, anon;
grant execute
on function public.ss_hc_catalog_category(text, text)
to authenticated;

create or replace function public.ss_hc_catalog_preference_rank(
  p_style_name text,
  p_brand text default null
)
returns integer
language sql
immutable
parallel safe
as $$
  select case
    when lower(coalesce(p_style_name, '')) ~ '(tee|t-shirt|t shirt)' then 1
    when lower(coalesce(p_style_name, '')) ~ '(long sleeve|l/s|long-sleeve)' then 2
    when lower(coalesce(p_style_name, '')) ~ '(hood|hoodie)' then 3
    when lower(coalesce(p_style_name, '')) ~ '(crewneck|crew neck|sweatshirt)' then 4
    when lower(coalesce(p_style_name, '')) ~ '(tank|sleeveless)' then 5
    when lower(coalesce(p_style_name, '')) ~ '(polo|golf shirt)' then 6
    when lower(coalesce(p_style_name, '')) ~ '(youth|toddler|infant|baby)' then 7
    when lower(coalesce(p_style_name, '')) ~
      '(performance|sport|jersey|active|athletic|moisture|training|compression)' then 8
    when lower(coalesce(p_style_name, '')) ~ '(fleece)' then 9
    when lower(coalesce(p_style_name, '')) ~
      '(cap|hat|beanie|visor|snapback|bucket hat|headwear)' then 10
    when lower(coalesce(p_style_name, '')) ~
      '(backpack|back pack|duffel|d(u|o)ffle|tote|cinch|drawstring bag|messenger bag|gear bag|travel bag|laptop bag|waist pack|pouch)'
      then 11
    else 50
  end;
$$;

revoke all on function public.ss_hc_catalog_preference_rank(text, text)
from public, anon;
grant execute
on function public.ss_hc_catalog_preference_rank(text, text)
to authenticated;

create or replace function public.create_ss_next_hc_private_launch_batch(
  p_rule_version_id text,
  p_style_limit integer default 25
)
returns table (
  batch_id text,
  batch_label text,
  batch_sequence integer,
  product_count bigint,
  variant_count bigint,
  reused_product_count bigint,
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
  v_product_id text;
  v_product_count bigint;
  v_variant_count bigint;
  v_requested_count integer;
  v_category text;
  v_subtype text;
  v_categories jsonb;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  select rule.*
  into v_rule
  from public.ss_pricing_rule_versions rule
  where rule.id = p_rule_version_id
    and rule.status = 'approved_private';

  if not found then
    raise exception 'Approved private S&S pricing rule not found'
      using errcode = 'P0002';
  end if;

  v_requested_count := greatest(1, least(coalesce(p_style_limit, 25), 50));

  perform pg_advisory_xact_lock(
    hashtextextended('ss-private-catalog:' || p_rule_version_id, 0)
  );

  select batch.*
  into v_batch
  from public.ss_launch_batches batch
  where batch.rule_version_id = v_rule.id
    and batch.status in ('private_draft', 'qa_passed')
  order by batch.created_date desc
  limit 1;

  if found then
    select
      count(*)::bigint,
      coalesce(sum(item.variant_count), 0)::bigint
    into v_product_count, v_variant_count
    from public.ss_launch_batch_items item
    where item.batch_id = v_batch.id;

    return query
    select
      v_batch.id,
      v_batch.batch_label,
      v_batch.batch_sequence,
      v_product_count,
      v_variant_count,
      0::bigint,
      true;
    return;
  end if;

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
    coalesce((
      select max(existing.batch_sequence) + 1
      from public.ss_launch_batches existing
      where existing.rule_version_id = v_rule.id
    ), 1),
    'ss-private-' || to_char(clock_timestamp(), 'YYYYMMDD-HH24MISS-MS'),
    'private_draft',
    v_requested_count,
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
        max(style_meta.product_name) as catalog_name,
        max(style_meta.product_category) as base_category,
        sum(staged.inventory_qty)::bigint as total_inventory
      from public.ss_sku_approved_prices approved
      join public.ss_sku_staging staged
        on staged.style_session_id = approved.style_session_id
       and staged.sku = approved.sku
      join public.ss_import_staging style_meta
        on style_meta.import_session_id = approved.style_session_id
       and style_meta.brand = approved.brand
       and style_meta.style_number = approved.part_number
       and style_meta.row_status = 'pending'
      where approved.rule_version_id = v_rule.id
        and approved.publish_eligible
        and not approved.marketplace_restricted
        and staged.inventory_qty > 0
        and public.ss_hc_catalog_category(
          concat_ws(
            ' ',
            style_meta.product_name,
            style_meta.product_category,
            style_meta.raw_row_data
          ),
          approved.brand
        ) is not null
        and not exists (
          select 1
          from public.ss_launch_batch_items prior_item
          join public.ss_launch_batches prior_batch
            on prior_batch.id = prior_item.batch_id
          where prior_batch.style_session_id = v_rule.style_session_id
            and prior_item.brand = approved.brand
            and prior_item.style_id = approved.style_id
        )
      group by approved.brand, approved.style_id
    ),
    ranked_styles as (
      select
        style.*,
        row_number() over (
          partition by style.brand
          order by
            public.ss_hc_catalog_preference_rank(
              concat_ws(' ', style.catalog_name, style.base_category),
              style.brand
            ),
            style.total_inventory desc,
            style.style_id
        ) as brand_rank
      from style_totals style
    )
    select ranked.*
    from ranked_styles ranked
    where ranked.brand_rank <= 2
    order by
      ranked.brand_rank,
      case when lower(ranked.brand) = 'oakley' then 0 else 1 end,
      public.ss_hc_catalog_preference_rank(
        concat_ws(' ', ranked.catalog_name, ranked.base_category),
        ranked.brand
      ),
      ranked.brand,
      ranked.total_inventory desc
    limit v_requested_count
  loop
    select
      min(approved.approved_price) as minimum_price,
      round(avg(approved.customer_cost), 2) as average_cost,
      sum(staged.inventory_qty)::bigint as total_inventory,
      count(*)::integer as variant_count,
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
      coalesce(
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
        ),
        '[]'::jsonb
      ) as variants,
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

    v_product_id := gen_random_uuid()::text;
    v_category := public.ss_hc_catalog_category(
      concat_ws(' ', v_style.catalog_name, v_style.base_category),
      v_style.brand
    );

    v_subtype := case
      when v_category = 'hoodies' then 'hoodies'
      when v_category like '%crewnecks' then 'sweatshirts'
      when v_category = 'hats' then 'hats'
      when v_category like 'youth_%' then 'kids_apparel'
      when v_category = 'accessories' then null
      else 'apparel_blanks'
    end;

    v_categories := case
      when v_category = 'accessories'
        then jsonb_build_array('accessories')
      when v_category = 'hats'
        then jsonb_build_array('hats', 'accessories')
      else jsonb_build_array(v_category, 'apparel_blanks')
    end;

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
      size_prices
    )
    values (
      v_product_id,
      auth.uid(),
      true,
      coalesce(
        nullif(v_style.catalog_name, ''),
        v_style.brand || ' '
          || coalesce(nullif(v_style.style_name, ''), v_style.part_number, v_style.style_id::text)
      ),
      'Private S&S Activewear HC Apparel catalog-batch product. Not approved for the public storefront.',
      v_detail.minimum_price,
      'physical',
      v_subtype,
      'draft',
      v_detail.image_url,
      case
        when v_detail.image_url is null then '[]'::jsonb
        else jsonb_build_array(v_detail.image_url)
      end,
      v_detail.total_inventory,
      v_category,
      v_categories,
      jsonb_build_array(
        'S&S Activewear',
        'private catalog batch',
        'HC Apparel preferred catalog',
        v_style.brand
      ),
      false,
      'S&S Activewear',
      v_detail.average_cost,
      v_detail.average_cost,
      greatest(v_detail.minimum_price - v_detail.average_cost, 0),
      'Private S&S catalog batch ' || v_batch.batch_label
        || '. Do not publish without private QA and separate admin approval.',
      v_style.part_number,
      v_detail.sizes,
      v_detail.colors,
      v_detail.variants
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
      v_detail.variant_count,
      false,
      'pending'
    );
  end loop;

  select
    count(*)::bigint,
    coalesce(sum(item.variant_count), 0)::bigint
  into v_product_count, v_variant_count
  from public.ss_launch_batch_items item
  where item.batch_id = v_batch.id;

  if v_product_count <> v_requested_count then
    raise exception
      'Only % of % requested unused eligible HC Apparel S&S styles were available',
      v_product_count,
      v_requested_count
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.ss_launch_batch_items item
    where item.batch_id = v_batch.id
      and lower(item.brand) = 'oakley'
  ) then
    raise exception 'No unused eligible Oakley style was available for this batch'
      using errcode = 'P0001';
  end if;

  update public.ss_launch_batches batch
  set
    product_count = v_product_count,
    variant_count = v_variant_count
  where batch.id = v_batch.id;

  return query
  select
    v_batch.id,
    v_batch.batch_label,
    v_batch.batch_sequence,
    v_product_count,
    v_variant_count,
    0::bigint,
    false;
end;
$$;

revoke all on function public.create_ss_next_hc_private_launch_batch(text, integer)
from public, anon;
grant execute
on function public.create_ss_next_hc_private_launch_batch(text, integer)
to authenticated;

do $$
declare
  v_admin_id uuid;
  v_rule_id text;
  v_batch record;
  v_report jsonb;
  v_public_before bigint;
  v_public_after bigint;
  v_prior_overlap_count bigint;
  v_oakley_count bigint;
  v_accessory_count bigint;
  v_apparel_count bigint;
begin
  select profile.id
  into v_admin_id
  from public.profiles profile
  where profile.role = 'admin'
  order by profile.created_at
  limit 1;

  if v_admin_id is null then
    raise exception 'No administrator profile is available to build S&S Batch 3';
  end if;

  perform set_config('request.jwt.claim.sub', v_admin_id::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_admin_id,
      'role', 'authenticated'
    )::text,
    true
  );

  select rule.id
  into v_rule_id
  from public.ss_pricing_rule_versions rule
  where rule.status = 'approved_private'
  order by rule.approved_at desc
  limit 1;

  if v_rule_id is null then
    raise exception 'No approved private S&S pricing rule is available';
  end if;

  select count(*) into v_public_before
  from public.storefront_products;

  select *
  into v_batch
  from public.create_ss_next_hc_private_launch_batch(v_rule_id, 25);

  if v_batch.batch_sequence <> 3 then
    raise exception 'Expected S&S Batch 3 but created or found batch %', v_batch.batch_sequence;
  end if;

  v_report := public.run_ss_private_launch_qa(v_batch.batch_id);

  select count(*) into v_public_after
  from public.storefront_products;

  select count(*)
  into v_prior_overlap_count
  from public.ss_launch_batch_items current_item
  join public.ss_launch_batch_items prior_item
    on prior_item.brand = current_item.brand
   and prior_item.style_id = current_item.style_id
  join public.ss_launch_batches prior_batch
    on prior_batch.id = prior_item.batch_id
   and prior_batch.batch_sequence < v_batch.batch_sequence
  where current_item.batch_id = v_batch.batch_id;

  select count(*) filter (where lower(item.brand) = 'oakley')
  into v_oakley_count
  from public.ss_launch_batch_items item
  where item.batch_id = v_batch.batch_id;

  select
    count(*) filter (
      where product.category in ('hats', 'accessories')
    ),
    count(*) filter (
      where product.category not in ('hats', 'accessories')
    )
  into v_accessory_count, v_apparel_count
  from public.ss_launch_batch_items item
  join public.products product on product.id = item.product_id
  where item.batch_id = v_batch.batch_id;

  if not coalesce((v_report ->> 'all_passed')::boolean, false)
    or coalesce((v_report #>> '{summary,product_count}')::bigint, 0) <> 25
    or coalesce((v_report #>> '{summary,restricted_variant_count}')::bigint, -1) <> 0
    or coalesce((v_report #>> '{summary,not_publish_eligible_variant_count}')::bigint, -1) <> 0
    or coalesce((v_report #>> '{summary,storefront_exposed_count}')::bigint, -1) <> 0
    or v_prior_overlap_count <> 0
    or v_oakley_count < 1
    or v_public_before <> v_public_after then
    raise exception 'S&S Batch 3 failed its protected HC Apparel QA gate';
  end if;

  raise notice 'SS_BATCH_3_PRIVATE_QA %', jsonb_build_object(
    'batch_id', v_batch.batch_id,
    'batch_label', v_batch.batch_label,
    'batch_sequence', v_batch.batch_sequence,
    'status', 'qa_passed',
    'all_passed', v_report -> 'all_passed',
    'product_count', v_report #> '{summary,product_count}',
    'variant_count', v_report #> '{summary,variant_count}',
    'oakley_product_count', v_oakley_count,
    'apparel_product_count', v_apparel_count,
    'approved_accessory_product_count', v_accessory_count,
    'previous_style_overlap_count', v_prior_overlap_count,
    'restricted_variant_count', v_report #> '{summary,restricted_variant_count}',
    'not_publish_eligible_variant_count', v_report #> '{summary,not_publish_eligible_variant_count}',
    'missing_image_count', v_report #> '{summary,missing_image_count}',
    'missing_brand_count', v_report #> '{summary,missing_brand_count}',
    'missing_style_count', v_report #> '{summary,missing_style_count}',
    'invalid_price_count', v_report #> '{summary,invalid_price_count}',
    'missing_colors_count', v_report #> '{summary,missing_colors_count}',
    'missing_sizes_count', v_report #> '{summary,missing_sizes_count}',
    'invalid_variant_count', v_report #> '{summary,invalid_variant_count}',
    'storefront_exposed_count', v_report #> '{summary,storefront_exposed_count}',
    'public_product_count_before', v_public_before,
    'public_product_count_after', v_public_after
  );
end;
$$;
