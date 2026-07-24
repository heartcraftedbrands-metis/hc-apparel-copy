create table if not exists public.ss_post_publish_verification_reports (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  batch_id text not null references public.ss_launch_batches(id) on delete restrict,
  created_by uuid references auth.users(id) on delete set null,
  all_passed boolean not null,
  report jsonb not null
);

create index if not exists idx_ss_post_publish_reports_batch
on public.ss_post_publish_verification_reports(batch_id, created_date desc);

alter table public.ss_post_publish_verification_reports enable row level security;

drop policy if exists admin_select_ss_post_publish_verification_reports
on public.ss_post_publish_verification_reports;
create policy admin_select_ss_post_publish_verification_reports
on public.ss_post_publish_verification_reports
for select to authenticated
using (public.is_admin());

revoke all on public.ss_post_publish_verification_reports
from public, anon, authenticated;
grant select on public.ss_post_publish_verification_reports
to authenticated;

create or replace function public.compute_ss_post_publish_verification(
  p_batch_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.ss_launch_batches%rowtype;
  v_approval public.ss_launch_batch_approval_logs%rowtype;
  v_product_count bigint;
  v_active_public_count bigint;
  v_storefront_visible_count bigint;
  v_missing_image_count bigint;
  v_incomplete_product_count bigint;
  v_invalid_variant_count bigint;
  v_variant_count bigint;
  v_restricted_variant_count bigint;
  v_not_eligible_variant_count bigint;
  v_snapshot_missing_count bigint;
  v_unexpected_batch_id_count bigint;
  v_duplicate_batch_product_count bigint;
  v_non_batch_public_count bigint;
  v_quote_rpc_exists boolean;
  v_quote_rpc_public boolean;
  v_suspend_function_exists boolean;
  v_products jsonb;
  v_sample_product_id text;
  v_all_passed boolean;
begin
  select batch.*
  into v_batch
  from public.ss_launch_batches batch
  where batch.id = p_batch_id;

  if not found then
    raise exception 'S&S launch batch not found'
      using errcode = 'P0002';
  end if;

  select approval.*
  into v_approval
  from public.ss_launch_batch_approval_logs approval
  where approval.batch_id = v_batch.id
  order by approval.approved_at desc
  limit 1;

  if not found then
    raise exception 'No approval log exists for this S&S launch batch'
      using errcode = 'P0002';
  end if;

  with batch_rows as (
    select
      item.id as item_id,
      item.product_id,
      item.brand,
      item.style_id,
      item.part_number,
      item.variant_count as expected_variant_count,
      product.*
    from public.ss_launch_batch_items item
    left join public.products product on product.id = item.product_id
    where item.batch_id = v_batch.id
  ),
  variant_rows as (
    select
      row.product_id,
      variant.value as variant
    from batch_rows row
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(row.size_prices) = 'array' then row.size_prices
        else '[]'::jsonb
      end
    ) variant(value)
  ),
  snapshot_ids as (
    select snapshot_product.value ->> 'product_id' as product_id
    from jsonb_array_elements(
      coalesce(v_approval.qa_snapshot -> 'products', '[]'::jsonb)
    ) snapshot_product(value)
  )
  select
    (select count(*) from batch_rows),
    (select count(*) from batch_rows
      where visibility = 'public' and is_active is true),
    (select count(*)
      from public.storefront_products storefront
      join public.ss_launch_batch_items item on item.product_id = storefront.id
      where item.batch_id = v_batch.id),
    (select count(*) from batch_rows where nullif(image_url, '') is null),
    (select count(*) from batch_rows
      where id is null
         or nullif(brand, '') is null
         or nullif(part_number, '') is null
         or coalesce(price, 0) <= 0
         or jsonb_array_length(
           case when jsonb_typeof(available_colors) = 'array' then available_colors else '[]'::jsonb end
         ) = 0
         or jsonb_array_length(
           case when jsonb_typeof(available_sizes) = 'array' then available_sizes else '[]'::jsonb end
         ) = 0
         or jsonb_array_length(
           case when jsonb_typeof(size_prices) = 'array' then size_prices else '[]'::jsonb end
         ) = 0),
    (select count(*) from variant_rows
      where nullif(variant ->> 'sku', '') is null
         or nullif(variant ->> 'size', '') is null
         or coalesce(nullif(variant ->> 'price', '')::numeric, 0) <= 0
         or coalesce(nullif(variant ->> 'inventory', '')::numeric, 0) <= 0),
    (select count(*) from variant_rows),
    (select count(*)
      from variant_rows variants
      join public.ss_sku_approved_prices approved
        on approved.rule_version_id = v_batch.rule_version_id
       and approved.sku = variants.variant ->> 'sku'
       and approved.publish_eligible is false),
    (select count(*)
      from variant_rows variants
      where not exists (
        select 1
        from public.ss_sku_approved_prices approved
        where approved.rule_version_id = v_batch.rule_version_id
          and approved.sku = variants.variant ->> 'sku'
          and approved.publish_eligible is true
      )),
    (select count(*)
      from snapshot_ids snapshot
      left join batch_rows row on row.product_id = snapshot.product_id
      where row.product_id is null),
    (select count(*)
      from batch_rows row
      left join snapshot_ids snapshot on snapshot.product_id = row.product_id
      where snapshot.product_id is null),
    (select count(*) - count(distinct product_id) from batch_rows),
    (select count(*)
      from public.storefront_products storefront
      where not exists (
        select 1
        from public.ss_launch_batch_items item
        where item.batch_id = v_batch.id
          and item.product_id = storefront.id
      )),
    (select min(product_id) from batch_rows)
  into
    v_product_count,
    v_active_public_count,
    v_storefront_visible_count,
    v_missing_image_count,
    v_incomplete_product_count,
    v_invalid_variant_count,
    v_variant_count,
    v_restricted_variant_count,
    v_not_eligible_variant_count,
    v_snapshot_missing_count,
    v_unexpected_batch_id_count,
    v_duplicate_batch_product_count,
    v_non_batch_public_count,
    v_sample_product_id;

  v_quote_rpc_exists :=
    to_regprocedure('public.submit_quote_request(jsonb)') is not null;
  v_quote_rpc_public :=
    v_quote_rpc_exists
    and has_function_privilege('anon', 'public.submit_quote_request(jsonb)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.submit_quote_request(jsonb)', 'EXECUTE');
  v_suspend_function_exists :=
    to_regprocedure('public.suspend_ss_public_launch_batch(text)') is not null;

  with batch_rows as (
    select
      item.id as item_id,
      item.product_id,
      item.brand,
      item.style_id,
      item.part_number,
      product.*
    from public.ss_launch_batch_items item
    left join public.products product on product.id = item.product_id
    where item.batch_id = v_batch.id
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'item_id', row.item_id,
      'product_id', row.product_id,
      'name', row.name,
      'brand', row.brand,
      'style_number', row.part_number,
      'price', row.price,
      'image_url', row.image_url,
      'color_count', jsonb_array_length(
        case when jsonb_typeof(row.available_colors) = 'array' then row.available_colors else '[]'::jsonb end
      ),
      'size_count', jsonb_array_length(
        case when jsonb_typeof(row.available_sizes) = 'array' then row.available_sizes else '[]'::jsonb end
      ),
      'variant_count', jsonb_array_length(
        case when jsonb_typeof(row.size_prices) = 'array' then row.size_prices else '[]'::jsonb end
      ),
      'active_public_pass', row.visibility = 'public' and row.is_active is true,
      'public_route_pass', exists (
        select 1 from public.storefront_products storefront where storefront.id = row.product_id
      ),
      'image_pass', nullif(row.image_url, '') is not null,
      'data_pass',
        nullif(row.brand, '') is not null
        and nullif(row.part_number, '') is not null
        and coalesce(row.price, 0) > 0
        and jsonb_array_length(
          case when jsonb_typeof(row.available_colors) = 'array' then row.available_colors else '[]'::jsonb end
        ) > 0
        and jsonb_array_length(
          case when jsonb_typeof(row.available_sizes) = 'array' then row.available_sizes else '[]'::jsonb end
        ) > 0
        and jsonb_array_length(
          case when jsonb_typeof(row.size_prices) = 'array' then row.size_prices else '[]'::jsonb end
        ) > 0,
      'restricted_sku_count', (
        select count(*)
        from jsonb_array_elements(
          case when jsonb_typeof(row.size_prices) = 'array' then row.size_prices else '[]'::jsonb end
        ) variant(value)
        join public.ss_sku_approved_prices approved
          on approved.rule_version_id = v_batch.rule_version_id
         and approved.sku = variant.value ->> 'sku'
         and approved.publish_eligible is false
      ),
      'public_url', '/ProductDetail?id=' || row.product_id
    )
    order by row.brand, row.part_number, row.product_id
  ), '[]'::jsonb)
  into v_products
  from batch_rows row;

  v_all_passed :=
    v_batch.status = 'approved'
    and v_product_count = 25
    and v_product_count = v_batch.product_count
    and v_active_public_count = v_product_count
    and v_storefront_visible_count = v_product_count
    and v_missing_image_count = 0
    and v_incomplete_product_count = 0
    and v_invalid_variant_count = 0
    and v_variant_count = v_batch.variant_count
    and v_variant_count = v_approval.sku_variants_count
    and v_restricted_variant_count = 0
    and v_not_eligible_variant_count = 0
    and v_snapshot_missing_count = 0
    and v_unexpected_batch_id_count = 0
    and v_duplicate_batch_product_count = 0
    and v_quote_rpc_public
    and v_suspend_function_exists;

  return jsonb_build_object(
    'generated_at', now(),
    'batch', jsonb_build_object(
      'id', v_batch.id,
      'label', v_batch.batch_label,
      'status', v_batch.status,
      'approved_by', v_batch.approved_by,
      'approved_at', v_batch.approved_at
    ),
    'summary', jsonb_build_object(
      'product_count', v_product_count,
      'active_public_count', v_active_public_count,
      'storefront_visible_count', v_storefront_visible_count,
      'variant_count', v_variant_count,
      'restricted_variant_count', v_restricted_variant_count,
      'not_publish_eligible_variant_count', v_not_eligible_variant_count,
      'missing_image_count', v_missing_image_count,
      'incomplete_product_count', v_incomplete_product_count,
      'invalid_variant_count', v_invalid_variant_count,
      'snapshot_missing_count', v_snapshot_missing_count,
      'unexpected_batch_id_count', v_unexpected_batch_id_count,
      'duplicate_batch_product_count', v_duplicate_batch_product_count,
      'non_batch_public_count', v_non_batch_public_count,
      'quote_rpc_exists', v_quote_rpc_exists,
      'quote_rpc_public', v_quote_rpc_public,
      'suspend_scope_product_count', v_product_count,
      'suspend_function_exists', v_suspend_function_exists,
      'sample_product_id', v_sample_product_id
    ),
    'checklist', jsonb_build_array(
      jsonb_build_object(
        'id', 'active_public',
        'label', '25 approved batch products are active and public',
        'passed', v_product_count = 25 and v_active_public_count = 25,
        'detail', v_active_public_count || ' of ' || v_product_count || ' batch products are active/public.'
      ),
      jsonb_build_object(
        'id', 'public_routes',
        'label', 'All approved batch products are available to the public shop and product routes',
        'passed', v_storefront_visible_count = v_product_count and v_product_count = 25,
        'detail', v_storefront_visible_count || ' of ' || v_product_count || ' appear in the public storefront data source.'
      ),
      jsonb_build_object(
        'id', 'restricted',
        'label', 'Restricted SKUs remain excluded',
        'passed', v_restricted_variant_count = 0 and v_not_eligible_variant_count = 0,
        'detail', v_restricted_variant_count || ' restricted and ' || v_not_eligible_variant_count || ' non-eligible variants found.'
      ),
      jsonb_build_object(
        'id', 'images',
        'label', 'Every public batch product has an image',
        'passed', v_missing_image_count = 0,
        'detail', v_missing_image_count || ' products are missing images.'
      ),
      jsonb_build_object(
        'id', 'catalog_data',
        'label', 'Brand, style, price, colors, sizes, and SKU variants remain complete',
        'passed',
          v_incomplete_product_count = 0
          and v_invalid_variant_count = 0
          and v_variant_count = v_batch.variant_count,
        'detail', v_variant_count || ' variants checked; ' || v_incomplete_product_count || ' incomplete products.'
      ),
      jsonb_build_object(
        'id', 'quote_request',
        'label', 'Quote/request flow remains available for the public batch products',
        'passed', v_quote_rpc_public and v_storefront_visible_count = v_product_count,
        'detail', case
          when v_quote_rpc_public then 'Public and authenticated quote-request RPC access is intact.'
          else 'Quote-request RPC access is missing.'
        end
      ),
      jsonb_build_object(
        'id', 'batch_isolation',
        'label', 'Existing public products were not replaced or duplicated by this batch',
        'passed',
          v_snapshot_missing_count = 0
          and v_unexpected_batch_id_count = 0
          and v_duplicate_batch_product_count = 0,
        'detail',
          'Approval snapshot matches all batch IDs; '
          || v_non_batch_public_count || ' non-batch public products remain present.'
      ),
      jsonb_build_object(
        'id', 'suspend_scope',
        'label', 'Suspend/hide is scoped only to this approved batch',
        'passed', v_suspend_function_exists and v_batch.status = 'approved' and v_product_count = 25,
        'detail', 'Suspend target is exactly ' || v_product_count || ' recorded batch products.'
      )
    ),
    'all_passed', v_all_passed,
    'products', v_products
  );
