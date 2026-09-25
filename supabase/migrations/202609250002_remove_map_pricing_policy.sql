begin;

-- S&S MAP and retail/MSRP remain imported reference data. They are deliberately
-- excluded from every HC Apparel price calculation in this migration.
create or replace function public.ss_staged_safe_price(p_customer_cost numeric)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_settings public.checkout_financial_settings%rowtype;
  v_method record;
  v_target numeric;
  v_floor numeric;
  v_method_floor numeric;
begin
  if p_customer_cost is null or p_customer_cost <= 0 then return null; end if;
  select * into v_settings from public.checkout_financial_settings where id = 'default';
  v_target := case
    when p_customer_cost <= 5 then 0.45
    when p_customer_cost <= 15 then 0.40
    when p_customer_cost <= 30 then 0.35
    else 0.30
  end;
  v_floor := greatest(
    7.99,
    (p_customer_cost + 1.00 + 0.30) / nullif(1 - 0.029 - v_target, 0)
  );
  if coalesce(v_settings.processing_enabled, true) then
    for v_method in
      select value from jsonb_each(coalesce(v_settings.payment_method_costs, '{}'::jsonb))
    loop
      if coalesce((v_method.value->>'enabled')::boolean, false) then
        v_method_floor := (
          p_customer_cost
          + greatest(coalesce(v_settings.minimum_margin_per_item, 3), 1)
          + coalesce((v_method.value->>'fixed_fee')::numeric, 0)
        ) / nullif(1 - coalesce((v_method.value->>'percentage')::numeric, 0) / 100, 0);
        v_floor := greatest(v_floor, v_method_floor);
      end if;
    end loop;
  end if;
  return ceil(greatest(v_floor, 7.99) + 0.01) - 0.01;
end;
$$;

comment on function public.ss_staged_safe_price(numeric) is
  'HC Apparel staged-SKU price using cost, margin and enabled payment fees. MAP/MSRP are reference only.';

