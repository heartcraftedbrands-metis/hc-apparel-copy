-- Correct the already-published exact brand/style records without altering
-- prices, variants, images, visibility, inventory, or customer records.
update public.products
set name = case
    when lower(brand) = lower('Independent Trading Co') and upper(style_number) = 'SS4500'
      then 'Independent Trading Co Unisex Midweight Hooded Sweatshirt'
    when lower(brand) = lower('Gildan') and upper(style_number) = '18810'
      then 'Gildan Unisex Heavy Blend Quarter-Zip Sweatshirt'
    when lower(brand) = lower('Rabbit Skins') and upper(style_number) = '3317'
      then 'Rabbit Skins Toddler Fleece Crewneck Sweatshirt'
    when lower(brand) = lower('Tultex') and upper(style_number) = '340'
      then 'Tultex Unisex Fleece Crewneck Sweatshirt'
    else name
  end,
  updated_date = now()
where (lower(brand), upper(style_number)) in (
  (lower('Independent Trading Co'), 'SS4500'),
  (lower('Gildan'), '18810'),
  (lower('Rabbit Skins'), '3317'),
  (lower('Tultex'), '340')
);
