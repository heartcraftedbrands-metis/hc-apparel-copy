begin;

create or replace function public.start_guarded_columbia_stage(p_session_id text, p_styles jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id text;
begin
  if p_session_id is null or p_session_id !~ '^ss-columbia-public-' then
    raise exception 'Invalid Columbia staging session';
  end if;
  if jsonb_typeof(p_styles) <> 'array'
    or jsonb_array_length(p_styles) < 1
    or jsonb_array_length(p_styles) > 500 then
    raise exception 'Columbia style payload must contain 1 to 500 styles';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_styles) row_data
    where lower(coalesce(row_data ->> 'brand', '')) <> 'columbia'
      or coalesce(row_data ->> 'import_session_id', '') <> p_session_id
      or coalesce(row_data ->> 'raw_row_data', '') = ''
  ) then
    raise exception 'Columbia style payload failed validation';
  end if;

  insert into public.ss_import_staging (
    import_session_id, file_name, total_staged_rows, row_number,
    raw_row_data, brand, style_number, product_name, product_category,
    image_url, row_status, owner_user_id, created_by_email
  )
  select
    p_session_id,
    'ss-activewear-api-v2-columbia-public-review',
    jsonb_array_length(p_styles),
    (row_data ->> 'row_number')::integer,
    row_data ->> 'raw_row_data',
    'Columbia',
    row_data ->> 'style_number',
    row_data ->> 'product_name',
    row_data ->> 'product_category',
    row_data ->> 'image_url',
    'pending',
    null,
    'columbia-launch@system.local'
  from jsonb_array_elements(p_styles) row_data;

  insert into public.ss_sku_sync_runs (
    style_session_id, brand, status, started_at, owner_user_id,
    created_by_email, total_styles, total_skus, skipped_rows, api_requests
  ) values (
    p_session_id, 'Columbia', 'running', now(), null,
    'columbia-launch@system.local', jsonb_array_length(p_styles), 0, 0, 0
  )
  returning id into v_run_id;

  return v_run_id;
end;
$$;

create or replace function public.append_guarded_columbia_skus(
  p_session_id text,
  p_sync_run_id text,
  p_skus jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_session_id is null or p_session_id !~ '^ss-columbia-public-' then
    raise exception 'Invalid Columbia staging session';
  end if;
  if not exists (
    select 1 from public.ss_sku_sync_runs
    where id = p_sync_run_id
      and style_session_id = p_session_id
      and brand = 'Columbia'
      and status = 'running'
  ) then
    raise exception 'Columbia sync run is unavailable';
  end if;
  if jsonb_typeof(p_skus) <> 'array'
    or jsonb_array_length(p_skus) < 1
    or jsonb_array_length(p_skus) > 200 then
    raise exception 'Columbia SKU payload must contain 1 to 200 rows';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_skus) row_data
    where lower(coalesce(row_data ->> 'brand', '')) <> 'columbia'
      or coalesce(row_data ->> 'style_session_id', '') <> p_session_id
      or coalesce(row_data ->> 'sync_run_id', '') <> p_sync_run_id
      or coalesce(row_data ->> 'sku', '') = ''
  ) then
    raise exception 'Columbia SKU payload failed validation';
  end if;

  insert into public.ss_sku_staging (
    style_session_id, sync_run_id, owner_user_id, created_by_email, fetched_at,
    brand, style_id, part_number, style_name, sku_id, sku, gtin, color_name,
    color_code, color_swatch_image, color_front_image, color_side_image,
    color_back_image, color_on_model_front_image, color_on_model_side_image,
    color_on_model_back_image, size_name, size_code, size_order, map_price,
    retail_price, piece_price, dozen_price, case_price, sale_price,
    customer_price, noe_retailing, inventory_qty, warehouses, raw_product
  )
  select
    p_session_id, p_sync_run_id, null, 'columbia-launch@system.local',
    coalesce((row_data ->> 'fetched_at')::timestamptz, now()),
    'Columbia', (row_data ->> 'style_id')::bigint, row_data ->> 'part_number',
    row_data ->> 'style_name', nullif(row_data ->> 'sku_id', '')::bigint,
    row_data ->> 'sku', row_data ->> 'gtin', row_data ->> 'color_name',
    row_data ->> 'color_code', row_data ->> 'color_swatch_image',
    row_data ->> 'color_front_image', row_data ->> 'color_side_image',
    row_data ->> 'color_back_image', row_data ->> 'color_on_model_front_image',
    row_data ->> 'color_on_model_side_image', row_data ->> 'color_on_model_back_image',
    row_data ->> 'size_name', row_data ->> 'size_code', row_data ->> 'size_order',
    nullif(row_data ->> 'map_price', '')::numeric,
    nullif(row_data ->> 'retail_price', '')::numeric,
    nullif(row_data ->> 'piece_price', '')::numeric,
    nullif(row_data ->> 'dozen_price', '')::numeric,
    nullif(row_data ->> 'case_price', '')::numeric,
    nullif(row_data ->> 'sale_price', '')::numeric,
    nullif(row_data ->> 'customer_price', '')::numeric,
    coalesce((row_data ->> 'noe_retailing')::boolean, false),
    coalesce((row_data ->> 'inventory_qty')::integer, 0),
    coalesce(row_data -> 'warehouses', '[]'::jsonb),
    coalesce(row_data -> 'raw_product', '{}'::jsonb)
  from jsonb_array_elements(p_skus) row_data
  on conflict (style_session_id, sku) do update set
    sync_run_id = excluded.sync_run_id,
    fetched_at = excluded.fetched_at,
    color_name = excluded.color_name,
    size_name = excluded.size_name,
    customer_price = excluded.customer_price,
    noe_retailing = excluded.noe_retailing,
    inventory_qty = excluded.inventory_qty,
    raw_product = excluded.raw_product,
    updated_date = now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.complete_guarded_columbia_stage(
  p_session_id text,
  p_sync_run_id text,
  p_total_skus integer,
  p_api_requests integer,
  p_rate_limit_remaining integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_session_id is null or p_session_id !~ '^ss-columbia-public-' then
    raise exception 'Invalid Columbia staging session';
  end if;

  update public.ss_sku_sync_runs
  set
    status = 'completed',
    completed_at = now(),
    total_skus = greatest(coalesce(p_total_skus, 0), 0),
    api_requests = greatest(coalesce(p_api_requests, 0), 0),
    rate_limit_remaining = p_rate_limit_remaining,
    error_message = null
  where id = p_sync_run_id
    and style_session_id = p_session_id
    and brand = 'Columbia'
    and status = 'running';

  if not found then
    raise exception 'Columbia sync run could not be completed';
  end if;

  return public.publish_eligible_columbia_session(p_session_id);
end;
$$;

revoke all on function public.start_guarded_columbia_stage(text, jsonb)
from public, anon, authenticated;
revoke all on function public.append_guarded_columbia_skus(text, text, jsonb)
from public, anon, authenticated;
revoke all on function public.complete_guarded_columbia_stage(text, text, integer, integer, integer)
from public, anon, authenticated;

grant execute on function public.start_guarded_columbia_stage(text, jsonb)
to service_role;
grant execute on function public.append_guarded_columbia_skus(text, text, jsonb)
to service_role;
grant execute on function public.complete_guarded_columbia_stage(text, text, integer, integer, integer)
to service_role;

commit;
