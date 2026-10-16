begin;

with campaign as (
  select id from public.marketing_campaigns where campaign_key = 'hc_apparel_organic_launch' limit 1
), drafts(id,idempotency_key,title,caption,alt_text,image_path,scheduled_at,styles) as (
  values
  ('31000000-0000-4000-8000-000000000001'::uuid,'41000000-0000-4000-8000-000000000001'::uuid,'Boxy fits. Bold possibilities.',
   E'Build your next DTF or DTG project on a silhouette with presence. These pictured American Apparel boxy blanks offer distinct starting points for expressive artwork and brand-ready concepts.\n\nCustom printing is quoted separately after we review your design, placement, quantities, and garment compatibility. Shop available blanks and start planning your project: https://www.ilovehcapparel.net/ShopGarments\n\n#HCApparel #AmericanApparel #BoxyTee #DTFPrinting #DTGPrinting',
   'Two models wearing muted purple and olive American Apparel boxy blank tees beside the words “Boxy Fits. Bold Possibilities.”',
   'boxy-tee.png','2026-10-19 19:00:00-04'::timestamptz,array['FTEX00','1302GD']),
  ('31000000-0000-4000-8000-000000000002','41000000-0000-4000-8000-000000000002','Heavyweight tees. Everyday impact.',
   E'Give your artwork a substantial blank canvas. These pictured American Apparel heavyweight tee silhouettes offer two distinct looks for customers planning custom DTF or DTG projects.\n\nPrinting is quoted separately based on your artwork, placement, order details, and garment compatibility. Explore available blank garments: https://www.ilovehcapparel.net/ShopGarments\n\n#HCApparel #AmericanApparel #HeavyweightTee #CustomApparel #DTFPrinting #DTGPrinting',
   'Two models wearing neutral American Apparel heavyweight blank T-shirts with the headline “Heavyweight Tees. Everyday Impact.”',
   'heavyweight-tees.png','2026-10-22 19:00:00-04'::timestamptz,array['13MLO','1301GD']),
  ('31000000-0000-4000-8000-000000000003','41000000-0000-4000-8000-000000000003','Blanks with main-character energy.',
   E'Your idea deserves a strong starting point. Explore American Apparel blank tees and fleece for brand launches, teams, events, and everyday statement pieces—then bring your artwork to HC Apparel for a personalized DTF or DTG printing quote.\n\nGarment and decoration compatibility depends on the selected style and project details, and custom printing is quoted separately. Start with the blanks: https://www.ilovehcapparel.net/ShopGarments\n\n#HCApparel #AmericanApparel #BlankApparel #CustomPrinting #DTFPrinting #DTGPrinting',
   'A diverse group modeling colorful American Apparel blank tees and fleece beneath the words “Blanks with Main-Character Energy.”',
   'main-character-energy.png','2026-10-26 19:00:00-04'::timestamptz,array['FTEX00','1301GD','RF494','RF498']),
  ('31000000-0000-4000-8000-000000000004','41000000-0000-4000-8000-000000000004','Your next favorite fleece.',
   E'Meet two pictured American Apparel Reflex Fleece blank silhouettes ready for your next collection concept: a crewneck and a hoodie. Choose the look that fits your vision, then let’s review the right decoration approach for your artwork.\n\nCustom printing is quoted separately, and process compatibility is confirmed for each project. Shop available blank garments: https://www.ilovehcapparel.net/ShopGarments\n\n#HCApparel #AmericanApparel #ReflexFleece #Crewneck #Hoodie #CustomApparel',
   'A woman in a black crewneck and a man in a cream hoodie modeling American Apparel Reflex Fleece blank styles RF494 and RF498.',
   'fleece-duo.png','2026-10-29 19:00:00-04'::timestamptz,array['RF494','RF498']),
  ('31000000-0000-4000-8000-000000000005','41000000-0000-4000-8000-000000000005','Build a coordinated Reflex Fleece collection.',
   E'Turn a color story into a coordinated custom collection with American Apparel Reflex Fleece blanks. Build around complementary fleece pieces for teams, creators, events, or merch—and keep the look intentional from one garment to the next.\n\nThese are blank garments. DTF or DTG printing is quoted separately after we confirm the selected styles, artwork, placements, and quantities. Explore the collection starting points: https://www.ilovehcapparel.net/ShopGarments\n\n#HCApparel #AmericanApparel #ReflexFleece #ApparelCollection #DTFPrinting #DTGPrinting',
   'Two models in coordinated blue and brown American Apparel Reflex Fleece blank outfits beside “Modern comfort. Your next custom collection.”',
   'reflex-fleece-collection.png','2026-11-02 19:00:00-05'::timestamptz,array['RF494','RF498']),
  ('31000000-0000-4000-8000-000000000006','41000000-0000-4000-8000-000000000006','Make it yours.',
   E'Brand launch, event, team, or everyday style—start with American Apparel blank garments and build a look that feels like yours. HC Apparel can help you plan a custom DTF or DTG project around the garment, artwork, placement, and quantity that fit your vision.\n\nThe garments are sold blank, and custom printing is quoted separately. Browse the available blanks and start your project: https://www.ilovehcapparel.net/ShopGarments\n\n#HCApparel #AmericanApparel #MakeItYours #BlankApparel #CustomPrinting',
   'A group of seven models wearing varied American Apparel blank tees, tanks, and fleece under the message “Make It Yours.”',
   'make-it-yours.png','2026-11-05 19:00:00-05'::timestamptz,array['FTEX00','1302GD','13MLO','1301GD','RF494','RF498'])
)
insert into public.social_studio_posts(
  id,idempotency_key,campaign_id,platform,content_type,brand,product_name,tone,audience,caption_length,cta,
  include_hashtags,notes,image_url,image_mode,caption,status,workflow_status,post_title,post_description,alt_text,keywords,
  destination_url,tracking_url,scheduled_at,schedule_timezone,verification_snapshot
)
select d.id,d.idempotency_key,c.id,'facebook','Product Promo','American Apparel',d.title,'confident and welcoming','customers planning custom printing','medium','Shop blank garments',
  true,'Owner-authorized six-image American Apparel campaign import. Exact finished artwork preserved.',
  'https://www.ilovehcapparel.net/marketing/campaigns/american-apparel/'||d.image_path,'artwork',d.caption,'draft','Draft',d.title,d.caption,d.alt_text,
  array['HC Apparel','American Apparel','blank apparel','DTF printing','DTG printing'],
  'https://www.ilovehcapparel.net/ShopGarments','https://www.ilovehcapparel.net/ShopGarments?utm_source=facebook&utm_medium=organic_social&utm_campaign=american_apparel_blanks&utm_content='||d.id,
  d.scheduled_at,'America/New_York',jsonb_build_object('verified_at',now(),'artwork_style_labels',d.styles,'active_exact_catalog_matches',array['RF494'],'unmatched_artwork_style_labels',array['FTEX00','1302GD','13MLO','1301GD','RF498'],'destination_fallback','/ShopGarments','printing_quoted_separately',true,'schedule_proposed_only',true)
