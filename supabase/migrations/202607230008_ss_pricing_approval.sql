create table if not exists public.ss_pricing_rule_versions (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  style_session_id text not null unique,
  version_label text not null unique,
  status text not null default 'approved_private'
    check (status in ('approved_private', 'superseded', 'published')),
  exception_policy text not null default 'use_recommended_prices',
  rule_config jsonb not null default '{}'::jsonb,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz not null default now(),
  approved_sku_count integer not null default 0,
  publish_eligible_sku_count integer not null default 0,
  draft_product_count integer not null default 0
);

drop trigger if exists ss_pricing_rule_versions_set_updated_date
on public.ss_pricing_rule_versions;
create trigger ss_pricing_rule_versions_set_updated_date
before update on public.ss_pricing_rule_versions
for each row execute function public.set_updated_date();

create table if not exists public.ss_sku_approved_prices (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  rule_version_id text not null
    references public.ss_pricing_rule_versions(id) on delete cascade,
  style_session_id text not null,
  brand text not null,
  style_id bigint not null,
  part_number text,
  style_name text,
  sku text not null,
  customer_cost numeric not null,
  map_price numeric,
  vendor_retail numeric,
  approved_price numeric not null,
  contribution_margin numeric,
  marketplace_restricted boolean not null default false,
  publish_eligible boolean not null default true,
  unique (rule_version_id, sku)
);

create index if not exists idx_ss_sku_approved_prices_rule
on public.ss_sku_approved_prices(rule_version_id);
create index if not exists idx_ss_sku_approved_prices_publish
on public.ss_sku_approved_prices(rule_version_id, publish_eligible);

create table if not exists public.ss_draft_product_tests (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  rule_version_id text not null
    references public.ss_pricing_rule_versions(id) on delete cascade,
  style_session_id text not null,
  product_id text not null references public.products(id) on delete cascade,
  brand text not null,
  style_id bigint not null,
  part_number text,
  unique (rule_version_id, style_id),
  unique (product_id)
);

alter table public.ss_pricing_rule_versions enable row level security;
alter table public.ss_sku_approved_prices enable row level security;
alter table public.ss_draft_product_tests enable row level security;

drop policy if exists admin_all_ss_pricing_rule_versions
on public.ss_pricing_rule_versions;
create policy admin_all_ss_pricing_rule_versions
on public.ss_pricing_rule_versions
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists admin_all_ss_sku_approved_prices
on public.ss_sku_approved_prices;
create policy admin_all_ss_sku_approved_prices
on public.ss_sku_approved_prices
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists admin_all_ss_draft_product_tests
on public.ss_draft_product_tests;
create policy admin_all_ss_draft_product_tests
on public.ss_draft_product_tests
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

revoke all on public.ss_pricing_rule_versions,
  public.ss_sku_approved_prices,
  public.ss_draft_product_tests
from public, anon, authenticated;

grant select on public.ss_pricing_rule_versions,
  public.ss_sku_approved_prices,
  public.ss_draft_product_tests
to authenticated;

