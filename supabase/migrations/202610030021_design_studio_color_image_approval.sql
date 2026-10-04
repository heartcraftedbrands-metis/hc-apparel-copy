begin;

alter table public.products
  add column if not exists design_studio_approved_colors text[] not null default '{}'::text[];

-- A product-level approval is not enough: vendor photography can differ by
-- color. These exact color images were inspected in the live Studio on
-- 2026-10-03. Only the reviewed colors are selectable for new designs.
update public.products
set design_studio_approved_colors = array['Black']::text[],
    design_studio_image_note = 'Live Studio review 2026-10-03: Black exact-color front is straight-on and unobstructed.'
where design_studio_eligible is true
  and design_studio_garment_type = 't_shirts'
  and lower(brand) = 'gildan';

update public.products
set design_studio_approved_colors = array['Black']::text[],
    design_studio_image_note = 'Live Studio review 2026-10-03: Black exact-color front is straight-on; hood and pouch are visible and the chest is unobstructed.'
where design_studio_eligible is true
  and design_studio_garment_type = 'pullover_hoodies'
  and lower(brand) = 'gildan';

update public.products
set design_studio_approved_colors = array['Heather Grey']::text[],
    design_studio_image_note = 'Live Studio review 2026-10-03: Heather Grey exact-color front is straight-on and the printable chest is unobstructed. Black remains excluded because hands obstruct the upper garment.'
where design_studio_eligible is true
  and design_studio_garment_type = 'crewnecks'
  and lower(brand) = 'american apparel';

update public.products
set design_studio_approved_colors = array['Shadow']::text[],
    design_studio_image_note = 'Live Studio review 2026-10-03: Shadow exact-color front is straight-on; zipper and chest surfaces are visible and unobstructed.'
where design_studio_eligible is true
  and design_studio_garment_type = 'zip_hoodies'
  and lower(brand) = 'shaka wear';

-- Fail closed if an earlier approval has no exact-color image decision.
update public.products
set design_studio_eligible = false,
    design_studio_image_status = 'needs_review',
    design_studio_image_note = 'Exact-color garment photographs need Design Studio review.'
where design_studio_eligible is true
  and cardinality(design_studio_approved_colors) = 0;

alter table public.products drop constraint if exists products_design_studio_approval_complete_check;
alter table public.products add constraint products_design_studio_approval_complete_check check (
  design_studio_eligible is false or (
    design_studio_garment_type is not null
    and design_studio_image_status = 'approved'
    and cardinality(design_studio_approved_colors) > 0
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
  product.design_studio_approved_colors
from public.storefront_products storefront
join public.products product on product.id = storefront.id
where product.design_studio_eligible is true
  and product.design_studio_image_status = 'approved'
  and cardinality(product.design_studio_approved_colors) > 0
  and product.design_studio_garment_type in ('t_shirts', 'pullover_hoodies', 'zip_hoodies', 'crewnecks');

revoke all on public.design_studio_products from public;
grant select on public.design_studio_products to anon, authenticated;

commit;
