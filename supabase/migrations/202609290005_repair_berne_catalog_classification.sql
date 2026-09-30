begin;

-- ICECAP is a product family name, not headwear. Two styles reached the public
-- catalog through that false match without the normal outerwear size-coverage
-- gate. Keep the source data for audit, but return those two records to private
-- status before selecting two replacement styles through the authenticated QA
-- importer.
update public.products
set visibility='draft',
    is_active=false,
    draft_qa_status=null,
    internal_notes='Private Berne catalog record. Removed from public view after correcting ICECAP outerwear classification; current common-size coverage does not meet the live catalog QA gate.'
where brand='Berne'
  and style_number in ('NCH377','NJ51T')
  and visibility='public';

update public.products
set primary_garment_type='outerwear',
    category='mens_jackets',
    categories='["Outerwear", "outerwear"]'::jsonb,
    secondary_tags='["mens", "business_apparel", "winter_cold_weather", "workwear"]'::jsonb
where brand='Berne'
  and style_number='NJ51'
  and visibility='public';

commit;
