begin;

alter table public.products
  add column if not exists design_studio_front_images jsonb not null default '{}'::jsonb;

-- The Studio rollout is intentionally narrower than the public storefront.
-- Products stay public for ordinary blank-apparel shopping; this flag controls
-- only whether a new Design Studio mockup may be started with the product.
update public.products
set design_studio_eligible = false,
    design_studio_garment_type = null,
    design_studio_image_status = 'needs_review',
    design_studio_approved_colors = '{}'::text[],
    design_studio_front_images = '{}'::jsonb,
    design_studio_image_note = 'Outside the approved Design Studio brand or garment-type scope.',
    design_studio_reviewed_at = now()
where lower(coalesce(brand, '')) not in (
    'gildan', 'comfort colors', 'shaka wear', 'hanes', 'next level',
    'bella + canvas', 'american apparel', 'tultex'
  )
  or lower(coalesce(primary_garment_type, '')) not in ('t_shirts', 'hoodies', 'crewnecks');

-- Classify every live qualifying catalog product explicitly. Hoodie subtype is
-- based on the reviewed style identity, not on loose title matching.
update public.products
set design_studio_eligible = false,
    design_studio_garment_type = case
      when lower(primary_garment_type) = 't_shirts' then 't_shirts'
      when lower(primary_garment_type) = 'crewnecks' then 'crewnecks'
      when id in (
        'f2b732d9-0ee6-4fad-9c96-5ed10d7f1fb0',
        'd28c029d-efec-483b-9e3e-382f16b95076',
        '0b6ff7f4-2de2-43d9-b6f9-7191fd90cee4',
        '8daaa1f5-b5ce-48a0-a37b-db1f97400717'
      ) then 'zip_hoodies'
      else 'pullover_hoodies'
    end,
    design_studio_image_status = 'needs_review',
    design_studio_approved_colors = '{}'::text[],
    design_studio_front_images = '{}'::jsonb,
    design_studio_image_note = 'Qualifying garment is awaiting an approved exact-style, exact-color front photograph.',
    design_studio_reviewed_at = now()
where product_type = 'physical'
  and visibility = 'public'
  and is_active is true
  and lower(coalesce(brand, '')) in (
    'gildan', 'comfort colors', 'shaka wear', 'hanes', 'next level',
    'bella + canvas', 'american apparel', 'tultex'
  )
  and lower(coalesce(primary_garment_type, '')) in ('t_shirts', 'hoodies', 'crewnecks');

