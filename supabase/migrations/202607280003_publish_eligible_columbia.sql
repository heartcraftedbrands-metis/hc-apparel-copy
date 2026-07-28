begin;

alter table public.products drop constraint if exists products_category_check;
alter table public.products add constraint products_category_check check (
  category in (
    'digital_designs', 'halftone_packs', 'distressed_packs', 'design_elements',
    'short_sleeve_shirts', 'mens_short_sleeve_shirts', 'womens_short_sleeve_shirts',
    'youth_short_sleeve_shirts', 'long_sleeve_shirts', 'mens_long_sleeve_shirts',
    'womens_long_sleeve_shirts', 'youth_long_sleeve_shirts', 'crewnecks',
    'mens_crewnecks', 'womens_crewnecks', 'youth_crewnecks', 'polo_shirts',
    'mens_polo_shirts', 'womens_polo_shirts', 'youth_polo_shirts', 'jackets',
    'mens_jackets', 'womens_jackets', 'youth_jackets', 'sportswear',
    'mens_sportswear', 'womens_sportswear', 'youth_sportswear', 'hoodies',
    'fleece', 'outerwear', 'hats', 'bags', 'office_supplies', 'accessories',
    'other', 'apparel_blanks'
  )
);

alter table public.products drop constraint if exists products_product_subtype_check;
alter table public.products add constraint products_product_subtype_check check (
  product_subtype in (
    't_shirts', 'hoodies', 'sweatshirts', 'fleece', 'outerwear', 'hats', 'bags',
    'kids_apparel', 'apparel_blanks', 'custom_printed', 'print_support', 'other', ''
  )
);

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
values
  ('fleece', 'Premium fleece', 21.99, 59.99, 1.20, 1.50, 0.08, true, true, 94, 3.00)
on conflict (rule_key) do update set
  display_name = excluded.display_name,
  minimum_price = excluded.minimum_price,
  maximum_price = excluded.maximum_price,
  cost_multiplier = excluded.cost_multiplier,
  fixed_allowance = excluded.fixed_allowance,
  minimum_margin_percent = excluded.minimum_margin_percent,
  hide_above_maximum = excluded.hide_above_maximum,
  is_active = true,
  sort_order = excluded.sort_order,
  storefront_margin_buffer = excluded.storefront_margin_buffer,
  updated_date = now();

