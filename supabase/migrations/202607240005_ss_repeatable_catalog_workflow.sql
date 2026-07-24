alter table public.ss_launch_batches
drop constraint if exists ss_launch_batches_rule_version_id_key;

alter table public.ss_launch_batches
add column if not exists batch_sequence integer;

with sequenced as (
  select
    batch.id,
    row_number() over (
      partition by batch.rule_version_id
      order by batch.created_date, batch.id
    )::integer as sequence_number
  from public.ss_launch_batches batch
)
update public.ss_launch_batches batch
set batch_sequence = sequenced.sequence_number
from sequenced
where sequenced.id = batch.id
  and batch.batch_sequence is null;

alter table public.ss_launch_batches
alter column batch_sequence set not null;

create unique index if not exists idx_ss_launch_batches_rule_sequence
on public.ss_launch_batches(rule_version_id, batch_sequence);

create index if not exists idx_ss_launch_batch_items_style_history
on public.ss_launch_batch_items(brand, style_id, batch_id);

create table if not exists public.ss_private_launch_qa_reports (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  batch_id text not null references public.ss_launch_batches(id) on delete restrict,
  generated_by uuid references auth.users(id) on delete set null,
  all_passed boolean not null,
  report jsonb not null
);

create index if not exists idx_ss_private_launch_qa_reports_batch
on public.ss_private_launch_qa_reports(batch_id, created_date desc);

alter table public.ss_private_launch_qa_reports enable row level security;

drop policy if exists admin_select_ss_private_launch_qa_reports
on public.ss_private_launch_qa_reports;
create policy admin_select_ss_private_launch_qa_reports
on public.ss_private_launch_qa_reports
for select to authenticated
using (public.is_admin());

revoke all on public.ss_private_launch_qa_reports
from public, anon, authenticated;
grant select on public.ss_private_launch_qa_reports
to authenticated;

create or replace function public.create_ss_next_private_launch_batch(
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
  v_product_id text;
  v_product_count bigint;
  v_variant_count bigint;
  v_requested_count integer;
  v_category text;
  v_subtype text;
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
        sum(staged.inventory_qty)::bigint as total_inventory
      from public.ss_sku_approved_prices approved
      join public.ss_sku_staging staged
        on staged.style_session_id = approved.style_session_id
       and staged.sku = approved.sku
      where approved.rule_version_id = v_rule.id
        and approved.publish_eligible
        and staged.inventory_qty > 0
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
          order by style.total_inventory desc, style.style_id
        ) as brand_rank
      from style_totals style
    ),
    selected_styles as (
      select ranked.*
      from ranked_styles ranked
      where ranked.brand_rank <= 2
      order by ranked.brand_rank, ranked.brand, ranked.total_inventory desc
      limit v_requested_count
    )
    select
      selected.brand,
      selected.style_id,
      selected.part_number,
      selected.style_name,
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
    from selected_styles selected
    join public.ss_sku_approved_prices approved
      on approved.rule_version_id = v_rule.id
     and approved.brand = selected.brand
     and approved.style_id = selected.style_id
     and approved.publish_eligible
    join public.ss_sku_staging staged
      on staged.style_session_id = approved.style_session_id
     and staged.sku = approved.sku
     and staged.inventory_qty > 0
    group by
      selected.brand,
      selected.style_id,
      selected.part_number,
      selected.style_name
    order by selected.brand, selected.style_id
  loop
    v_product_id := gen_random_uuid()::text;

    if lower(coalesce(v_style.style_name, '')) like '%hood%' then
      v_category := 'hoodies';
      v_subtype := 'hoodies';
    elsif lower(coalesce(v_style.style_name, '')) like '%sweat%' then
      v_category := 'crewnecks';
      v_subtype := 'sweatshirts';
    elsif lower(coalesce(v_style.style_name, '')) like '%polo%' then
      v_category := 'polo_shirts';
      v_subtype := 'apparel_blanks';
    elsif lower(coalesce(v_style.style_name, '')) like '%youth%'
      or lower(coalesce(v_style.style_name, '')) like '%toddler%'
      or lower(coalesce(v_style.style_name, '')) like '%infant%' then
      v_category := 'youth_short_sleeve_shirts';
      v_subtype := 'kids_apparel';
    else
      v_category := 'short_sleeve_shirts';
      v_subtype := 't_shirts';
    end if;

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
      v_style.brand || ' '
        || coalesce(nullif(v_style.style_name, ''), v_style.part_number, v_style.style_id::text),
      'Private S&S Activewear catalog-batch product. Not approved for the public storefront.',
      v_style.minimum_price,
      'physical',
      v_subtype,
      'draft',
      v_style.image_url,
      case
        when v_style.image_url is null then '[]'::jsonb
        else jsonb_build_array(v_style.image_url)
      end,
      v_style.total_inventory,
      v_category,
      jsonb_build_array(v_category, 'apparel_blanks'),
      jsonb_build_array(
        'S&S Activewear',
        'private catalog batch',
        v_style.brand
      ),
      false,
      'S&S Activewear',
      v_style.average_cost,
      v_style.average_cost,
      greatest(v_style.minimum_price - v_style.average_cost, 0),
      'Private S&S catalog batch ' || v_batch.batch_label
        || '. Do not publish without private QA and separate admin approval.',
      v_style.part_number,
      v_style.sizes,
      v_style.colors,
      v_style.variants
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
      v_style.variant_count,
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
      'Only % of % requested unused eligible S&S styles were available',
      v_product_count,
      v_requested_count
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

