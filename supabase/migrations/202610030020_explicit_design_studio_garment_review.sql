begin;

alter table public.products
  add column if not exists design_studio_eligible boolean not null default false,
  add column if not exists design_studio_garment_type text,
  add column if not exists design_studio_image_status text not null default 'needs_review',
  add column if not exists design_studio_image_note text,
  add column if not exists design_studio_reviewed_at timestamptz,
  add column if not exists design_studio_reviewed_by uuid references auth.users(id) on delete set null;

alter table public.products drop constraint if exists products_design_studio_garment_type_check;
alter table public.products add constraint products_design_studio_garment_type_check check (
  design_studio_garment_type is null or design_studio_garment_type in (
    't_shirts', 'pullover_hoodies', 'zip_hoodies', 'crewnecks'
  )
);

alter table public.products drop constraint if exists products_design_studio_image_status_check;
alter table public.products add constraint products_design_studio_image_status_check check (
  design_studio_image_status in ('needs_review', 'approved', 'rejected')
);

-- Start closed: a storefront classification or a matching word in a title is
-- not Design Studio approval. Products become selectable only after an explicit
-- garment classification and an image-suitability review.
update public.products
set design_studio_eligible = false,
    design_studio_garment_type = null,
    design_studio_image_status = 'needs_review',
    design_studio_image_note = coalesce(design_studio_image_note, 'Needs Design Studio garment and unobstructed-image review.')
where design_studio_reviewed_at is null;

-- These exact front image families were visually inspected in the production
-- Design Studio on 2026-10-03. They are straight-on and leave the relevant
-- printing surface unobstructed. Exact-color images continue to come from the
-- selected in-stock S&S catalog variant; no image is fabricated or mirrored.
update public.products
set design_studio_eligible = true,
    design_studio_garment_type = 't_shirts',
    design_studio_image_status = 'approved',
    design_studio_image_note = 'Production UI visual review 2026-10-03: straight-on front with unobstructed torso; use exact-color S&S variant image.',
    design_studio_reviewed_at = now()
where lower(brand) = 'gildan'
  and upper(concat_ws(' ', style_number, supplier_sku, name)) ~ '(^|[^A-Z0-9])5000([^A-Z0-9]|$)';

update public.products
set design_studio_eligible = true,
    design_studio_garment_type = 'pullover_hoodies',
    design_studio_image_status = 'approved',
    design_studio_image_note = 'Production UI visual review 2026-10-03: straight-on front with arms down and unobstructed chest; pouch and hood remain visible.',
    design_studio_reviewed_at = now()
where lower(brand) = 'gildan'
  and upper(concat_ws(' ', style_number, supplier_sku, name)) ~ '(^|[^A-Z0-9])18500([^A-Z0-9]|$)';

update public.products
set design_studio_eligible = true,
    design_studio_garment_type = 'crewnecks',
    design_studio_image_status = 'approved',
    design_studio_image_note = 'Production UI visual review 2026-10-03: straight-on front with arms down and unobstructed torso.',
    design_studio_reviewed_at = now()
where lower(brand) = 'american apparel'
  and upper(concat_ws(' ', style_number, supplier_sku, name)) ~ '(^|[^A-Z0-9])RF496([^A-Z0-9]|$)';

update public.products
set design_studio_eligible = true,
    design_studio_garment_type = 'zip_hoodies',
    design_studio_image_status = 'approved',
    design_studio_image_note = 'Production UI visual review 2026-10-03: straight-on front with arms down; zipper is visible and chest surfaces are unobstructed.',
    design_studio_reviewed_at = now()
where lower(brand) = 'shaka wear'
  and upper(concat_ws(' ', style_number, supplier_sku, name)) ~ '(^|[^A-Z0-9])SHEHZ([^A-Z0-9]|$)';

-- Berne workwear remains in the normal storefront catalog but is not authorized
-- for this studio rollout. This explicitly covers the styles reported in the UI
-- and prevents another title-based hoodie match from restoring them.
update public.products
set design_studio_eligible = false,
    design_studio_garment_type = null,
    design_studio_image_status = 'needs_review',
    design_studio_image_note = 'Berne workwear is outside the authorized Design Studio garment rollout.',
    design_studio_reviewed_at = now()
where lower(brand) = 'berne';

create index if not exists products_design_studio_review_idx
on public.products(design_studio_eligible, design_studio_image_status, design_studio_garment_type);

create or replace view public.design_studio_products
with (security_barrier = true)
as
select
  storefront.*,
  product.design_studio_eligible,
  product.design_studio_garment_type,
  product.design_studio_image_status,
  product.design_studio_image_note,
  product.design_studio_reviewed_at
from public.storefront_products storefront
join public.products product on product.id = storefront.id
where product.design_studio_eligible is true
  and product.design_studio_image_status = 'approved'
  and product.design_studio_garment_type in ('t_shirts', 'pullover_hoodies', 'zip_hoodies', 'crewnecks');

revoke all on public.design_studio_products from public;
grant select on public.design_studio_products to anon, authenticated;

commit;
