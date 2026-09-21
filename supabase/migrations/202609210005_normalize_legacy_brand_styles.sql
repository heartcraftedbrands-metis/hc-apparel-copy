begin;

-- Normalize remaining legacy style-only imports. These values are HC Apparel's
-- display organization only; vendor categories and S&S source data are retained.
update public.products product
set primary_garment_type = mapping.primary_garment_type
from (values
  ('comfortcolors', '08508', 't_shirts'),
  ('comfortcolors', '6030', 't_shirts'),
  ('comfortcolors', '08108', 'long_sleeve'),
  ('comfortcolors', '6014', 'long_sleeve'),
  ('comfortcolors', '00708', 't_shirts'),
  ('comfortcolors', '1717', 't_shirts'),
  ('gildan', '22060', 'hoodies'),
  ('gildan', '18500', 'hoodies'),
  ('gildan', '00760', 't_shirts'),
  ('gildan', '2000', 't_shirts'),
  ('gildan', '00060', 't_shirts'),
  ('gildan', '5000', 't_shirts'),
  ('gildan', '00660', 't_shirts'),
  ('gildan', '64000', 't_shirts'),
  ('shakawear', '272c2', 'tank_tops'),
  ('shakawear', 'shktt', 'tank_tops'),
  ('shakawear', '296c2', 'tank_tops'),
  ('shakawear', 'shtank', 'tank_tops'),
  ('shakawear', '298c2', 'long_sleeve'),
  ('shakawear', 'shthrm', 'long_sleeve'),
  ('bellacanvas', '84706', 't_shirts'),
  ('bellacanvas', '3413', 't_shirts'),
  ('bellacanvas', '05606', 't_shirts'),
  ('bellacanvas', '3501', 't_shirts'),
  ('bellacanvas', '00706', 't_shirts'),
  ('bellacanvas', '3001cvc', 't_shirts'),
  ('bellacanvas', '00606', 't_shirts'),
  ('bellacanvas', '3001', 't_shirts'),
  ('nextlevel', '55118', 't_shirts'),
  ('nextlevel', '3312', 't_shirts'),
  ('nextlevel', '84718', 't_shirts'),
  ('nextlevel', '6010', 't_shirts'),
  ('nextlevel', '00618', 't_shirts'),
  ('nextlevel', '3600', 't_shirts'),
  ('nextlevel', '20618', 't_shirts'),
  ('nextlevel', '6210', 't_shirts'),
  ('hanes', '00600', 't_shirts'),
  ('hanes', '4980', 't_shirts'),
  ('hanes', '22000', 'hoodies'),
  ('hanes', 'p170', 'hoodies'),
  ('hanes', '00700', 't_shirts'),
  ('hanes', '5250', 't_shirts'),
  ('hanes', '00000', 't_shirts'),
  ('hanes', '5280', 't_shirts'),
  ('oakley', '14987', 'hats'),
  ('oakley', 'fos900833', 'hats'),
  ('oakley', '08787', 'polos'),
  ('oakley', 'foa402993', 'polos'),
  ('oakley', '08887', 'hoodies'),
  ('oakley', 'foa402994', 'hoodies'),
  ('rabbitskins', '30238', 't_shirts'),
  ('rabbitskins', '4400', 't_shirts'),
  ('rabbitskins', '31838', 't_shirts'),
  ('rabbitskins', '3321', 't_shirts'),
  ('laneseven', '492c9', 't_shirts'),
  ('laneseven', 'ls15001', 't_shirts'),
  ('laneseven', '595c9', 't_shirts'),
  ('laneseven', 'ls16001', 't_shirts'),
  ('laneseven', '487c9', 'hoodies'),
  ('laneseven', 'ls14001', 'hoodies'),
  ('laneseven', '489c9', 'crewnecks'),
  ('laneseven', 'ls14004', 'crewnecks')
) as mapping(brand_key, style_key, primary_garment_type)
where regexp_replace(lower(btrim(coalesce(product.brand, ''))), '[^a-z0-9]+', '', 'g') = mapping.brand_key
  and (
    lower(btrim(coalesce(product.style_number, ''))) = mapping.style_key
    or lower(btrim(coalesce(product.supplier_sku, ''))) = mapping.style_key
    or lower(coalesce(product.description, '')) like '%style: ' || mapping.style_key || '%'
  );

commit;
