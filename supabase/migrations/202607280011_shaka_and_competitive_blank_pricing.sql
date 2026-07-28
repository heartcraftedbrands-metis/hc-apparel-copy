begin;

-- These ranges are final customer-facing prices and already include the configured
-- $3.00 storefront buffer. Decoration is priced separately.
update public.storefront_pricing_rules rule
set
  minimum_price = target.minimum_price,
  maximum_price = target.maximum_price,
  cost_multiplier = target.cost_multiplier,
  fixed_allowance = target.fixed_allowance,
  minimum_margin_percent = target.minimum_margin_percent,
  storefront_margin_buffer = 3.00,
  is_active = true,
  updated_date = now()
from (
  values
    ('basic_tshirt', 4.99::numeric, 7.99::numeric, 1.05::numeric, 0.00::numeric, 0.00::numeric),
    ('premium_tshirt', 7.99, 11.99, 1.10, 0.25, 0.03),
    ('long_sleeve', 8.99, 13.99, 1.10, 0.25, 0.03),
    ('youth_kids', 4.99, 8.99, 1.05, 0.00, 0.00),
    ('crewneck', 14.99, 24.99, 1.12, 0.50, 0.05),
    ('hoodie', 18.99, 34.99, 1.12, 0.75, 0.05),
    ('hat', 7.99, 18.99, 1.10, 0.25, 0.03),
    ('bag', 7.99, 39.99, 1.10, 0.50, 0.03)
) as target(
  rule_key, minimum_price, maximum_price, cost_multiplier,
  fixed_allowance, minimum_margin_percent
)
where rule.rule_key = target.rule_key;

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
values (
  'heavyweight_tshirt',
  'Heavyweight streetwear tee',
  8.99,
  12.99,
  1.10,
  0.25,
  0.03,
  true,
  true,
  25,
  3.00
)
on conflict (rule_key) do update set
  display_name = excluded.display_name,
  minimum_price = excluded.minimum_price,
  maximum_price = excluded.maximum_price,
  cost_multiplier = excluded.cost_multiplier,
  fixed_allowance = excluded.fixed_allowance,
  minimum_margin_percent = excluded.minimum_margin_percent,
  hide_above_maximum = true,
  is_active = true,
  sort_order = excluded.sort_order,
  storefront_margin_buffer = 3.00,
  updated_date = now();

