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
  style_summary as (
    select
      count(*)::integer as staged_styles,
      count(*) filter (
        where lower(concat_ws(
          ' ',
          raw_row_data::jsonb ->> 'styleName',
          raw_row_data::jsonb ->> 'title',
          raw_row_data::jsonb ->> 'baseCategory'
        )) ~ '(fleece|hood|hoodie|jacket|pullover|vest|beanie|hat|headwear|outerwear|coat|shell|parka|anorak|windbreaker)'
      )::integer as category_candidates,
      count(*) filter (
        where nullif(image_url, '') is not null
      )::integer as styles_with_image
    from public.ss_import_staging
    where import_session_id = (select import_session_id from latest)
  ),
  sku_summary as (
    select
      count(*)::integer as staged_skus,
      count(*) filter (where not noe_retailing)::integer as unrestricted_skus,
      count(*) filter (where inventory_qty > 0)::integer as in_stock_skus,
      count(*) filter (where customer_price > 0)::integer as priced_skus,
      count(*) filter (
        where nullif(sku, '') is not null
          and nullif(size_name, '') is not null
          and nullif(color_name, '') is not null
      )::integer as complete_variant_skus,
      count(*) filter (
        where coalesce(
          nullif(color_on_model_front_image, ''),
          nullif(color_front_image, ''),
          nullif(color_swatch_image, '')
        ) is not null
      )::integer as skus_with_image,
      count(*) filter (
        where not noe_retailing
          and inventory_qty > 0
          and customer_price > 0
          and nullif(sku, '') is not null
          and nullif(size_name, '') is not null
          and nullif(color_name, '') is not null
      )::integer as fully_eligible_skus
    from public.ss_sku_staging
    where style_session_id = (select import_session_id from latest)
  )
  select jsonb_build_object(
    'session_id', (select import_session_id from latest),
    'staged_styles', style_summary.staged_styles,
    'category_candidates', style_summary.category_candidates,
    'styles_with_image', style_summary.styles_with_image,
    'staged_skus', sku_summary.staged_skus,
    'unrestricted_skus', sku_summary.unrestricted_skus,
    'in_stock_skus', sku_summary.in_stock_skus,
    'priced_skus', sku_summary.priced_skus,
    'complete_variant_skus', sku_summary.complete_variant_skus,
    'skus_with_image', sku_summary.skus_with_image,
    'fully_eligible_skus', sku_summary.fully_eligible_skus
  )
  from style_summary cross join sku_summary;
$$;

revoke all on function public.diagnose_latest_columbia_stage()
from public, anon, authenticated;
grant execute on function public.diagnose_latest_columbia_stage()
to service_role;

commit;