drop function if exists public.ss_sku_pricing_preview(text);
create function public.ss_sku_pricing_preview(p_style_session_id text)
returns table (
  brand text, total_skus bigint, average_customer_cost numeric,
  minimum_proposed_price numeric, average_proposed_price numeric,
  maximum_proposed_price numeric, estimated_contribution_margin numeric,
  map_enforced_skus bigint, retail_capped_skus bigint,
  above_vendor_retail_skus bigint, below_safe_margin_skus bigint,
  marketplace_restricted_skus bigint
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  return query
  with priced as (
    select s.*, public.ss_staged_safe_price(s.customer_price) proposed_price
    from public.ss_sku_staging s
    where s.style_session_id = p_style_session_id and s.customer_price > 0
  )
  select p.brand, count(*)::bigint, round(avg(p.customer_price), 2),
    min(p.proposed_price), round(avg(p.proposed_price), 2), max(p.proposed_price),
    round((sum(p.proposed_price - p.customer_price - 1.00 - (p.proposed_price * 0.029 + 0.30))
      / nullif(sum(p.proposed_price), 0)) * 100, 1),
    0::bigint, 0::bigint, 0::bigint,
    count(*) filter (where (p.proposed_price - p.customer_price - 1.00
      - (p.proposed_price * 0.029 + 0.30)) / nullif(p.proposed_price, 0) < 0.20)::bigint,
    count(*) filter (where p.noe_retailing is true)::bigint
  from priced p group by p.brand order by p.brand;
end;
$$;

revoke all on function public.ss_sku_pricing_preview(text) from public, anon;
grant execute on function public.ss_sku_pricing_preview(text) to authenticated;

create or replace function public.ss_sku_pricing_exceptions(p_style_session_id text)
returns table (
  issue_type text, brand text, style_id bigint, part_number text, style_name text,
  affected_skus bigint, minimum_customer_cost numeric, maximum_customer_cost numeric,
  minimum_map_price numeric, maximum_map_price numeric,
  minimum_vendor_retail numeric, maximum_vendor_retail numeric,
  minimum_proposed_price numeric, maximum_proposed_price numeric,
  minimum_contribution_margin numeric
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  return query
  with priced as (
    select s.*, public.ss_staged_safe_price(s.customer_price) proposed_price
    from public.ss_sku_staging s
    where s.style_session_id = p_style_session_id and s.customer_price > 0
  ), classified as (
    select p.*, ((p.proposed_price - p.customer_price - 1.00
      - (p.proposed_price * 0.029 + 0.30)) / nullif(p.proposed_price, 0)) * 100 contribution_margin
    from priced p
  )
  select 'below_20_percent_margin'::text, c.brand, c.style_id,
    max(c.part_number), max(c.style_name), count(distinct c.sku)::bigint,
    min(c.customer_price), max(c.customer_price), min(c.map_price), max(c.map_price),
    min(c.retail_price), max(c.retail_price), min(c.proposed_price), max(c.proposed_price),
    round(min(c.contribution_margin), 1)
  from classified c where c.contribution_margin < 20
  group by c.brand, c.style_id order by c.brand, max(c.style_name), max(c.part_number);
end;
$$;

revoke all on function public.ss_sku_pricing_exceptions(text) from public, anon;
grant execute on function public.ss_sku_pricing_exceptions(text) to authenticated;

create or replace function public.approve_ss_recommended_pricing(
  p_style_session_id text,
  p_draft_product_limit integer default 5
)
returns table (
  rule_version_id text, version_label text, approved_sku_count bigint,
  publish_eligible_sku_count bigint, draft_product_count bigint,
  already_approved boolean
)
language plpgsql security definer set search_path = public as $$
declare
  v_rule public.ss_pricing_rule_versions%rowtype;
  v_approved_count bigint;
  v_publish_eligible_count bigint;
  v_draft_count bigint;
  v_existing boolean := false;
begin
  if not public.is_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  if not exists (select 1 from public.ss_sku_staging where style_session_id = p_style_session_id) then
    raise exception 'No S&S SKU staging session was found' using errcode = 'P0002';
  end if;

  select * into v_rule from public.ss_pricing_rule_versions where style_session_id = p_style_session_id;
  if found then
    v_existing := true;
  else
    insert into public.ss_pricing_rule_versions (
      style_session_id, version_label, status, exception_policy, rule_config, approved_by, approved_at
    ) values (
      p_style_session_id, 'ss-' || to_char(clock_timestamp(), 'YYYYMMDD-HH24MISS-MS'),
      'approved_private', 'use_hc_safe_prices',
      jsonb_build_object(
        'operating_allowance', 1.00, 'card_percentage', 0.029, 'card_fixed_fee', 0.30,
        'minimum_price', 7.99, 'rounding', 'up_to_99',
        'map_policy', 'reference_only', 'msrp_policy', 'reference_only',
        'payment_method_protection', 'worst_case_enabled'
      ), auth.uid(), now()
    ) returning * into v_rule;
  end if;

  if not v_existing then
    insert into public.ss_sku_approved_prices (
      rule_version_id, style_session_id, brand, style_id, part_number, style_name,
      sku, customer_cost, map_price, vendor_retail, approved_price,
      contribution_margin, marketplace_restricted, publish_eligible
    )
    select v_rule.id, p_style_session_id, s.brand, s.style_id, s.part_number, s.style_name,
      s.sku, s.customer_price, s.map_price, s.retail_price,
      public.ss_staged_safe_price(s.customer_price),
      round(((public.ss_staged_safe_price(s.customer_price) - s.customer_price - 1.00
        - (public.ss_staged_safe_price(s.customer_price) * 0.029 + 0.30))
        / nullif(public.ss_staged_safe_price(s.customer_price), 0)) * 100, 1),
      s.noe_retailing, not s.noe_retailing
    from public.ss_sku_staging s
    where s.style_session_id = p_style_session_id and s.customer_price > 0;
  end if;

  select count(*), count(*) filter (where publish_eligible)
    into v_approved_count, v_publish_eligible_count
  from public.ss_sku_approved_prices where rule_version_id = v_rule.id;

  if not v_existing then
    with eligible_styles as (
      select p.brand, p.style_id, max(p.part_number) part_number, max(p.style_name) style_name,
        min(p.approved_price) minimum_price, round(avg(p.customer_cost), 2) average_cost,
        sum(s.inventory_qty) total_inventory,
        coalesce(to_jsonb(array_agg(distinct s.size_name order by s.size_name)
          filter (where nullif(s.size_name, '') is not null)), '[]'::jsonb) sizes,
        coalesce(to_jsonb(array_agg(distinct s.color_name order by s.color_name)
          filter (where nullif(s.color_name, '') is not null)), '[]'::jsonb) colors,
        max(coalesce(nullif(s.color_on_model_front_image, ''), nullif(s.color_front_image, ''),
          nullif(s.color_swatch_image, ''))) image_url,
        row_number() over (partition by p.brand order by sum(s.inventory_qty) desc, p.style_id) brand_rank
      from public.ss_sku_approved_prices p
      join public.ss_sku_staging s on s.style_session_id = p.style_session_id and s.sku = p.sku
      where p.rule_version_id = v_rule.id and p.publish_eligible and s.inventory_qty > 0
      group by p.brand, p.style_id
    ), sample_styles as materialized (
      select * from eligible_styles where brand_rank = 1 order by brand
      limit greatest(1, least(coalesce(p_draft_product_limit, 5), 10))
    ), product_rows as materialized (
      select gen_random_uuid()::text product_id, s.* from sample_styles s
    ), inserted_products as (
      insert into public.products (
        id, owner_user_id, is_sample, name, description, price, product_type,
        product_subtype, visibility, image_url, mockup_images, stock, category,
        categories, tags, is_active, vendor_source, vendor_cost, blank_garment_cost,
        profit_estimate, internal_notes, supplier_sku, available_sizes, available_colors
      )
      select r.product_id, auth.uid(), true,
        r.brand || ' ' || coalesce(nullif(r.style_name, ''), r.part_number, r.style_id::text),
        'Private S&S Activewear pricing test product. Not approved for the public storefront.',
        r.minimum_price, 'physical', 'apparel_blanks', 'draft', r.image_url,
        case when r.image_url is null then '[]'::jsonb else jsonb_build_array(r.image_url) end,
        r.total_inventory, 'apparel_blanks', jsonb_build_array('apparel_blanks'),
        jsonb_build_array('S&S Activewear', 'private pricing test', r.brand), false,
        'S&S Activewear', r.average_cost, r.average_cost,
        greatest(r.minimum_price - r.average_cost, 0),
        'Private HC Apparel pricing test for rule ' || v_rule.version_label
          || '. MAP and MSRP are reference only. Do not publish without separate approval.',
        r.part_number, r.sizes, r.colors
      from product_rows r returning id
    )
    insert into public.ss_draft_product_tests (
      rule_version_id, style_session_id, product_id, brand, style_id, part_number
    )
    select v_rule.id, p_style_session_id, r.product_id, r.brand, r.style_id, r.part_number
    from product_rows r join inserted_products i on i.id = r.product_id;
  end if;

  select count(*) into v_draft_count from public.ss_draft_product_tests where rule_version_id = v_rule.id;
  update public.ss_pricing_rule_versions set approved_sku_count = v_approved_count,
    publish_eligible_sku_count = v_publish_eligible_count, draft_product_count = v_draft_count
  where id = v_rule.id;
  return query select v_rule.id, v_rule.version_label, v_approved_count,
    v_publish_eligible_count, v_draft_count, v_existing;
end;
$$;

revoke all on function public.approve_ss_recommended_pricing(text, integer) from public, anon;
grant execute on function public.approve_ss_recommended_pricing(text, integer) to authenticated;

commit;
