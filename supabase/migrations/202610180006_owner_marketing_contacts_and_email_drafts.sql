begin;
alter table public.newsletter_subscribers
  add column if not exists marketing_tags text[] not null default '{}',
  add column if not exists owner_provided_at timestamptz;
create table if not exists public.ops_marketing_contacts (
  subscriber_id text primary key references public.newsletter_subscribers(id) on delete cascade,
  email text not null,
  display_name text,
  source text not null,
  tags text[] not null default '{}',
  consent_status text not null,
  provider_sync_status text not null,
  updated_at timestamptz not null default now()
);
alter table public.ops_marketing_contacts enable row level security;
drop policy if exists ops_marketing_contacts_admin on public.ops_marketing_contacts;
create policy ops_marketing_contacts_admin on public.ops_marketing_contacts for select to authenticated using (public.is_admin());
revoke all on public.ops_marketing_contacts from anon,authenticated;
grant select on public.ops_marketing_contacts to authenticated;
grant all on public.ops_marketing_contacts to service_role;
with supplied(email,display_name) as (values
  ('fatwellemail@gmail.com',null),('peakamber@gmail.com',null),('pastorscott504@me.com',null),
  ('vincentwashington1@gmail.com',null),('jayates@xiiiunited.com',null),
  ('danielle.alexis24689@gmail.com',null),('jackiejenkinsjr@gmail.com','Jackie Jenkins Jr'),
  ('chandre.sorrells@yahoo.com',null),('meagancotter@hotmail.com','Meagan'),
  ('aliciaboyd2012@gmail.com','Alicia Boyd'),('starlister808@yahoo.com','Star Lister'),
  ('lbierria@gmail.com',null),('enjidaggs@gmail.com',null),('eandadesignz@gmail.com','Rhonda Whitely')
)
insert into public.newsletter_subscribers(
  email,first_name,interests,source,consent_status,consent_at,is_active,
  brevo_sync_status,brevo_last_error,marketing_tags,owner_provided_at,is_sample
)
select lower(s.email),s.display_name,array['HC Apparel Marketing'],'owner-provided',
  'pending_owner_provided',null,false,'pending_consent',null,array['HC Apparel Marketing'],now(),false
from supplied s
where not exists (
  select 1 from public.newsletter_subscribers n where lower(n.email)=lower(s.email)
);
with supplied(email,display_name) as (values
  ('fatwellemail@gmail.com',null),('peakamber@gmail.com',null),('pastorscott504@me.com',null),
  ('vincentwashington1@gmail.com',null),('jayates@xiiiunited.com',null),
  ('danielle.alexis24689@gmail.com',null),('jackiejenkinsjr@gmail.com','Jackie Jenkins Jr'),
  ('chandre.sorrells@yahoo.com',null),('meagancotter@hotmail.com','Meagan'),
  ('aliciaboyd2012@gmail.com','Alicia Boyd'),('starlister808@yahoo.com','Star Lister'),
  ('lbierria@gmail.com',null),('enjidaggs@gmail.com',null),('eandadesignz@gmail.com','Rhonda Whitely')
)
update public.newsletter_subscribers n set
  first_name=case when nullif(btrim(n.first_name),'') is null then s.display_name else n.first_name end,
  interests=(select array_agg(distinct value) from unnest(coalesce(n.interests,'{}')||array['HC Apparel Marketing']) value),
  marketing_tags=(select array_agg(distinct value) from unnest(coalesce(n.marketing_tags,'{}')||array['HC Apparel Marketing']) value),
  owner_provided_at=coalesce(n.owner_provided_at,now()),
  updated_date=now()
from supplied s
where lower(n.email)=lower(s.email);
insert into public.ops_marketing_contacts(subscriber_id,email,display_name,source,tags,consent_status,provider_sync_status)
select n.id,n.email,n.first_name,'owner-provided',n.marketing_tags,n.consent_status,n.brevo_sync_status
from public.newsletter_subscribers n
where n.owner_provided_at is not null
on conflict(subscriber_id) do update set
  email=excluded.email,display_name=excluded.display_name,tags=excluded.tags,
  consent_status=excluded.consent_status,provider_sync_status=excluded.provider_sync_status,updated_at=now();
alter table public.marketing_email_campaigns
  add column if not exists image_url text,
  add column if not exists image_alt_text text,
  add column if not exists html_body text,
  add column if not exists text_body text,
  add column if not exists audience_key text,
  add column if not exists eligible_recipient_count integer,
  add column if not exists timezone text not null default 'America/New_York',
  add column if not exists approval_source text,
  add column if not exists approval_source_reference text,
  add column if not exists content_version integer not null default 1,
  add column if not exists content_hash text,
  add column if not exists provider_campaign_id text,
  add column if not exists provider_status text,
  add column if not exists idempotency_key text;
