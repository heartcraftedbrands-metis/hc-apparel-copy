begin;

with campaign as (
  select id from public.marketing_campaigns where campaign_key = 'hc_apparel_organic_launch' limit 1
), owner as (
  select id from auth.users where lower(email) = 'heartfamilyco@gmail.com' and email_confirmed_at is not null limit 1
), drafts(id,idempotency_key,title,caption,alt_text,image_path,scheduled_at,styles,product_ids,destination_url) as (
  values
  ('32000000-0000-4000-8000-000000000002'::uuid,'42000000-0000-4000-8000-000000000002'::uuid,'Your new go-to crew.',
   E'Looking for a heavyweight crewneck you can wear blank or customize for your next project? Check out the Champion Reverse Weave S149 in Fresh Olive.\n\nThe sweatshirt is sold blank. DTF or DTG printing is quoted separately after we review your artwork and placement.\n\nShop the S149: https://www.ilovehcapparel.net/ProductDetail?id=23211b89-753b-4e5e-86af-92bdcfa85752\n\n#HCApparel #Champion #ReverseWeave #CrewneckSweatshirt #CustomPrinting',
   'A model wearing a Fresh Olive heavyweight Champion crewneck beside the words “Your New Go-To Crew.”',
   'champion-s149-olive-crewneck.png','2026-11-12 09:00:00-05'::timestamptz,array['S149'],array['23211b89-753b-4e5e-86af-92bdcfa85752'::uuid],
   'https://www.ilovehcapparel.net/ProductDetail?id=23211b89-753b-4e5e-86af-92bdcfa85752'),
  ('32000000-0000-4000-8000-000000000004','42000000-0000-4000-8000-000000000004','Little sizes. Big ideas.',
   E'Big ideas come in youth sizes too. Start with the Independent Trading Co SS4001Y midweight hoodie or the PRM1500Y pigment-dyed hoodie.\n\nBoth are sold as blank garments. DTF or DTG printing is quoted separately after we review the garment, artwork, and placement.\n\nShop SS4001Y: https://www.ilovehcapparel.net/ProductDetail?id=686dd62f-b22d-4a36-a152-ae68a019a4e0\nShop PRM1500Y: https://www.ilovehcapparel.net/ProductDetail?id=36ae29a1-7848-495c-b089-d60014f459e2\n\n#HCApparel #YouthHoodies #IndependentTradingCo #DTFPrinting #DTGPrinting',
   'Two children modeling Independent Trading Co youth blank hoodies SS4001Y and PRM1500Y beside the words “Little Sizes. Big Ideas.”',
   'youth-hoodies.png','2026-11-19 09:00:00-05'::timestamptz,array['SS4001Y','PRM1500Y'],array['686dd62f-b22d-4a36-a152-ae68a019a4e0'::uuid,'36ae29a1-7848-495c-b089-d60014f459e2'::uuid],
   'https://www.ilovehcapparel.net/ProductDetail?id=686dd62f-b22d-4a36-a152-ae68a019a4e0'),
  ('32000000-0000-4000-8000-000000000005','42000000-0000-4000-8000-000000000005','Heavyweight hoodies. Your way.',
   E'Want a hoodie with more weight to it? Compare the Independent Trading Co IND330BLV Boulevard and IND420XD Mainstreet heavyweight hoodies for your next project.\n\nThese hoodies are sold blank. DTF or DTG printing is quoted separately after we review your artwork and garment choice.\n\nShop IND330BLV: https://www.ilovehcapparel.net/ProductDetail?id=9ff477ee-0c9c-4c5d-a430-8a9db6adf9ff\nShop IND420XD: https://www.ilovehcapparel.net/ProductDetail?id=f9d1c91d-31fc-4fbe-8516-99c2398f9239\n\n#HCApparel #HeavyweightHoodie #IndependentTradingCo #BlankApparel #CustomPrinting',
   'Two models wearing Independent Trading Co heavyweight blank hoodies IND330BLV and IND420XD beside “Heavyweight Hoodies. Your Way.”',
   'heavyweight-hoodies.png','2026-11-23 09:00:00-05'::timestamptz,array['IND330BLV','IND420XD'],array['9ff477ee-0c9c-4c5d-a430-8a9db6adf9ff'::uuid,'f9d1c91d-31fc-4fbe-8516-99c2398f9239'::uuid],
   'https://www.ilovehcapparel.net/ProductDetail?id=9ff477ee-0c9c-4c5d-a430-8a9db6adf9ff'),
  ('32000000-0000-4000-8000-000000000006','42000000-0000-4000-8000-000000000006','Your next go-to layer.',
   E'Like that lived-in garment-dyed look? Start with the Comfort Colors 1566L women’s mid-length crewneck or the 1567 unisex hoodie.\n\nBoth are sold as blank garments. DTF or DTG printing is quoted separately after we review your garment, artwork, and placement.\n\nShop 1566L: https://www.ilovehcapparel.net/ProductDetail?id=b927ab67-17cd-41d3-a3a6-4f05c5a0225b\nShop 1567: https://www.ilovehcapparel.net/ProductDetail?id=10e125c8-b3ef-431b-9975-45ef70ce546e\n\n#HCApparel #ComfortColors #GarmentDyed #Crewneck #Hoodie',
   'Two models wearing Comfort Colors garment-dyed blank sweatshirts 1566L and 1567 beside the words “Your Next Go-To Layer.”',
   'garment-dyed-sweatshirts.png','2026-11-26 09:00:00-05'::timestamptz,array['1566L','1567'],array['b927ab67-17cd-41d3-a3a6-4f05c5a0225b'::uuid,'10e125c8-b3ef-431b-9975-45ef70ce546e'::uuid],
   'https://www.ilovehcapparel.net/ProductDetail?id=b927ab67-17cd-41d3-a3a6-4f05c5a0225b')
)
insert into public.social_studio_posts(
  id,idempotency_key,created_by,campaign_id,platform,content_type,brand,product_name,tone,audience,caption_length,cta,
  include_hashtags,notes,image_url,image_mode,caption,status,workflow_status,post_title,post_description,alt_text,keywords,
  destination_url,tracking_url,scheduled_at,schedule_timezone,verification_snapshot
)
select d.id,d.idempotency_key,o.id,c.id,'facebook','Product Promo','HC Apparel',d.title,
  'natural, direct, friendly, and conversational','customers shopping blanks or planning custom printing','medium','Shop blank garments',
  true,'Owner-supplied finished artwork. Prepared for Codex conversation approval; not approved or scheduled.',
  'https://www.ilovehcapparel.net/marketing/campaigns/ss-advertised/'||d.image_path,'artwork',d.caption,'draft','Draft',d.title,d.caption,d.alt_text,
  array['HC Apparel','blank apparel','DTF printing','DTG printing'],d.destination_url,
  d.destination_url||'&utm_source=facebook&utm_medium=organic_social&utm_campaign=hc_apparel_organic_launch&utm_content='||d.id,
  d.scheduled_at,'America/New_York',jsonb_build_object('verified_at',now(),'verified_product_ids',d.product_ids,'verified_styles',d.styles,'printing_quoted_separately',true,'schedule_proposed_only',true,'approval_channel','codex_conversation')