create table if not exists public.ss_shaka_publication_reviews (
  id text primary key default gen_random_uuid()::text,
  session_id text not null,
  style_id bigint,
  part_number text,
  title text,
  normalized_category text,
  review_status text not null check (review_status in ('published', 'hidden')),
  hidden_reason text,
  eligible_variant_count integer not null default 0,
  restricted_variant_count integer not null default 0,
  product_id text references public.products(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.ss_shaka_publication_runs (
  id text primary key default gen_random_uuid()::text,
  session_id text not null unique,
  reviewed_count integer not null default 0,
  activated_count integer not null default 0,
  hidden_count integer not null default 0,
  restricted_variants_excluded integer not null default 0,
  placeholder_products_hidden integer not null default 0,
  pricing_products_hidden integer not null default 0,
  public_product_count_after integer not null default 0,
  category_counts jsonb not null default '{}'::jsonb,
  completed_at timestamptz not null default now()
);

alter table public.ss_shaka_publication_reviews enable row level security;
alter table public.ss_shaka_publication_runs enable row level security;

drop policy if exists admin_all_ss_shaka_publication_reviews
on public.ss_shaka_publication_reviews;
create policy admin_all_ss_shaka_publication_reviews
on public.ss_shaka_publication_reviews
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists admin_all_ss_shaka_publication_runs
on public.ss_shaka_publication_runs;
create policy admin_all_ss_shaka_publication_runs
on public.ss_shaka_publication_runs
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

revoke all on public.ss_shaka_publication_reviews from public, anon;
revoke all on public.ss_shaka_publication_runs from public, anon;
grant select on public.ss_shaka_publication_reviews to authenticated;
grant select on public.ss_shaka_publication_runs to authenticated;

create or replace function public.publish_eligible_shaka_session(p_session_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_style record;
  v_rule public.storefront_pricing_rules%rowtype;
  v_category text;
  v_subtype text;
  v_rule_key text;
  v_image text;
  v_name text;
  v_search_text text;
  v_cost numeric;
  v_price numeric;
  v_sizes jsonb;
  v_colors jsonb;
  v_variants jsonb;
  v_inventory bigint;
  v_product_id text;
  v_hidden_reason text;
  v_activated integer := 0;
  v_hidden integer := 0;
  v_restricted integer := 0;
  v_public_total integer := 0;
  v_category_counts jsonb := '{}'::jsonb;
begin
  if nullif(btrim(coalesce(p_session_id, '')), '') is null then
    raise exception 'A valid Shaka Wear staging session is required';
  end if;
  if not exists (
    select 1
    from public.ss_import_staging
    where import_session_id = p_session_id
      and lower(brand) = 'shaka wear'
  ) then
    raise exception 'No Shaka Wear styles were staged for this session';
  end if;

  delete from public.ss_shaka_publication_reviews
  where session_id = p_session_id;

  for v_style in
    with style_meta as (
      select distinct on ((raw_row_data::jsonb ->> 'styleID')::bigint)
        (raw_row_data::jsonb ->> 'styleID')::bigint as style_id,
        nullif(raw_row_data::jsonb ->> 'partNumber', '') as part_number,
        nullif(raw_row_data::jsonb ->> 'styleName', '') as style_name,
        nullif(raw_row_data::jsonb ->> 'title', '') as title,
        nullif(raw_row_data::jsonb ->> 'baseCategory', '') as base_category
      from public.ss_import_staging
      where import_session_id = p_session_id
        and lower(brand) = 'shaka wear'
        and nullif(raw_row_data, '') is not null
        and (raw_row_data::jsonb ->> 'styleID') ~ '^\d+$'
      order by (raw_row_data::jsonb ->> 'styleID')::bigint, created_date desc
    )
    select
      meta.*,
      count(staged.id) filter (
        where not staged.noe_retailing
          and staged.inventory_qty > 0
          and nullif(staged.sku, '') is not null
          and nullif(staged.size_name, '') is not null
          and nullif(staged.color_name, '') is not null
          and staged.customer_price > 0
      )::integer as eligible_variants,
      count(staged.id) filter (where staged.noe_retailing)::integer
        as restricted_variants
    from style_meta meta
    left join public.ss_sku_staging staged
      on staged.style_session_id = p_session_id
     and staged.style_id = meta.style_id
     and lower(staged.brand) = 'shaka wear'
    group by
      meta.style_id, meta.part_number, meta.style_name,
      meta.title, meta.base_category
    order by meta.part_number
  loop
    v_name := trim(concat_ws(
      ' ',
      'Shaka Wear',
      coalesce(v_style.part_number, ''),
      coalesce(v_style.style_name, v_style.title, '')
    ));
    v_search_text := lower(concat_ws(
      ' ', v_name, v_style.title, v_style.style_name, v_style.base_category
    ));
    v_category := case
      when v_search_text ~ '(hoodie|hooded|pullover hood|hooded sweatshirt)'
        then 'hoodies'
      when v_search_text ~ '(fleece|crewneck|crew neck|sweatshirt|fleece crew)'
        then 'fleece'
      when v_search_text ~ '(long sleeve|long-sleeve|l/s tee|l/s t-shirt)'
        then 'long_sleeve_shirts'
      when v_search_text ~ '(t-shirt|t shirt|(^|[^a-z])tee([^a-z]|$)|short sleeve|heavyweight)'
        then 'short_sleeve_shirts'
      else null
    end;
    v_subtype := case v_category
      when 'hoodies' then 'hoodies'
      when 'fleece' then 'fleece'
      else 't_shirts'
    end;
    v_rule_key := case v_category
      when 'hoodies' then 'hoodie'
      when 'fleece' then 'crewneck'
      when 'long_sleeve_shirts' then 'long_sleeve'
      else 'heavyweight_tshirt'
    end;
    v_hidden_reason := null;

    select coalesce(
      max(nullif(staged.color_on_model_front_image, '')) filter (
        where lower(coalesce(staged.color_on_model_front_image, ''))
          !~ '(colorswatch|placeholder|no[-_ ]?image|missing[-_ ]?image)'
      ),
      max(nullif(staged.color_front_image, '')) filter (
        where lower(coalesce(staged.color_front_image, ''))
          !~ '(colorswatch|placeholder|no[-_ ]?image|missing[-_ ]?image)'
      )
    )
    into v_image
    from public.ss_sku_staging staged
    where staged.style_session_id = p_session_id
      and staged.style_id = v_style.style_id
      and not staged.noe_retailing
      and staged.inventory_qty > 0;

    if v_category is null then
      v_hidden_reason :=
        'Hidden from public shop: unsupported Shaka Wear garment category.';
    elsif v_style.part_number is null
      or nullif(btrim(v_name), '') is null then
      v_hidden_reason :=
        'Hidden from public shop: missing Shaka Wear title or style number.';
    elsif v_style.eligible_variants = 0 then
      v_hidden_reason :=
        'Hidden from public shop: no complete unrestricted in-stock SKU variants.';
    elsif v_image is null then
      v_hidden_reason :=
        'Hidden because product image is placeholder or missing.';
    end if;

    if v_hidden_reason is null then
      select
        round(avg(staged.customer_price)::numeric, 2),
        coalesce(sum(staged.inventory_qty), 0),
        coalesce(
          jsonb_agg(distinct staged.size_name)
            filter (where staged.size_name is not null),
          '[]'::jsonb
        ),
        coalesce(
          jsonb_agg(distinct staged.color_name)
            filter (where staged.color_name is not null),
          '[]'::jsonb
        ),
        coalesce(
          jsonb_agg(
            jsonb_build_object(
              'size', staged.color_name || ' / ' || staged.size_name,
              'sku', staged.sku,
              'inventory', staged.inventory_qty,
              'image_url', coalesce(
                nullif(staged.color_on_model_front_image, ''),
                nullif(staged.color_front_image, ''),
                v_image
              ),
              'vendor_cost', staged.customer_price
            )
            order by staged.color_name, staged.size_order, staged.size_name
          ),
          '[]'::jsonb
        )
      into v_cost, v_inventory, v_sizes, v_colors, v_variants
      from public.ss_sku_staging staged
      where staged.style_session_id = p_session_id
        and staged.style_id = v_style.style_id
        and not staged.noe_retailing
        and staged.inventory_qty > 0
        and nullif(staged.sku, '') is not null
        and nullif(staged.size_name, '') is not null
        and nullif(staged.color_name, '') is not null
        and staged.customer_price > 0;

      select *
      into v_rule
      from public.storefront_pricing_rules
      where rule_key = v_rule_key
        and is_active;

      if not found then
        v_hidden_reason :=
          'Hidden from public shop: storefront pricing rule is unavailable.';
      else
        v_price := least(
          v_rule.maximum_price,
          (
            ceil(
              greatest(
                v_rule.minimum_price,
                v_cost * v_rule.cost_multiplier
                  + v_rule.fixed_allowance
                  + v_rule.storefront_margin_buffer
              ) - 0.99
            ) + 0.99
          )::numeric(10, 2)
        );
        if v_price <= 0 then
          v_hidden_reason :=
            'Hidden from public shop: storefront price is unavailable.';
        elsif v_price < v_cost
          or (v_price - v_cost) / nullif(v_price, 0)
            < v_rule.minimum_margin_percent then
          v_hidden_reason :=
            'Hidden from public shop: vendor cost exceeds the competitive category price ceiling.';
        end if;
      end if;
    end if;

    v_restricted := v_restricted + coalesce(v_style.restricted_variants, 0);

    select id
    into v_product_id
    from public.products
    where lower(coalesce(vendor_source, '')) = 's&s activewear'
      and lower(coalesce(supplier_sku, '')) =
        lower(coalesce(v_style.part_number, ''))
    order by created_date desc
    limit 1;

    if v_hidden_reason is not null then
      if v_product_id is not null then
        update public.products
        set
          visibility = 'hidden',
          is_active = false,
          internal_notes = concat_ws(
            E'\n',
            nullif(btrim(internal_notes), ''),
            v_hidden_reason
          ),
          updated_date = now()
        where id = v_product_id;
      end if;

      insert into public.ss_shaka_publication_reviews (
        session_id, style_id, part_number, title, normalized_category,
        review_status, hidden_reason, eligible_variant_count,
        restricted_variant_count, product_id
      ) values (
        p_session_id, v_style.style_id, v_style.part_number, v_name, v_category,
        'hidden', v_hidden_reason, v_style.eligible_variants,
        v_style.restricted_variants, v_product_id
      );
      v_hidden := v_hidden + 1;
      continue;
    end if;

    v_product_id := coalesce(v_product_id, gen_random_uuid()::text);
    v_variants := (
      select jsonb_agg(
        jsonb_set(variant.value, '{price}', to_jsonb(v_price), true)
        order by variant.ordinality
      )
      from jsonb_array_elements(v_variants)
        with ordinality as variant(value, ordinality)
    );

    insert into public.products (
      id, name, description, price, product_type, product_subtype, visibility,
      image_url, mockup_images, stock, category, categories, tags, is_active,
      is_sample, vendor_source, vendor_cost, blank_garment_cost, profit_estimate,
      internal_notes, supplier_sku, available_sizes, available_colors, size_prices,
      storefront_pricing_tier, storefront_pricing_rule_key, storefront_price_buffer,
      storefront_price_before_buffer, storefront_premium,
      storefront_image_approved, storefront_price_applied_at
    ) values (
      v_product_id,
      v_name,
      concat_ws(
        ' ',
        coalesce(v_style.title, v_style.style_name),
        'Heavyweight Shaka Wear blank apparel. Custom decoration is optional and priced separately.'
      ),
      v_price,
      'physical',
      v_subtype,
      'public',
      v_image,
      jsonb_build_array(v_image),
      v_inventory,
      v_category,
      jsonb_build_array(v_category),
      jsonb_build_array('Shaka Wear', 'Streetwear', 'Blank Apparel'),
      true,
      false,
      'S&S Activewear',
      v_cost,
      v_cost,
      greatest(v_price - v_cost, 0),
      'Eligible Shaka Wear item published after image, catalog, price, inventory, SKU, restriction, color, and size checks.',
      v_style.part_number,
      v_sizes,
      v_colors,
      v_variants,
      v_rule.display_name,
      v_rule_key,
      3.00,
      greatest(v_price - 3.00, 0),
      false,
      true,
      now()
    )
    on conflict (id) do update set
      name = excluded.name,
      description = excluded.description,
      price = excluded.price,
      sale_price = null,
      product_subtype = excluded.product_subtype,
      visibility = 'public',
      image_url = excluded.image_url,
      mockup_images = excluded.mockup_images,
      stock = excluded.stock,
      category = excluded.category,
      categories = excluded.categories,
      tags = excluded.tags,
      is_active = true,
      is_sample = false,
      vendor_cost = excluded.vendor_cost,
      blank_garment_cost = excluded.blank_garment_cost,
      profit_estimate = excluded.profit_estimate,
      internal_notes = excluded.internal_notes,
      available_sizes = excluded.available_sizes,
      available_colors = excluded.available_colors,
      size_prices = excluded.size_prices,
      storefront_pricing_tier = excluded.storefront_pricing_tier,
      storefront_pricing_rule_key = excluded.storefront_pricing_rule_key,
      storefront_price_buffer = 3.00,
      storefront_price_before_buffer = excluded.storefront_price_before_buffer,
      storefront_premium = false,
      storefront_image_approved = true,
      storefront_price_applied_at = now(),
      updated_date = now();

    insert into public.ss_shaka_publication_reviews (
      session_id, style_id, part_number, title, normalized_category,
      review_status, eligible_variant_count, restricted_variant_count, product_id
    ) values (
      p_session_id, v_style.style_id, v_style.part_number, v_name, v_category,
      'published', v_style.eligible_variants, v_style.restricted_variants,
      v_product_id
    );
    v_activated := v_activated + 1;
  end loop;

  select count(*)::integer
  into v_public_total
  from public.storefront_products;

  select coalesce(jsonb_object_agg(category, item_count), '{}'::jsonb)
  into v_category_counts
  from (
    select product.category, count(*)::integer as item_count
    from public.ss_shaka_publication_reviews review
    join public.products product on product.id = review.product_id
    where review.session_id = p_session_id
      and review.review_status = 'published'
    group by product.category
  ) counts;

  insert into public.ss_shaka_publication_runs (
    session_id, reviewed_count, activated_count, hidden_count,
    restricted_variants_excluded, public_product_count_after, category_counts
  ) values (
    p_session_id, v_activated + v_hidden, v_activated, v_hidden,
    v_restricted, v_public_total, v_category_counts
  )
  on conflict (session_id) do update set
    reviewed_count = excluded.reviewed_count,
    activated_count = excluded.activated_count,
    hidden_count = excluded.hidden_count,
    restricted_variants_excluded = excluded.restricted_variants_excluded,
    public_product_count_after = excluded.public_product_count_after,
    category_counts = excluded.category_counts,
    completed_at = now();

  return jsonb_build_object(
    'session_id', p_session_id,
    'reviewed_count', v_activated + v_hidden,
    'activated_count', v_activated,
    'hidden_count', v_hidden,
    'restricted_variants_excluded', v_restricted,
    'public_product_count_after', v_public_total,
    'category_counts', v_category_counts,
    'live_order_submitted', false,
    'zerotouch_submitted', false
  );
end;
$$;

revoke all on function public.publish_eligible_shaka_session(text)
from public, anon, authenticated;
grant execute on function public.publish_eligible_shaka_session(text)
to service_role;

comment on function public.publish_eligible_shaka_session(text) is
'Service-only Shaka Wear storefront publication from existing S&S staging; never submits vendor orders.';

-- Publish the latest completed Shaka Wear staging session. This does not create a
-- catalog batch or call an external vendor endpoint.
do $$
declare
  v_session_id text;
begin
  select run.style_session_id
  into v_session_id
  from public.ss_sku_sync_runs run
  where lower(run.brand) = 'shaka wear'
    and run.status = 'completed'
    and exists (
      select 1
      from public.ss_import_staging staged
      where staged.import_session_id = run.style_session_id
        and lower(staged.brand) = 'shaka wear'
    )
  order by run.completed_at desc nulls last, run.created_date desc
  limit 1;

  if v_session_id is null then
    raise exception 'No completed Shaka Wear S&S staging session is available';
  end if;

  perform public.publish_eligible_shaka_session(v_session_id);
end;
$$;

-- Reapply final customer-facing prices to existing public blank apparel. The
-- storefront price is also copied into each SKU variant so detail/cart paths
-- cannot display a stale vendor or variant price.
create temporary table hc_competitive_price_plan on commit drop as
with classified as (
  select
    product.id,
    product.name,
    product.price as previous_price,
    product.category,
    product.image_url,
    product.storefront_image_approved,
    greatest(
      coalesce(product.blank_garment_cost, 0),
      coalesce(product.vendor_cost, 0),
      0
    )::numeric as vendor_cost,
    case
      when lower(product.name) like 'shaka wear %'
        and product.category in (
          'short_sleeve_shirts',
          'mens_short_sleeve_shirts',
          'womens_short_sleeve_shirts'
        ) then 'heavyweight_tshirt'
      else public.hc_storefront_pricing_rule_key(
        product.name,
        product.description,
        case
          when lower(product.name) like 'bella + canvas %' then 'Bella + Canvas'
          when lower(product.name) like 'american apparel %' then 'American Apparel'
          when lower(product.name) like 'comfort colors %' then 'Comfort Colors'
          when lower(product.name) like 'next level %' then 'Next Level'
          when lower(product.name) like 'rabbit skins %' then 'Rabbit Skins'
          when lower(product.name) like 'shaka wear %' then 'Shaka Wear'
          else split_part(product.name, ' ', 1)
        end,
        product.supplier_sku,
        product.category,
        product.categories,
        product.tags
      )
    end as rule_key
  from public.products product
  where product.visibility = 'public'
    and product.is_active
    and product.product_type = 'physical'
),
calculated as (
  select
    classified.*,
    rule.display_name,
    rule.minimum_price,
    rule.maximum_price,
    rule.minimum_margin_percent,
    (
      ceil(
        greatest(
          rule.minimum_price,
          classified.vendor_cost * rule.cost_multiplier
            + rule.fixed_allowance
            + rule.storefront_margin_buffer
        ) - 0.99
      ) + 0.99
    )::numeric(10, 2) as uncapped_price
  from classified
  join public.storefront_pricing_rules rule
    on rule.rule_key = classified.rule_key
   and rule.is_active
  where classified.rule_key in (
    'basic_tshirt', 'premium_tshirt', 'heavyweight_tshirt', 'long_sleeve',
    'youth_kids', 'crewneck', 'hoodie', 'hat', 'bag'
  )
)
select
  calculated.*,
  least(
    calculated.maximum_price,
    greatest(calculated.minimum_price, calculated.uncapped_price)
  )::numeric(10, 2) as public_price,
  case
    when calculated.vendor_cost >
      least(
        calculated.maximum_price,
        greatest(calculated.minimum_price, calculated.uncapped_price)
      ) then 'hidden'
    when (
      least(
        calculated.maximum_price,
        greatest(calculated.minimum_price, calculated.uncapped_price)
      ) - calculated.vendor_cost
    ) / nullif(
      least(
        calculated.maximum_price,
        greatest(calculated.minimum_price, calculated.uncapped_price)
      ),
      0
    ) < calculated.minimum_margin_percent then 'hidden'
    else 'repriced'
  end as visibility_action
from calculated;

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
  plan.id,
  plan.rule_key,
  plan.previous_price,
  case when plan.visibility_action = 'repriced' then plan.public_price end,
  plan.vendor_cost,
  case
    when plan.visibility_action = 'repriced'
      then greatest(plan.public_price - plan.vendor_cost, 0)
  end,
  plan.visibility_action,
  case
    when plan.visibility_action = 'repriced'
      then 'Competitive blank-apparel storefront price applied; includes the configured $3.00 buffer.'
    else 'Hidden from public shop because vendor cost cannot support the competitive category price ceiling.'
  end
from hc_competitive_price_plan plan;

update public.products product
set
  price = plan.public_price,
  sale_price = null,
  size_prices = case
    when jsonb_typeof(product.size_prices) = 'array' then (
      select coalesce(
        jsonb_agg(
          case
            when jsonb_typeof(variant.value) = 'object'
              then jsonb_set(
                variant.value,
                '{price}',
                to_jsonb(plan.public_price),
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
  profit_estimate = greatest(plan.public_price - plan.vendor_cost, 0),
  storefront_pricing_tier = plan.display_name,
  storefront_pricing_rule_key = plan.rule_key,
  storefront_price_buffer = 3.00,
  storefront_price_before_buffer = greatest(plan.public_price - 3.00, 0),
  storefront_price_applied_at = now(),
  updated_date = now()
from hc_competitive_price_plan plan
where product.id = plan.id
  and plan.visibility_action = 'repriced';

update public.products product
set
  visibility = 'hidden',
  is_active = false,
  internal_notes = concat_ws(
    E'\n',
    nullif(btrim(product.internal_notes), ''),
    'Hidden from public shop because vendor cost cannot support the competitive category price ceiling.'
  ),
  storefront_pricing_tier = plan.display_name,
  storefront_pricing_rule_key = plan.rule_key,
  storefront_price_applied_at = now(),
  updated_date = now()
from hc_competitive_price_plan plan
where product.id = plan.id
  and plan.visibility_action = 'hidden';

-- A swatch is not a customer-ready product image.
create temporary table hc_placeholder_products on commit drop as
select product.id
from public.products product
where product.visibility = 'public'
  and product.is_active
  and product.product_type = 'physical'
  and (
    nullif(btrim(product.image_url), '') is null
    or lower(product.image_url) ~
      '(colorswatch|placeholder|no[-_ ]?image|missing[-_ ]?image|image[-_ ]?unavailable|coming[-_ ]?soon)'
  );

update public.products product
set
  visibility = 'hidden',
  is_active = false,
  storefront_image_approved = false,
  internal_notes = concat_ws(
    E'\n',
    nullif(btrim(product.internal_notes), ''),
    'Hidden because product image is placeholder or missing.'
  ),
  updated_date = now()
from hc_placeholder_products hidden
where product.id = hidden.id;

update public.ss_shaka_publication_runs run
set
  placeholder_products_hidden = (
    select count(*)::integer from hc_placeholder_products
  ),
  pricing_products_hidden = (
    select count(*)::integer
    from hc_competitive_price_plan
    where visibility_action = 'hidden'
  ),
  public_product_count_after = (
    select count(*)::integer from public.storefront_products
  ),
  completed_at = now()
where run.session_id = (
  select style_session_id
  from public.ss_sku_sync_runs
  where lower(brand) = 'shaka wear'
    and status = 'completed'
  order by completed_at desc nulls last, created_date desc
  limit 1
);

do $$
begin
  if exists (
    select 1
    from public.storefront_products storefront
    join public.products product on product.id = storefront.id
    where product.storefront_pricing_rule_key = 'basic_tshirt'
      and storefront.price not between 4.99 and 7.99
  ) then
    raise exception 'A public basic tee is outside the competitive target range';
  end if;
  if exists (
    select 1
    from public.storefront_products storefront
    join public.products product on product.id = storefront.id
    where product.storefront_pricing_rule_key = 'heavyweight_tshirt'
      and storefront.price not between 8.99 and 12.99
  ) then
    raise exception 'A public Shaka Wear tee is outside the heavyweight target range';
  end if;
  if exists (
    select 1
    from public.storefront_products
    where lower(coalesce(image_url, '')) ~
      '(colorswatch|placeholder|no[-_ ]?image|missing[-_ ]?image)'
  ) then
    raise exception 'A placeholder image remains public';
  end if;
  if exists (
    select 1
    from public.vendor_order_drafts
    where live_submission_enabled is true
  ) then
    raise exception 'Live S&S submission must remain disabled';
  end if;
  if exists (
    select 1
    from public.ss_catalog_workflow_status
    where id is true
      and (product_loading_paused is not true or max_batch_sequence <> 3)
  ) then
    raise exception 'Product loading pause or no-Batch-4 invariant failed';
  end if;
end;
$$;

commit;
