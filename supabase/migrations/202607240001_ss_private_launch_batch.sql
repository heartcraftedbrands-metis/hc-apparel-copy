create table if not exists public.ss_launch_batches (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  rule_version_id text not null unique
    references public.ss_pricing_rule_versions(id) on delete cascade,
  style_session_id text not null,
  batch_label text not null unique,
  status text not null default 'private_draft'
    check (status in ('private_draft', 'qa_passed', 'superseded', 'published')),
  requested_style_count integer not null default 25,
  product_count integer not null default 0,
  variant_count integer not null default 0,
  created_by uuid references auth.users(id) on delete set null
);

drop trigger if exists ss_launch_batches_set_updated_date
on public.ss_launch_batches;
create trigger ss_launch_batches_set_updated_date
before update on public.ss_launch_batches
for each row execute function public.set_updated_date();

create table if not exists public.ss_launch_batch_items (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  batch_id text not null references public.ss_launch_batches(id) on delete cascade,
  product_id text not null references public.products(id) on delete cascade,
  brand text not null,
  style_id bigint not null,
  part_number text,
  variant_count integer not null default 0,
  reused_test_product boolean not null default false,
  qa_status text not null default 'pending'
    check (qa_status in ('pending', 'passed', 'failed')),
  unique (batch_id, style_id),
  unique (batch_id, product_id)
);

create index if not exists idx_ss_launch_batch_items_batch
on public.ss_launch_batch_items(batch_id);

alter table public.ss_launch_batches enable row level security;
alter table public.ss_launch_batch_items enable row level security;

drop policy if exists admin_all_ss_launch_batches on public.ss_launch_batches;
create policy admin_all_ss_launch_batches
on public.ss_launch_batches
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists admin_all_ss_launch_batch_items
on public.ss_launch_batch_items;
create policy admin_all_ss_launch_batch_items
on public.ss_launch_batch_items
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

revoke all on public.ss_launch_batches, public.ss_launch_batch_items
from public, anon, authenticated;
grant select on public.ss_launch_batches, public.ss_launch_batch_items
to authenticated;