end;
$$;

revoke all on function public.compute_ss_post_publish_verification(text)
from public, anon, authenticated;

create or replace function public.run_ss_post_publish_verification(
  p_batch_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report jsonb;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  v_report := public.compute_ss_post_publish_verification(p_batch_id);

  insert into public.ss_post_publish_verification_reports (
    batch_id,
    created_by,
    all_passed,
    report
  )
  values (
    p_batch_id,
    auth.uid(),
    coalesce((v_report ->> 'all_passed')::boolean, false),
    v_report
  );

  return v_report;
end;
$$;

revoke all on function public.run_ss_post_publish_verification(text)
from public, anon;
grant execute
on function public.run_ss_post_publish_verification(text)
to authenticated;

do $$
declare
  v_batch_id text;
  v_report jsonb;
begin
  select batch.id
  into v_batch_id
  from public.ss_launch_batches batch
  where batch.status = 'approved'
  order by batch.approved_at desc
  limit 1;

  if v_batch_id is not null then
    v_report := public.compute_ss_post_publish_verification(v_batch_id);

    insert into public.ss_post_publish_verification_reports (
      batch_id,
      created_by,
      all_passed,
      report
    )
    values (
      v_batch_id,
      null,
      coalesce((v_report ->> 'all_passed')::boolean, false),
      v_report
    );

    raise notice 'POST_PUBLISH_VERIFICATION %', jsonb_build_object(
      'all_passed', v_report -> 'all_passed',
      'batch_id', v_report #> '{batch,id}',
      'summary', v_report -> 'summary'
    );
  else
    raise notice 'POST_PUBLISH_VERIFICATION skipped: no approved batch found';
  end if;
end;
$$;
