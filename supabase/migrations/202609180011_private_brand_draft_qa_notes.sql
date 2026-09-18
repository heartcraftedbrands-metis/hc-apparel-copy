begin;

-- Admin-only review notes for exactly the eleven private imports. The notes
-- are not selected by storefront_products; no visibility or public price changes.
update public.products
set category = 'youth_short_sleeve_shirts',
    categories = '["youth_short_sleeve_shirts"]'::jsonb
where brand = 'Comfort Colors' and style_number = '00208'
  and created_date::date = date '2026-09-18'
  and visibility = 'draft' and is_active is false;

update public.products
set category = 'fleece', categories = '["fleece"]'::jsonb
where brand = 'DRI DUCK' and style_number = '7035'
  and created_date::date = date '2026-09-18'
  and visibility = 'draft' and is_active is false;

update public.products p
set internal_notes = case p.brand || ':' || p.style_number
  when 'Comfort Colors:00108' then 'QA: Data checks passed (40 stocked SKUs, image, pricing cap, current inventory). Blocked pending private product-detail/cart verification and explicit admin approval. No publication.'
  when 'Comfort Colors:00208' then 'QA blocked: all 23 stocked youth tee variants exceed the stored youth/kids price cap at the required cost-plus-buffer floor. Do not discount below margin floor.'
  when 'Comfort Colors:00808' then 'QA blocked: 14 of 75 stocked crewneck variants exceed the stored category price cap. Reconcile merchandising/variant eligibility before approval.'
  when 'Comfort Colors:00908' then 'QA: Data checks passed (64 stocked SKUs, image, pricing cap, current inventory). Blocked pending private product-detail/cart verification and explicit admin approval. No publication.'
  when 'Comfort Colors:10008' then 'QA blocked: all 36 stocked long-sleeve variants exceed the stored category price cap at the required margin floor.'
  when 'Comfort Colors:70108' then 'QA blocked: 22 of 65 stocked hoodie variants exceed the stored category price cap. Do not lower below cost/margin floor.'
  when 'DRI DUCK:3458' then 'QA blocked: DRI DUCK MAP policy/image rights need business review despite 3 stocked variants and a populated MAP field. No publication.'
  when 'DRI DUCK:5020' then 'QA blocked: all 65 stocked variants have MAP floors above the stored outerwear price cap. Verify DRI DUCK MAP policy and pricing rule before publication.'
  when 'DRI DUCK:7035' then 'QA blocked: all 28 stocked fleece variants have MAP floors above the stored fleece price cap. Verify DRI DUCK MAP policy and pricing rule before publication.'
  when 'DRI DUCK:9340' then 'QA blocked: S&S MAP field is 0.01 placeholder, not verified clearance. Confirm DRI DUCK policy and image rights before publication.'
  when 'DRI DUCK:9416' then 'QA blocked: all 6 stocked variants have MAP floors above the stored outerwear price cap. Verify DRI DUCK MAP policy and pricing rule before publication.'
  else p.internal_notes end
where p.brand in ('Comfort Colors', 'DRI DUCK')
  and p.created_date::date = date '2026-09-18'
  and p.visibility = 'draft' and p.is_active is false;

commit;