create unique index if not exists marketing_email_campaigns_idempotency_key_unique
  on public.marketing_email_campaigns(idempotency_key) where idempotency_key is not null;
with drafts(idempotency_key,campaign_name,subject,preview_text,body,cta,destination,image_url,image_alt,scheduled_at) as (values
  ('email:champion-s149:2026-10-27','Fresh Olive, ready for your next idea','A heavyweight Champion crewneck for your next project','Start with a Champion classic',
   'Champion S149 in Fresh Olive is a heavyweight blank you can wear as-is or use as the starting point for a custom project. Buy the blank now, or send us your artwork when you are ready for a separate DTF or DTG printing quote.',
   'Shop Champion S149','https://www.ilovehcapparel.net/ProductDetail?id=23211b89-753b-4e5e-86af-92bdcfa85752','https://www.ilovehcapparel.net/marketing/campaigns/ss-advertised/champion-s149-olive-crewneck.png','Model wearing a Fresh Olive Champion S149 heavyweight crewneck.','2026-10-27 10:00:00-04'::timestamptz),
  ('email:youth-hoodies:2026-11-10','Big ideas come in youth sizes too','Two youth hoodie blanks ready for their next design','Two hoodies, plenty of possibilities',
   'Take a look at the Independent Trading Co SS4001Y midweight hoodie and PRM1500Y pigment-dyed hoodie. Both are sold as blank garments. DTF or DTG printing is quoted separately after we review the garment, artwork, and placement.',
   'Shop Youth Hoodies','https://www.ilovehcapparel.net/ProductDetail?id=686dd62f-b22d-4a36-a152-ae68a019a4e0','https://www.ilovehcapparel.net/marketing/campaigns/ss-advertised/youth-hoodies.png','Two children modeling Independent Trading Co youth hoodies SS4001Y and PRM1500Y.','2026-11-10 10:00:00-05'::timestamptz),
  ('email:heavyweight-hoodies:2026-11-24','Looking for a hoodie with more weight?','Compare two heavyweight hoodie blanks from Independent Trading Co','Heavyweight hoodies, your way',
   'Compare the IND330BLV Boulevard and IND420XD Mainstreet heavyweight hoodies for your next project. Purchase the blank garment separately, then request a DTF or DTG printing quote when your artwork is ready.',
   'Compare Heavyweight Hoodies','https://www.ilovehcapparel.net/ProductDetail?id=9ff477ee-0c9c-4c5d-a430-8a9db6adf9ff','https://www.ilovehcapparel.net/marketing/campaigns/ss-advertised/heavyweight-hoodies.png','Two models wearing Independent Trading Co heavyweight hoodies IND330BLV and IND420XD.','2026-11-24 10:00:00-05'::timestamptz),
  ('email:garment-dyed:2026-12-08','That lived-in look starts here','Meet two garment-dyed sweatshirt blanks from Comfort Colors','Your next go-to layer',
   'Start with the Comfort Colors 1566L women’s mid-length crewneck or the 1567 unisex hoodie. Both are sold as blank garments. Custom DTF or DTG printing is quoted separately after we review your garment, artwork, and placement.',
   'Shop Garment-Dyed Sweatshirts','https://www.ilovehcapparel.net/ProductDetail?id=b927ab67-17cd-41d3-a3a6-4f05c5a0225b','https://www.ilovehcapparel.net/marketing/campaigns/ss-advertised/garment-dyed-sweatshirts.png','Two models wearing Comfort Colors garment-dyed sweatshirts 1566L and 1567.','2026-12-08 10:00:00-05'::timestamptz)
)
insert into public.marketing_email_campaigns(
  campaign_name,campaign_type,subject,preview_text,audience,status,scheduled_date,heading,body,
  cta_button_copy,destination_url,tracking_url,image_url,image_alt_text,text_body,audience_key,
  eligible_recipient_count,timezone,content_version,content_hash,idempotency_key,provider_status
)
select d.campaign_name,'New Products',d.subject,d.preview_text,'Confirmed HC Apparel marketing subscribers','Draft',d.scheduled_at,
  d.campaign_name,d.body,d.cta,d.destination,
  d.destination||'&utm_source=email&utm_medium=organic_email&utm_campaign=hc_apparel_ads&utm_content='||replace(d.idempotency_key,':','_'),
  d.image_url,d.image_alt,d.campaign_name||E'\n\n'||d.body||E'\n\n'||d.cta||': '||d.destination,
  'hc_apparel_marketing_consented',
  (select count(*) from public.newsletter_subscribers where is_sample=false and is_active=true and consent_status='consented' and brevo_sync_status='synced'),
  'America/New_York',1,md5(concat_ws('|',d.subject,d.preview_text,d.body,d.destination,d.image_url,d.scheduled_at::text)),d.idempotency_key,'draft_only'
from drafts d
on conflict do nothing;
commit;
