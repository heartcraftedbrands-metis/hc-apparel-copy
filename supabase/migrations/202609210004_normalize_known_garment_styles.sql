begin;

-- Legacy imports sometimes carry a style-only vendor name. Persist the same
-- known style mappings used by the storefront classifier so an earlier broad
-- "Other" backfill cannot override the verified garment type.
update public.products product
set primary_garment_type = mapping.primary_garment_type
from (values
  ('champion', '63284', 't_shirts'),
  ('champion', 'co200', 't_shirts'),
  ('champion', '00784', 't_shirts'),
  ('champion', 't425', 't_shirts'),
  ('champion', '21284', 'crewnecks'),
  ('champion', 's600', 'crewnecks'),
  ('champion', '22884', 'hoodies'),
  ('champion', 's700', 'hoodies'),
  ('gildan', '18500', 'hoodies'),
  ('gildan', '18000', 'crewnecks'),
  ('gildan', '5000', 't_shirts'),
  ('gildan', '64000', 't_shirts'),
  ('bella + canvas', '3001', 't_shirts'),
  ('comfort colors', '1717', 't_shirts'),
  ('next level', '3600', 't_shirts'),
  ('tultex', '202', 't_shirts'),
  ('hanes', '5280', 't_shirts'),
  ('lane seven', 'ls14001', 'hoodies'),
  ('lane seven', 'ls14003', 'hoodies'),
  ('lane seven', 'ls14004', 'crewnecks'),
  ('independent trading co', 'ss4500', 'hoodies'),
  ('independent trading co', 'ss4500z', 'hoodies'),
  ('independent trading co', 'ind4000', 'hoodies'),
  ('independent trading co', 'ind4000z', 'hoodies'),
  ('independent trading co', 'ind5000p', 'hoodies'),
  ('oakley', 'fos900833', 'hats'),
  ('oakley', 'fos901100', 'bags'),
  ('oakley', 'foa402993', 'polos'),
  ('oakley', 'foa402994', 'hoodies'),
  ('dri duck', '3458', 'hats'),
  ('dri duck', '5020', 'outerwear'),
  ('dri duck', '7035', 'hoodies'),
  ('dri duck', '9340', 'outerwear'),
  ('dri duck', '9416', 'outerwear')
) as mapping(brand_key, style_key, primary_garment_type)
where lower(btrim(coalesce(product.brand, ''))) = mapping.brand_key
  and (
    lower(btrim(coalesce(product.style_number, ''))) = mapping.style_key
    or lower(btrim(coalesce(product.supplier_sku, ''))) = mapping.style_key
  );

commit;