revoke all on function public.create_ss_next_private_launch_batch(text, integer)
from public, anon;
grant execute
on function public.create_ss_next_private_launch_batch(text, integer)
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
  v_all_passed boolean;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  select batch.*
  into v_batch
  from public.ss_launch_batches batch
  where batch.id = p_batch_id
  for update;

  if not found then
    raise exception 'Private S&S launch batch not found'
      using errcode = 'P0002';
  end if;

  if v_batch.status not in ('private_draft', 'qa_passed', 'suspended') then
    raise exception 'Private QA can run only for an unpublished or suspended S&S batch';
  end if;

  v_report := public.get_ss_private_launch_qa(p_batch_id);
  v_all_passed := coalesce((v_report ->> 'all_passed')::boolean, false);

  insert into public.ss_private_launch_qa_reports (
    batch_id,
    generated_by,
    all_passed,
    report
  )
  values (
    p_batch_id,
    auth.uid(),
    v_all_passed,
    v_report
  );

  update public.ss_launch_batches batch
  set status = case when v_all_passed then 'qa_passed' else 'private_draft' end
  where batch.id = p_batch_id;

  update public.ss_launch_batch_items item
  set qa_status = case when v_all_passed then 'passed' else 'pending' end
  where item.batch_id = p_batch_id;

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
grant execute
on function public.run_ss_private_launch_qa(text)
to authenticated;

do $$
declare
  v_admin_id uuid;
  v_rule_id text;
  v_batch record;
  v_report jsonb;
  v_public_before bigint;
  v_public_after bigint;
begin
  select profile.id
  into v_admin_id
  from public.profiles profile
  where profile.role = 'admin'
  order by profile.created_at
  limit 1;

  if v_admin_id is null then
    raise exception 'No administrator profile is available to build the next S&S batch';
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
  from public.create_ss_next_private_launch_batch(v_rule_id, 25);

  v_report := public.run_ss_private_launch_qa(v_batch.batch_id);

  select count(*) into v_public_after
  from public.storefront_products;

  if not coalesce((v_report ->> 'all_passed')::boolean, false)
    or coalesce((v_report #>> '{summary,product_count}')::bigint, 0) <> 25
    or coalesce((v_report #>> '{summary,restricted_variant_count}')::bigint, -1) <> 0
    or coalesce((v_report #>> '{summary,not_publish_eligible_variant_count}')::bigint, -1) <> 0
    or coalesce((v_report #>> '{summary,storefront_exposed_count}')::bigint, -1) <> 0
    or v_public_before <> v_public_after then
    raise exception 'The next private S&S batch failed its protected QA gate';
  end if;

  raise notice 'NEXT_SS_PRIVATE_BATCH %', jsonb_build_object(
    'batch_id', v_batch.batch_id,
    'batch_label', v_batch.batch_label,
    'batch_sequence', v_batch.batch_sequence,
    'product_count', v_report #> '{summary,product_count}',
    'variant_count', v_report #> '{summary,variant_count}',
    'restricted_variant_count', v_report #> '{summary,restricted_variant_count}',
    'not_publish_eligible_variant_count', v_report #> '{summary,not_publish_eligible_variant_count}',
    'missing_image_count', v_report #> '{summary,missing_image_count}',
    'invalid_variant_count', v_report #> '{summary,invalid_variant_count}',
    'storefront_exposed_count', v_report #> '{summary,storefront_exposed_count}',
    'public_product_count_before', v_public_before,
    'public_product_count_after', v_public_after,
    'status', 'qa_passed',
    'all_passed', v_report -> 'all_passed'
  );
end;
$$;
