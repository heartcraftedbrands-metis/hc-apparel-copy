begin;

create or replace function public.diagnose_latest_columbia_stage()
returns jsonb
language sql
security definer
set search_path = public
as $$
  with latest as (
    select import_session_id
    from public.ss_import_staging
    where import_session_id like 'ss-columbia-public-%'
    order by created_date desc
    limit 1
  ),
  style_meta as (
    select distinct on ((raw_row_data::jsonb ->> 'styleID')::bigint)
      (raw_row_data::jsonb ->> 'styleID')::bigint as style_id,
      concat_ws(
        ' ',
        'Columbia',
        raw_row_data::jsonb ->> 'partNumber',
        raw_row_data::jsonb ->> 'styleName',
        raw_row_data::jsonb ->> 'title'
      ) as style_text,
      nullif(image_url, '') as style_image
    from public.ss_import_staging
    where import_session_id = (select import_session_id from latest)
      and lower(brand) = 'columbia'
    order by (raw_row_data::jsonb ->> 'styleID')::bigint, created_date desc
  ),
  style_costs as (
    select
      meta.style_id,
      case
        when lower(meta.style_text) ~ '(beanie|headwear|cap|hat)' then 'hats'
        when lower(meta.style_text) ~ '(hood|hoodie|hooded sweatshirt)' then 'hoodies'
        when lower(meta.style_text) ~ '(jacket|outerwear|coat|soft[ -]?shell|shell|vest|parka|anorak|windbreaker)'
          then 'outerwear'
        when lower(meta.style_text) ~ '(fleece|pullover|quarter[ -]?zip|half[ -]?zip|full[ -]?zip)'
          then 'fleece'
        else null
      end as category,
      round(avg(staged.customer_price)::numeric, 2) as average_cost,
      count(*)::integer as eligible_variants,
      coalesce(
        max(nullif(staged.color_on_model_front_image, '')),
        max(nullif(staged.color_front_image, '')),
        max(nullif(staged.color_swatch_image, '')),
        meta.style_image
      ) as image_url
    from style_meta meta
    join public.ss_sku_staging staged
      on staged.style_session_id = (select import_session_id from latest)
     and staged.style_id = meta.style_id
     and not staged.noe_retailing
     and staged.inventory_qty > 0
     and staged.customer_price > 0
     and nullif(staged.sku, '') is not null
     and nullif(staged.size_name, '') is not null
     and nullif(staged.color_name, '') is not null
    group by meta.style_id, meta.style_text, meta.style_image
  ),
  price_check as (
    select
      style.*,
      rule.rule_key,
      least(
        rule.maximum_price + rule.storefront_margin_buffer,
        (
          ceil(
            greatest(
              rule.minimum_price,
              style.average_cost * rule.cost_multiplier + rule.fixed_allowance
            ) + rule.storefront_margin_buffer - 0.99
          ) + 0.99
        )::numeric(10, 2)
      ) as proposed_price,
      rule.minimum_margin_percent
    from style_costs style
    left join public.storefront_pricing_rules rule
      on rule.rule_key = case
        when style.category = 'hats' then 'hat'
        when style.category = 'hoodies' then 'premium_cold_weather'
        when style.category = 'fleece' then 'fleece'
        else 'outerwear'
      end
     and rule.is_active
  )
  select jsonb_build_object(
    'session_id', (select import_session_id from latest),
    'eligible_styles', count(*)::integer,
    'eligible_variants', coalesce(sum(eligible_variants), 0)::integer,
    'minimum_average_cost', min(average_cost),
    'maximum_average_cost', max(average_cost),
    'styles_with_category', count(*) filter (where category is not null)::integer,
    'styles_with_image', count(*) filter (where image_url is not null)::integer,
    'styles_with_pricing_rule', count(*) filter (where rule_key is not null)::integer,
    'styles_passing_margin', count(*) filter (
      where rule_key is not null
        and proposed_price > 0
        and (proposed_price - average_cost) / proposed_price >= minimum_margin_percent
    )::integer,
    'category_counts', coalesce(
      jsonb_object_agg(category, category_count) filter (where category is not null),
      '{}'::jsonb
    )
  )
  from (
    select
      checked.*,
      count(*) over (partition by checked.category) as category_count
    from price_check checked
  ) checked;
$$;

commit;