create or replace function public.approve_ss_recommended_pricing(
  p_style_session_id text,
  p_draft_product_limit integer default 5
)
returns table (
  rule_version_id text,
  version_label text,
  approved_sku_count bigint,
  publish_eligible_sku_count bigint,
  draft_product_count bigint,
  already_approved boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule public.ss_pricing_rule_versions%rowtype;
  v_approved_count bigint;
  v_publish_eligible_count bigint;
  v_draft_count bigint;
  v_existing boolean := false;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.ss_sku_staging
    where style_session_id = p_style_session_id
  ) then
    raise exception 'No S&S SKU staging session was found'
      using errcode = 'P0002';
  end if;

  select *
  into v_rule
  from public.ss_pricing_rule_versions
  where style_session_id = p_style_session_id;

  if found then
    v_existing := true;
  else
    insert into public.ss_pricing_rule_versions (
      style_session_id,
      version_label,
      status,
      exception_policy,
      rule_config,
      approved_by,
      approved_at
    )
    values (
      p_style_session_id,
      'ss-' || to_char(clock_timestamp(), 'YYYYMMDD-HH24MISS-MS'),
      'approved_private',
      'use_recommended_prices',
      jsonb_build_object(
        'operating_allowance', 1.00,
        'card_percentage', 0.029,
        'card_fixed_fee', 0.30,
        'minimum_price', 7.99,
        'rounding', 'up_to_99',
        'retail_cap_before_map', true,
        'map_floor', true,
        'accepted_map_retail_conflicts', true,
        'accepted_low_margin_skus', true,
        'margin_targets', jsonb_build_object(
          'cost_lte_5', 0.45,
          'cost_5_to_15', 0.40,
          'cost_15_to_30', 0.35,
          'cost_over_30', 0.30
        )
      ),
      auth.uid(),
      now()
    )
    returning * into v_rule;
  end if;

  if not v_existing then
    with tiered as (
      select
        s.*,
        (
          (s.customer_price + 1.00 + 0.30)
          /
          (
            1
            - 0.029
            - case
                when s.customer_price <= 5 then 0.45
                when s.customer_price <= 15 then 0.40
                when s.customer_price <= 30 then 0.35
                else 0.30
              end
          )
        )::numeric as margin_floor_price
      from public.ss_sku_staging s
      where s.style_session_id = p_style_session_id
        and s.customer_price > 0
    ),
    proposed as (
      select
        t.*,
        round(
          greatest(
            coalesce(nullif(t.map_price, 0), 0),
            case
              when coalesce(t.retail_price, 0) > 0 then least(
                (ceil(greatest(t.margin_floor_price, 7.99) + 0.01) - 0.01)::numeric,
                t.retail_price
              )
              else (ceil(greatest(t.margin_floor_price, 7.99) + 0.01) - 0.01)::numeric
            end
          ),
          2
        ) as proposed_price
      from tiered t
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
      v_rule.id,
      p_style_session_id,
      p.brand,
      p.style_id,
      p.part_number,
      p.style_name,
      p.sku,
      p.customer_price,
      p.map_price,
      p.retail_price,
      p.proposed_price,
      round(
        (
          p.proposed_price
          - p.customer_price
          - 1.00
          - (p.proposed_price * 0.029 + 0.30)
        ) / nullif(p.proposed_price, 0) * 100,
        1
      ),
      p.noe_retailing,
      not p.noe_retailing
    from proposed p;
  end if;

  select count(*),
    count(*) filter (where publish_eligible)
  into v_approved_count, v_publish_eligible_count
  from public.ss_sku_approved_prices
  where rule_version_id = v_rule.id;

  if not v_existing then
    with eligible_styles as (
      select
        p.brand,
        p.style_id,
        max(p.part_number) as part_number,
        max(p.style_name) as style_name,
        min(p.approved_price) as minimum_price,
        round(avg(p.customer_cost), 2) as average_cost,
        sum(s.inventory_qty) as total_inventory,
        coalesce(
          to_jsonb(array_agg(distinct s.size_name order by s.size_name)
            filter (where nullif(s.size_name, '') is not null)),
          '[]'::jsonb
        ) as sizes,
        coalesce(
          to_jsonb(array_agg(distinct s.color_name order by s.color_name)
            filter (where nullif(s.color_name, '') is not null)),
          '[]'::jsonb
        ) as colors,
        max(coalesce(
          nullif(s.color_on_model_front_image, ''),
          nullif(s.color_front_image, ''),
          nullif(s.color_swatch_image, '')
        )) as image_url,
        row_number() over (
          partition by p.brand
          order by sum(s.inventory_qty) desc, p.style_id
        ) as brand_rank
      from public.ss_sku_approved_prices p
      join public.ss_sku_staging s
        on s.style_session_id = p.style_session_id
       and s.sku = p.sku
      where p.rule_version_id = v_rule.id
        and p.publish_eligible
        and s.inventory_qty > 0
      group by p.brand, p.style_id
    ),
    sample_styles as materialized (
      select *
      from eligible_styles
      where brand_rank = 1
      order by brand
      limit greatest(1, least(coalesce(p_draft_product_limit, 5), 10))
    ),
    product_rows as materialized (
      select
        gen_random_uuid()::text as product_id,
        s.*
      from sample_styles s
    ),
    inserted_products as (
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
        available_colors
      )
      select
        r.product_id,
        auth.uid(),
        true,
        r.brand || ' ' || coalesce(nullif(r.style_name, ''), r.part_number, r.style_id::text),
        'Private S&S Activewear pricing test product. Not approved for the public storefront.',
        r.minimum_price,
        'physical',
        'apparel_blanks',
        'draft',
        r.image_url,
        case
          when r.image_url is null then '[]'::jsonb
          else jsonb_build_array(r.image_url)
        end,
        r.total_inventory,
        'apparel_blanks',
        jsonb_build_array('apparel_blanks'),
        jsonb_build_array('S&S Activewear', 'private pricing test', r.brand),
        false,
        'S&S Activewear',
        r.average_cost,
        r.average_cost,
        greatest(r.minimum_price - r.average_cost, 0),
        'Private pricing test for rule ' || v_rule.version_label
          || '. Do not publish without separate approval.',
        r.part_number,
        r.sizes,
        r.colors
      from product_rows r
      returning id
    )
    insert into public.ss_draft_product_tests (
      rule_version_id,
      style_session_id,
      product_id,
      brand,
      style_id,
      part_number
    )
    select
      v_rule.id,
      p_style_session_id,
      r.product_id,
      r.brand,
      r.style_id,
      r.part_number
    from product_rows r
    join inserted_products i on i.id = r.product_id;
  end if;

  select count(*)
  into v_draft_count
  from public.ss_draft_product_tests
  where rule_version_id = v_rule.id;

  update public.ss_pricing_rule_versions
  set
    approved_sku_count = v_approved_count,
    publish_eligible_sku_count = v_publish_eligible_count,
    draft_product_count = v_draft_count
  where id = v_rule.id;

  return query
  select
    v_rule.id,
    v_rule.version_label,
    v_approved_count,
    v_publish_eligible_count,
    v_draft_count,
    v_existing;
end;
$$;

revoke all on function public.approve_ss_recommended_pricing(text, integer)
from public, anon;
grant execute
on function public.approve_ss_recommended_pricing(text, integer)
to authenticated;