from drafts d cross join campaign c
on conflict (idempotency_key) do nothing;

with draft_requests(post_id,request_id) as (
  values
  ('31000000-0000-4000-8000-000000000001'::uuid,'51000000-0000-4000-8000-000000000001'::uuid),
  ('31000000-0000-4000-8000-000000000002','51000000-0000-4000-8000-000000000002'),
  ('31000000-0000-4000-8000-000000000003','51000000-0000-4000-8000-000000000003'),
  ('31000000-0000-4000-8000-000000000004','51000000-0000-4000-8000-000000000004'),
  ('31000000-0000-4000-8000-000000000005','51000000-0000-4000-8000-000000000005'),
  ('31000000-0000-4000-8000-000000000006','51000000-0000-4000-8000-000000000006')
)
insert into public.marketing_approval_requests(
  id,page_key,request_type,source_kind,source_material,proposed_content,image_url,context,content_version,content_hash,status,scheduled_at,linked_post_id,idempotency_key
)
select r.request_id,'hc_apparel','post','photo','Owner-supplied finished American Apparel campaign artwork.',p.post_description,p.image_url,
  jsonb_build_object('post_title',p.post_title,'destination_url',p.destination_url,'tracking_url',p.tracking_url,'proposed_posting_time',p.scheduled_at,'timezone','America/New_York','alt_text',p.alt_text,'hashtags',p.hashtags,'schedule_proposed_only',true),
  1,md5(concat_ws('|','hc_apparel','post',p.post_description,p.image_url,p.scheduled_at::text)),'pending',p.scheduled_at,p.id,r.request_id
from draft_requests r join public.social_studio_posts p on p.id=r.post_id
on conflict (idempotency_key) do nothing;

insert into public.marketing_approval_events(approval_request_id,content_version,event_type,details)
select id,content_version,'campaign_draft_imported',jsonb_build_object('schedule_proposed_only',true)
from public.marketing_approval_requests
where id::text like '51000000-0000-4000-8000-00000000000%'
  and not exists (select 1 from public.marketing_approval_events e where e.approval_request_id=marketing_approval_requests.id and e.event_type='campaign_draft_imported');

commit;
