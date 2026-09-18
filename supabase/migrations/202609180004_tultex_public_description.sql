-- This approved public item retained its old private launch-batch placeholder.
-- Keep its approval history in internal_notes; change only customer-facing copy.
update public.products
set description = 'Tultex T-Shirt is available as blank apparel in the listed colors and sizes. Custom printing is optional when you need it.'
where id = '97abc6d9-af7a-4f7b-9615-69c9ec599a6e'
  and visibility = 'public'
  and is_active is true
  and description = 'Private S&S Activewear launch-batch product. Not approved for the public storefront.';