from drafts d cross join campaign c cross join owner o
on conflict (idempotency_key) do nothing;

with draft_requests(post_id,request_id) as (
  values
  ('32000000-0000-4000-8000-000000000002'::uuid,'52000000-0000-4000-8000-000000000002'::uuid),
  ('32000000-0000-4000-8000-000000000004','52000000-0000-4000-8000-000000000004'),
  ('32000000-0000-4000-8000-000000000005','52000000-0000-4000-8000-000000000005'),
  ('32000000-0000-4000-8000-000000000006','52000000-0000-4000-8000-000000000006')
)
insert into public.marketing_approval_requests(
  id,page_key,request_type,source_kind,source_material,proposed_content,image_url,context,content_version,content_hash,status,scheduled_at,linked_post_id,idempotency_key,created_by
)
select r.request_id,'hc_apparel','post','photo','Owner-supplied finished HC Apparel campaign artwork.',p.post_description,p.image_url,
  jsonb_build_object('post_title',p.post_title,'destination_url',p.destination_url,'tracking_url',p.tracking_url,'proposed_posting_time',p.scheduled_at,'timezone','America/New_York','alt_text',p.alt_text,'schedule_proposed_only',true,'approval_channel','codex_conversation'),
  1,md5(concat_ws('|','hc_apparel','post',p.post_description,p.image_url,p.scheduled_at::text)),'pending',p.scheduled_at,p.id,r.request_id,p.created_by
from draft_requests r join public.social_studio_posts p on p.id=r.post_id
on conflict (idempotency_key) do nothing;

insert into public.marketing_approval_events(approval_request_id,content_version,event_type,details)
select id,content_version,'prepared_for_codex_review',jsonb_build_object('schedule_proposed_only',true,'approval_source','codex_conversation')
from public.marketing_approval_requests
where id::text like '52000000-0000-4000-8000-00000000000%'
  and not exists (select 1 from public.marketing_approval_events e where e.approval_request_id=marketing_approval_requests.id and e.event_type='prepared_for_codex_review');

commit;