-- Eight styles had an unsuitable first image but a different authorized
-- supplier/catalog color photograph passed the 2026-10-04 visual review.
with overrides(product_id, approved_color) as (
  values
    ('f2b732d9-0ee6-4fad-9c96-5ed10d7f1fb0', 'Bone'),
    ('0e764aaf-9774-487a-addd-fe3f5ad6059c', 'Grey'),
    ('01ce9d6d-2e28-4cc1-8c93-223d494f1553', 'Black'),
    ('fb72fb5d-4772-4266-aced-ef5a2dae27e7', 'Tangerine'),
    ('1e8dded4-3607-4018-ba8f-02832c25b15e', 'Ash'),
    ('aac90f00-4985-4cb6-a3e7-8aa9e09101f0', 'Yellow'),
    ('c5a93c19-c10b-460a-9ef5-cd3bd625fe8e', 'Army Brown'),
    ('9fddb455-56f1-4d57-bc70-c9ec6d8a94be', 'Turquoise')
), qualifying as (
  select product.*,
         override.approved_color
  from public.products product
  left join overrides override on override.product_id = product.id
  where product.product_type = 'physical'
    and product.visibility = 'public'
    and product.is_active is true
    and coalesce(product.stock, 0) > 0
    and lower(coalesce(product.brand, '')) in (
      'gildan', 'comfort colors', 'shaka wear', 'hanes', 'next level',
      'bella + canvas', 'american apparel', 'tultex'
    )
    and lower(coalesce(product.primary_garment_type, '')) in ('t_shirts', 'hoodies', 'crewnecks')
    and product.id not in (
      '8f9d0fd7-7fc6-4fb3-b90c-1fc6015d2e46',
      '8daaa1f5-b5ce-48a0-a37b-db1f97400717'
    )
), reviewed as (
  select qualifying.id,
         selected.color,
         selected.image_url
  from qualifying
  cross join lateral (
    select
      coalesce(nullif(variant.value->>'color_name', ''), nullif(variant.value->>'color', ''), split_part(variant.value->>'size', ' / ', 1)) as color,
      variant.value->>'image_url' as image_url
    from jsonb_array_elements(coalesce(qualifying.size_prices::jsonb, '[]'::jsonb)) with ordinality as variant(value, position)
    where coalesce(nullif(variant.value->>'inventory', '')::numeric, 0) > 0
      and coalesce(variant.value->>'image_url', '') <> ''
      and (
        qualifying.approved_color is null
        or lower(coalesce(nullif(variant.value->>'color_name', ''), nullif(variant.value->>'color', ''), split_part(variant.value->>'size', ' / ', 1))) = lower(qualifying.approved_color)
      )
    order by
      case
        when qualifying.approved_color is not null then 0
        when variant.value->>'image_url' like '%/Images/Color/%' then 0
        when variant.value->>'image_url' = qualifying.image_url then 1
        else 2
      end,
      case when lower(coalesce(nullif(variant.value->>'color_name', ''), nullif(variant.value->>'color', ''), split_part(variant.value->>'size', ' / ', 1))) = 'black' then 0 else 1 end,
      variant.position
    limit 1
  ) selected
)
update public.products product
set design_studio_eligible = true,
    design_studio_image_status = 'approved',
    design_studio_approved_colors = array[reviewed.color]::text[],
    design_studio_front_images = jsonb_build_object(reviewed.color, reviewed.image_url),
    design_studio_image_note = 'Visual review 2026-10-04: this exact-style, exact-color supplier photograph is straight-on and leaves the garment printing surface unobstructed.',
    design_studio_reviewed_at = now()
from reviewed
where product.id = reviewed.id;

-- These two products are accounted for but not selectable. All currently
-- available supplier image URLs failed to render during the visual review.
update public.products
set design_studio_eligible = false,
    design_studio_image_status = 'needs_review',
    design_studio_approved_colors = '{}'::text[],
    design_studio_front_images = '{}'::jsonb,
    design_studio_image_note = 'Suitable image needed: every current exact-color supplier image URL failed to render during visual review on 2026-10-04.',
    design_studio_reviewed_at = now()
where id in (
  '8f9d0fd7-7fc6-4fb3-b90c-1fc6015d2e46',
  '8daaa1f5-b5ce-48a0-a37b-db1f97400717'
);

alter table public.products drop constraint if exists products_design_studio_approval_complete_check;
alter table public.products add constraint products_design_studio_approval_complete_check check (
  design_studio_eligible is false or (
    design_studio_garment_type is not null
    and design_studio_image_status = 'approved'
    and cardinality(design_studio_approved_colors) > 0
    and design_studio_front_images <> '{}'::jsonb
  )
);

create or replace view public.design_studio_products
with (security_barrier = true)
as
select
  storefront.*,
  product.design_studio_eligible,
  product.design_studio_garment_type,
  product.design_studio_image_status,
  product.design_studio_image_note,
  product.design_studio_reviewed_at,
  product.design_studio_approved_colors,
  product.design_studio_front_images
from public.storefront_products storefront
join public.products product on product.id = storefront.id
where product.design_studio_eligible is true
  and product.design_studio_image_status = 'approved'
  and cardinality(product.design_studio_approved_colors) > 0
  and product.design_studio_front_images <> '{}'::jsonb
  and lower(product.brand) in (
    'gildan', 'comfort colors', 'shaka wear', 'hanes', 'next level',
    'bella + canvas', 'american apparel', 'tultex'
  )
  and product.design_studio_garment_type in ('t_shirts', 'pullover_hoodies', 'zip_hoodies', 'crewnecks');

revoke all on public.design_studio_products from public;
grant select on public.design_studio_products to anon, authenticated;

commit;