create or replace function public.create_ss_private_launch_batch(
  p_rule_version_id text,
  p_style_limit integer default 25
)
returns table (
  batch_id text,
  batch_label text,
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
  v_reused boolean;
  v_product_count bigint;
  v_variant_count bigint;
  v_reused_count bigint;
  v_existing boolean := false;
  v_category text;
  v_subtype text;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  select r.*
  into v_rule
  from public.ss_pricing_rule_versions r
  where r.id = p_rule_version_id
    and r.status = 'approved_private';

  if not found then
    raise exception 'Approved private S&S pricing rule not found'
      using errcode = 'P0002';
  end if;

  select b.*
  into v_batch
  from public.ss_launch_batches b
  where b.rule_version_id = p_rule_version_id;

  if found then
    v_existing := true;
  else
    insert into public.ss_launch_batches (
      rule_version_id,
      style_session_id,
      batch_label,
      status,
      requested_style_count,
      created_by
    )
    values (
      v_rule.id,
      v_rule.style_session_id,
      'ss-private-' || to_char(clock_timestamp(), 'YYYYMMDD-HH24MISS-MS'),
      'private_draft',
      greatest(1, least(coalesce(p_style_limit, 25), 50)),
      auth.uid()
    )
    returning * into v_batch;
  end if;

  if not v_existing then
    for v_style in
      with style_totals as (
        select
          p.brand,
          p.style_id,
          max(p.part_number) as part_number,
          max(p.style_name) as style_name,
          sum(s.inventory_qty)::bigint as total_inventory
        from public.ss_sku_approved_prices p
        join public.ss_sku_staging s
          on s.style_session_id = p.style_session_id
         and s.sku = p.sku
        where p.rule_version_id = v_rule.id
          and p.publish_eligible
          and s.inventory_qty > 0
        group by p.brand, p.style_id
      ),
      ranked_styles as (
        select
          t.*,
          row_number() over (
            partition by t.brand
            order by t.total_inventory desc, t.style_id
          ) as brand_rank
        from style_totals t
      ),
      selected_styles as (
        select r.*
        from ranked_styles r
        where r.brand_rank <= 2
        order by r.brand_rank, r.brand, r.total_inventory desc
        limit greatest(1, least(coalesce(p_style_limit, 25), 50))
      )
      select
        selected.brand,
        selected.style_id,
        selected.part_number,
        selected.style_name,
        min(p.approved_price) as minimum_price,
        round(avg(p.customer_cost), 2) as average_cost,
        sum(s.inventory_qty)::bigint as total_inventory,
        count(*)::integer as variant_count,
        coalesce(
          to_jsonb(
            array_agg(distinct s.size_name order by s.size_name)
            filter (where nullif(s.size_name, '') is not null)
          ),
          '[]'::jsonb
        ) as sizes,
        coalesce(
          jsonb_agg(distinct jsonb_build_object(
            'name', s.color_name,
            'hex', coalesce(nullif(s.color_1, ''), '')
          )) filter (where nullif(s.color_name, '') is not null),
          '[]'::jsonb
        ) as colors,
        coalesce(
          jsonb_agg(
            jsonb_build_object(
              'size', s.color_name || ' / ' || s.size_name,
              'price', p.approved_price,
              'image_url', coalesce(
                nullif(s.color_on_model_front_image, ''),
                nullif(s.color_front_image, ''),
                nullif(s.color_swatch_image, '')
              ),
              'sku', s.sku,
              'inventory', s.inventory_qty,
              'color_hex', coalesce(nullif(s.color_1, ''), '')
            )
            order by s.color_name, s.size_order, s.size_name, s.sku
          ),
          '[]'::jsonb
        ) as variants,
        max(coalesce(
          nullif(s.color_on_model_front_image, ''),
          nullif(s.color_front_image, ''),
          nullif(s.color_swatch_image, '')
        )) as image_url
      from selected_styles selected
      join public.ss_sku_approved_prices p
        on p.rule_version_id = v_rule.id
       and p.brand = selected.brand
       and p.style_id = selected.style_id
       and p.publish_eligible
      join public.ss_sku_staging s
        on s.style_session_id = p.style_session_id
       and s.sku = p.sku
       and s.inventory_qty > 0
      group by
        selected.brand,
        selected.style_id,
        selected.part_number,
        selected.style_name
      order by selected.brand, selected.style_id
    loop
      v_reused := false;
      v_product_id := null;

      select d.product_id
      into v_product_id
      from public.ss_draft_product_tests d
      where d.rule_version_id = v_rule.id
        and d.style_id = v_style.style_id;

      if found then
        v_reused := true;
      else
        v_product_id := gen_random_uuid()::text;
      end if;

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

      if v_reused then
        update public.products
        set
          name = v_style.brand || ' '
            || coalesce(nullif(v_style.style_name, ''), v_style.part_number, v_style.style_id::text),
          description = 'Private S&S Activewear launch-batch product. Not approved for the public storefront.',
          price = v_style.minimum_price,
          product_type = 'physical',
          product_subtype = v_subtype,
          visibility = 'draft',
          image_url = v_style.image_url,
          mockup_images = case
            when v_style.image_url is null then '[]'::jsonb
            else jsonb_build_array(v_style.image_url)
          end,
          stock = v_style.total_inventory,
          category = v_category,
          categories = jsonb_build_array(v_category, 'apparel_blanks'),
          tags = jsonb_build_array(
            'S&S Activewear',
            'private launch batch',
            v_style.brand
          ),
          is_active = false,
          is_sample = true,
          vendor_source = 'S&S Activewear',
          vendor_cost = v_style.average_cost,
          blank_garment_cost = v_style.average_cost,
          profit_estimate = greatest(v_style.minimum_price - v_style.average_cost, 0),
          internal_notes = 'Private launch batch ' || v_batch.batch_label
            || '. Do not publish without separate approval.',
          supplier_sku = v_style.part_number,
          available_sizes = v_style.sizes,
          available_colors = v_style.colors,
          size_prices = v_style.variants
        where id = v_product_id;
      else
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
          'Private S&S Activewear launch-batch product. Not approved for the public storefront.',
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
          jsonb_build_array('S&S Activewear', 'private launch batch', v_style.brand),
          false,
          'S&S Activewear',
          v_style.average_cost,
          v_style.average_cost,
          greatest(v_style.minimum_price - v_style.average_cost, 0),
          'Private launch batch ' || v_batch.batch_label
            || '. Do not publish without separate approval.',
          v_style.part_number,
          v_style.sizes,
          v_style.colors,
          v_style.variants
        );
      end if;

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
        v_reused,
        'pending'
      );
    end loop;
  end if;

  select
    count(*)::bigint,
    coalesce(sum(i.variant_count), 0)::bigint,
    count(*) filter (where i.reused_test_product)::bigint
  into v_product_count, v_variant_count, v_reused_count
  from public.ss_launch_batch_items i
  where i.batch_id = v_batch.id;

  update public.ss_launch_batches b
  set
    product_count = v_product_count,
    variant_count = v_variant_count
  where b.id = v_batch.id;

  return query
  select
    v_batch.id,
    v_batch.batch_label,
    v_product_count,
    v_variant_count,
    v_reused_count,
    v_existing;
end;
$$;

revoke all on function public.create_ss_private_launch_batch(text, integer)
from public, anon;
grant execute
on function public.create_ss_private_launch_batch(text, integer)
to authenticated;