create table if not exists public.ss_columbia_publication_reviews (
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

create table if not exists public.ss_columbia_publication_runs (
  id text primary key default gen_random_uuid()::text,
  session_id text not null unique,
  activated_count integer not null default 0,
  hidden_count integer not null default 0,
  restricted_variants_excluded integer not null default 0,
  public_product_count_after integer not null default 0,
  category_counts jsonb not null default '{}'::jsonb,
  completed_at timestamptz not null default now()
);

alter table public.ss_columbia_publication_reviews enable row level security;
alter table public.ss_columbia_publication_runs enable row level security;

drop policy if exists admin_all_ss_columbia_publication_reviews
on public.ss_columbia_publication_reviews;
create policy admin_all_ss_columbia_publication_reviews
on public.ss_columbia_publication_reviews
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists admin_all_ss_columbia_publication_runs
on public.ss_columbia_publication_runs;
create policy admin_all_ss_columbia_publication_runs
on public.ss_columbia_publication_runs
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

revoke all on public.ss_columbia_publication_reviews from public, anon;
revoke all on public.ss_columbia_publication_runs from public, anon;
grant select on public.ss_columbia_publication_reviews to authenticated;
grant select on public.ss_columbia_publication_runs to authenticated;

create or replace function public.publish_eligible_columbia_session(p_session_id text)
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
  if p_session_id is null or p_session_id !~ '^ss-columbia-public-' then
    raise exception 'A valid Columbia publication session is required';
  end if;

  if not exists (
    select 1 from public.ss_import_staging
    where import_session_id = p_session_id and lower(brand) = 'columbia'
  ) then
    raise exception 'No Columbia styles were staged for this session';
  end if;

  delete from public.ss_columbia_publication_reviews where session_id = p_session_id;

  for v_style in
    with style_meta as (
      select distinct on ((raw_row_data::jsonb ->> 'styleID')::bigint)
        (raw_row_data::jsonb ->> 'styleID')::bigint as style_id,
        nullif(raw_row_data::jsonb ->> 'partNumber', '') as part_number,
        nullif(raw_row_data::jsonb ->> 'styleName', '') as style_name,
        nullif(raw_row_data::jsonb ->> 'title', '') as title,
        nullif(raw_row_data::jsonb ->> 'baseCategory', '') as base_category,
        nullif(image_url, '') as style_image
      from public.ss_import_staging
      where import_session_id = p_session_id
        and lower(brand) = 'columbia'
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
      count(staged.id) filter (where staged.noe_retailing)::integer as restricted_variants
    from style_meta meta
    left join public.ss_sku_staging staged
      on staged.style_session_id = p_session_id
     and staged.style_id = meta.style_id
     and lower(staged.brand) = 'columbia'
    group by
      meta.style_id, meta.part_number, meta.style_name, meta.title,
      meta.base_category, meta.style_image
    order by meta.part_number
  loop
    v_name := concat_ws(
      ' ',
      'Columbia',
      coalesce(v_style.part_number, ''),
      coalesce(v_style.style_name, v_style.title, '')
    );
    v_category := case
      when lower(v_name) ~ '(beanie|headwear|cap|hat)' then 'hats'
      when lower(v_name) ~ '(hood|hoodie|hooded sweatshirt)' then 'hoodies'
      when lower(v_name) ~ '(jacket|outerwear|coat|soft[ -]?shell|shell|vest|parka|anorak|windbreaker)'
        then 'outerwear'
      when lower(v_name) ~ '(fleece|pullover|quarter[ -]?zip|half[ -]?zip|full[ -]?zip)'
        then 'fleece'
      else null
    end;
    v_subtype := case v_category
      when 'hats' then 'hats'
      when 'hoodies' then 'hoodies'
      when 'outerwear' then 'outerwear'
      when 'fleece' then 'fleece'
      else 'apparel_blanks'
    end;
    v_hidden_reason := null;

    select coalesce(
      max(nullif(staged.color_on_model_front_image, '')),
      max(nullif(staged.color_front_image, '')),
      max(nullif(staged.color_swatch_image, '')),
      v_style.style_image
    )
    into v_image
    from public.ss_sku_staging staged
    where staged.style_session_id = p_session_id
      and staged.style_id = v_style.style_id
      and not staged.noe_retailing
      and staged.inventory_qty > 0;

    if v_category is null then
      v_hidden_reason := 'Hidden from public shop: not an approved Columbia cold-weather or headwear category.';
    elsif nullif(trim(v_name), '') is null or v_style.part_number is null then
      v_hidden_reason := 'Hidden from public shop: missing title or style number.';
    elsif v_style.eligible_variants = 0 then
      v_hidden_reason := 'Hidden from public shop: no eligible in-stock SKU variants with price, color, and size.';
    elsif v_image is null or lower(v_image) ~ '(placeholder|no[-_ ]?image|missing[-_ ]?image)' then
      v_hidden_reason := 'Hidden from public shop: missing or placeholder image.';
    end if;

    if v_hidden_reason is null then
      select
        round(avg(staged.customer_price)::numeric, 2),
        coalesce(sum(staged.inventory_qty), 0),
        coalesce(jsonb_agg(distinct staged.size_name) filter (where staged.size_name is not null), '[]'::jsonb),
        coalesce(jsonb_agg(distinct staged.color_name) filter (where staged.color_name is not null), '[]'::jsonb),
        coalesce(
          jsonb_agg(
            jsonb_build_object(
              'size', staged.color_name || ' / ' || staged.size_name,
              'sku', staged.sku,
              'inventory', staged.inventory_qty,
              'image_url', coalesce(
                nullif(staged.color_on_model_front_image, ''),
                nullif(staged.color_front_image, ''),
                nullif(staged.color_swatch_image, ''),
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

      v_rule_key := case
        when v_category = 'hats' then 'hat'
        when v_category = 'hoodies' then 'premium_cold_weather'
        when v_category = 'fleece' then 'fleece'
        else 'outerwear'
      end;

      select * into v_rule
      from public.storefront_pricing_rules
      where rule_key = v_rule_key and is_active;

      if not found then
        v_hidden_reason := 'Hidden from public shop: storefront pricing rule is unavailable.';
      else
        v_price := least(
          v_rule.maximum_price + v_rule.storefront_margin_buffer,
          (
            ceil(
              greatest(
                v_rule.minimum_price,
                v_cost * v_rule.cost_multiplier + v_rule.fixed_allowance
              ) + v_rule.storefront_margin_buffer - 0.99
            ) + 0.99
          )::numeric(10, 2)
        );

        if v_price <= 0 then
          v_hidden_reason := 'Hidden from public shop: storefront price is unavailable.';
        elsif (v_price - v_cost) / nullif(v_price, 0) < v_rule.minimum_margin_percent then
          v_hidden_reason := 'Hidden from public shop: vendor cost exceeds the reasonable public price ceiling.';
        end if;
      end if;
    end if;

    v_restricted := v_restricted + coalesce(v_style.restricted_variants, 0);

    select id into v_product_id
    from public.products
    where lower(coalesce(vendor_source, '')) = 's&s activewear'
      and lower(coalesce(supplier_sku, '')) = lower(v_style.part_number)
    order by created_date desc
    limit 1;

    if v_hidden_reason is not null then
      if v_product_id is not null then
        update public.products
        set
          visibility = 'hidden',
          is_active = false,
          internal_notes = v_hidden_reason,
          updated_date = now()
        where id = v_product_id;
      end if;
      insert into public.ss_columbia_publication_reviews (
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
      from jsonb_array_elements(v_variants) with ordinality as variant(value, ordinality)
    );

    insert into public.products (
      id, name, description, price, product_type, product_subtype, visibility,
      image_url, mockup_images, stock, category, categories, tags, is_active,
      is_sample, vendor_source, vendor_cost, blank_garment_cost, profit_estimate,
      internal_notes, supplier_sku, available_sizes, available_colors, size_prices,
      storefront_pricing_tier, storefront_pricing_rule_key, storefront_price_buffer,
      storefront_price_before_buffer, storefront_premium, storefront_image_approved,
      storefront_price_applied_at
    ) values (
      v_product_id,
      trim(v_name),
      concat_ws(' ', coalesce(v_style.title, v_style.style_name), 'Premium Columbia blank apparel. Custom decoration is priced separately.'),
      v_price,
      'physical',
      v_subtype,
      'public',
      v_image,
      jsonb_build_array(v_image),
      v_inventory,
      v_category,
      jsonb_build_array(v_category),
      jsonb_build_array('Columbia', 'Premium'),
      true,
      false,
      'S&S Activewear',
      v_cost,
      v_cost,
      greatest(v_price - v_cost, 0),
      'Eligible Columbia item published after image, catalog, price, inventory, SKU, restriction, color, and size checks.',
      v_style.part_number,
      v_sizes,
      v_colors,
      v_variants,
      v_rule.display_name,
      v_rule_key,
      v_rule.storefront_margin_buffer,
      greatest(v_price - v_rule.storefront_margin_buffer, 0),
      true,
      true,
      now()
    )
    on conflict (id) do update set
      name = excluded.name,
      description = excluded.description,
      price = excluded.price,
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
      storefront_price_buffer = excluded.storefront_price_buffer,
      storefront_price_before_buffer = excluded.storefront_price_before_buffer,
      storefront_premium = true,
      storefront_image_approved = true,
      storefront_price_applied_at = now(),
      updated_date = now();

    insert into public.ss_columbia_publication_reviews (
      session_id, style_id, part_number, title, normalized_category,
      review_status, eligible_variant_count, restricted_variant_count, product_id
    ) values (
      p_session_id, v_style.style_id, v_style.part_number, v_name, v_category,
      'published', v_style.eligible_variants, v_style.restricted_variants, v_product_id
    );
    v_activated := v_activated + 1;
  end loop;

  if v_activated = 0 then
    raise exception 'No Columbia products passed the required public storefront checks';
  end if;

  if exists (
    select 1
    from public.products product
    where lower(product.name) like 'columbia%'
      and product.visibility = 'public'
      and product.is_active
      and (
        product.image_url is null
        or product.price <= 0
        or product.stock <= 0
        or jsonb_array_length(coalesce(product.available_sizes, '[]'::jsonb)) = 0
        or jsonb_array_length(coalesce(product.available_colors, '[]'::jsonb)) = 0
        or jsonb_array_length(coalesce(product.size_prices, '[]'::jsonb)) = 0
        or product.category not in ('hoodies', 'fleece', 'outerwear', 'hats')
      )
  ) then
    raise exception 'Columbia post-publication verification failed';
  end if;

  select count(*)::integer into v_public_total
  from public.storefront_products;

  select coalesce(jsonb_object_agg(category, item_count), '{}'::jsonb)
  into v_category_counts
  from (
    select product.category, count(*)::integer as item_count
    from public.ss_columbia_publication_reviews review
    join public.products product on product.id = review.product_id
    where review.session_id = p_session_id
      and review.review_status = 'published'
    group by product.category
  ) counts;

  insert into public.ss_columbia_publication_runs (
    session_id, activated_count, hidden_count, restricted_variants_excluded,
    public_product_count_after, category_counts
  ) values (
    p_session_id, v_activated, v_hidden, v_restricted, v_public_total, v_category_counts
  )
  on conflict (session_id) do update set
    activated_count = excluded.activated_count,
    hidden_count = excluded.hidden_count,
    restricted_variants_excluded = excluded.restricted_variants_excluded,
    public_product_count_after = excluded.public_product_count_after,
    category_counts = excluded.category_counts,
    completed_at = now();

  return jsonb_build_object(
    'session_id', p_session_id,
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

revoke all on function public.publish_eligible_columbia_session(text)
from public, anon, authenticated;
grant execute on function public.publish_eligible_columbia_session(text)
to service_role;

comment on function public.publish_eligible_columbia_session(text) is
'Service-only Columbia storefront publication after required eligibility checks; never submits S&S orders.';

commit;
