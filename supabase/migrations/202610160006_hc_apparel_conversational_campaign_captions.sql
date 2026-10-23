begin;
create temporary table revised_hc_campaign_captions (
  post_id uuid primary key,
  approval_id uuid not null,
  caption text not null
) on commit drop;
insert into revised_hc_campaign_captions values
('31000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001',E'Got a design in mind? Start with an American Apparel boxy tee from HC Apparel. Pick your blank and make it yours.\n\nNeed DTF or DTG printing? Send us your design for a separate printing quote. We’ll confirm the garment and printing details with you.\n\nShop blanks: https://www.ilovehcapparel.net/ShopGarments\n\n#HCApparel #AmericanApparel #BoxyTee #DTFPrinting #DTGPrinting'),
('31000000-0000-4000-8000-000000000002','51000000-0000-4000-8000-000000000002',E'Like the feel of a heavier tee? Take a look at the pictured American Apparel heavyweight blanks for your next design.\n\nThe garments are sold blank. DTF or DTG printing is available by separate quote after we review your artwork and garment choice.\n\nShop blanks: https://www.ilovehcapparel.net/ShopGarments\n\n#HCApparel #AmericanApparel #HeavyweightTee #CustomPrinting #DTFPrinting #DTGPrinting'),
('31000000-0000-4000-8000-000000000003','51000000-0000-4000-8000-000000000003',E'Your design should feel like you. Start with an American Apparel blank tee or fleece piece, then choose the look you want to create.\n\nShopping for blanks is separate from custom printing. Send us your design for a DTF or DTG printing quote, and we’ll confirm what works for your garment and artwork.\n\nShop blanks: https://www.ilovehcapparel.net/ShopGarments\n\n#HCApparel #AmericanApparel #BlankApparel #DTFPrinting #DTGPrinting'),
('31000000-0000-4000-8000-000000000004','51000000-0000-4000-8000-000000000004',E'Crewneck or hoodie—which one fits your next idea? The pictured American Apparel Reflex Fleece blanks give you two comfortable ways to get started.\n\nThese garments are sold blank. Custom DTF or DTG printing is quoted separately after we review your garment, artwork, and placement.\n\nShop blanks: https://www.ilovehcapparel.net/ShopGarments\n\n#HCApparel #AmericanApparel #ReflexFleece #Crewneck #Hoodie #CustomPrinting'),
('31000000-0000-4000-8000-000000000005','51000000-0000-4000-8000-000000000005',E'Planning a matching fleece collection? Start with American Apparel Reflex Fleece blanks and build a coordinated look around your colors and design.\n\nThe fleece is sold blank. DTF or DTG printing is quoted separately once we review the garments, artwork, placements, and quantities you want.\n\nShop blanks: https://www.ilovehcapparel.net/ShopGarments\n\n#HCApparel #AmericanApparel #ReflexFleece #FleeceCollection #DTFPrinting #DTGPrinting'),
('31000000-0000-4000-8000-000000000006','51000000-0000-4000-8000-000000000006',E'Launching a brand, planning an event, or making something just for you? Choose an American Apparel blank from HC Apparel and make the project your own.\n\nBlank garments and custom printing are separate. Send us your design for a DTF or DTG printing quote, and we’ll review the garment, artwork, placement, and quantity with you.\n\nShop blanks: https://www.ilovehcapparel.net/ShopGarments\n\n#HCApparel #AmericanApparel #MakeItYours #BlankApparel #CustomPrinting');
update public.social_studio_posts p
set caption = r.caption,
    post_description = r.caption,
    tone = 'natural, direct, friendly, and conversational',
    workflow_status = 'Draft',
    approved_at = null,
    approved_by = null,
    updated_at = now()
from revised_hc_campaign_captions r
where p.id = r.post_id
  and p.post_description is distinct from r.caption;
update public.marketing_approval_requests a
set proposed_content = r.caption,
    content_version = a.content_version + 1,
    content_hash = md5(concat_ws('|','hc_apparel','post',r.caption,a.image_url,a.scheduled_at::text)),
    status = 'pending',
    approved_version = null,
    approved_hash = null,
    approved_by = null,
    approved_at = null,
    updated_at = now()
from revised_hc_campaign_captions r
where a.id = r.approval_id
  and a.proposed_content is distinct from r.caption;
insert into public.marketing_approval_events(approval_request_id,content_version,event_type,details)
select a.id,a.content_version,'edited_requires_reapproval',jsonb_build_object('reason','Owner-requested conversational HC Apparel tone revision','schedule_preserved',true,'image_preserved',true)
from public.marketing_approval_requests a
join revised_hc_campaign_captions r on r.approval_id = a.id
where not exists (
  select 1 from public.marketing_approval_events e
  where e.approval_request_id = a.id
    and e.content_version = a.content_version
    and e.event_type = 'edited_requires_reapproval'
);
commit;
