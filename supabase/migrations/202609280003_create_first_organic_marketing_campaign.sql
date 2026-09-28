begin;

alter table public.marketing_campaigns
  add column if not exists campaign_key text,
  add column if not exists channels text[] not null default '{}',
  add column if not exists analytics_reliable_since timestamptz;
create unique index if not exists marketing_campaigns_campaign_key_unique
  on public.marketing_campaigns(campaign_key) where campaign_key is not null;

alter table public.marketing_social_content
  drop constraint if exists marketing_social_content_platform_check;
alter table public.marketing_social_content
  add constraint marketing_social_content_platform_check check (platform in (
    'Facebook','Instagram','TikTok','Google Business','Email','SEO / GEO','Local Outreach'
  )),
  add column if not exists day_number integer check (day_number between 1 and 7),
  add column if not exists planned_date date,
  add column if not exists content_type text,
  add column if not exists headline text,
  add column if not exists cta text,
  add column if not exists product_name text,
  add column if not exists product_url text,
  add column if not exists tracking_url text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content text;
create unique index if not exists marketing_social_content_campaign_piece_unique
  on public.marketing_social_content(campaign_id, day_number, platform, headline);

create or replace function public.log_marketing_event_v2(
  p_event_name text,
  p_product_id text default null,
  p_product_name text default null,
  p_source text default null,
  p_path text default null,
  p_attribution jsonb default '{}'::jsonb,
  p_dedupe_key text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare v_attribution jsonb;
begin
  if p_event_name not in ('page_view','product_view','brand_view','category_view','account_signup','login','add_to_cart','remove_from_cart','checkout_started','shipping_quote_success','payment_method_selected','email_subscribed','sale_promo_clicked','search_used','track_order_used') then return; end if;
  if not coalesce((select internal_analytics_enabled from public.marketing_settings where id = true), false) then return; end if;
  v_attribution := jsonb_strip_nulls(jsonb_build_object(
    'utm_source', nullif(left(p_attribution ->> 'utm_source', 80), ''),
    'utm_medium', nullif(left(p_attribution ->> 'utm_medium', 80), ''),
    'utm_campaign', nullif(left(p_attribution ->> 'utm_campaign', 120), ''),
    'utm_content', nullif(left(p_attribution ->> 'utm_content', 120), '')
  ));
  insert into public.marketing_events(event_name, product_id, product_name, source, path, metadata, dedupe_key)
  values (p_event_name, left(p_product_id,100), left(p_product_name,180), left(p_source,80), left(p_path,500), v_attribution, nullif(left(p_dedupe_key,200),''))
  on conflict (dedupe_key) do update set metadata = excluded.metadata, path = excluded.path;
end;
$$;
revoke all on function public.log_marketing_event_v2(text,text,text,text,text,jsonb,text) from public;
grant execute on function public.log_marketing_event_v2(text,text,text,text,text,jsonb,text) to anon, authenticated;

create or replace function public.attribute_marketing_purchase(p_order_id text, p_attribution jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_attribution jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.orders where id = p_order_id and owner_user_id = auth.uid() and payment_status = 'paid' and is_sample = false
  ) then return; end if;
  v_attribution := jsonb_strip_nulls(jsonb_build_object(
    'utm_source', nullif(left(p_attribution ->> 'utm_source',80),''),
    'utm_medium', nullif(left(p_attribution ->> 'utm_medium',80),''),
    'utm_campaign', nullif(left(p_attribution ->> 'utm_campaign',120),''),
    'utm_content', nullif(left(p_attribution ->> 'utm_content',120),'')
  ));
  insert into public.marketing_events(event_name, source, metadata, dedupe_key)
  values ('purchase_completed','orders',v_attribution,'purchase_completed:' || p_order_id::text)
  on conflict (dedupe_key) do update set metadata = excluded.metadata;
end;
$$;
revoke all on function public.attribute_marketing_purchase(text,jsonb) from public;
grant execute on function public.attribute_marketing_purchase(text,jsonb) to authenticated;

insert into public.marketing_campaigns(campaign,campaign_key,channel,channels,start_date,goal,status,budget,analytics_reliable_since)
values (
  'HC Apparel Organic Launch','hc_apparel_organic_launch','Organic',
  array['Google Business Profile','Facebook','Instagram','TikTok / Reels','Email','SEO / GEO','Local Outreach'],
  '2026-09-28',
  'Generate the first consistent stream of qualified website traffic, account signups, product interest, quote requests, and purchases using organic channels only.',
  'Active',0,'2026-09-28 12:23:15+00'
)
on conflict (campaign_key) where campaign_key is not null do update set
  campaign=excluded.campaign, channel=excluded.channel, channels=excluded.channels,
  goal=excluded.goal, status='Active', budget=0, analytics_reliable_since=excluded.analytics_reliable_since;

with campaign as (select id from public.marketing_campaigns where campaign_key='hc_apparel_organic_launch'), drafts(day_number,planned_date,platform,content_type,headline,caption,cta,product_id,product_name,product_url,hashtags,utm_source,utm_medium,utm_content) as (values
  (1,'2026-09-28'::date,'Facebook','Launch Post','Affordable Apparel Blanks for Brands, Teams & Creators',$$HC Apparel makes it easier to find affordable apparel blanks for your brand, team, organization, event, or next creative project. Explore dependable styles from trusted brands, shop current product options, or start a custom-printing order when you are ready.$$,'Shop Garments',null,null,'https://www.ilovehcapparel.net/ShopGarments','#HCApparel #ApparelBlanks #SmallBusiness #TeamApparel','facebook','organic_social','day1_launch_facebook'),
  (1,'2026-09-28','Instagram','Launch Post','Affordable Apparel Blanks for Brands, Teams & Creators',$$Meet HC Apparel: blank apparel for brands, teams, businesses, creators, and events. Browse tees, polos, hoodies, outerwear, and more—then add custom printing when your project needs it.$$,'Explore HC Apparel',null,null,'https://www.ilovehcapparel.net/ShopGarments','#HCApparel #BlankApparel #BrandBuilder #TeamWear #Creators','instagram','organic_social','day1_launch_instagram'),
  (1,'2026-09-28','TikTok','Short Video Concept','From blank to brand-ready',$$Video concept: quick cuts of tees, polos, hoodies, and outerwear followed by artwork upload and custom-printing screens. On-screen text: “Blanks for brands, teams & creators.” End with the HC Apparel storefront and a clear explore CTA.$$,'Visit HC Apparel',null,null,'https://www.ilovehcapparel.net/ShopGarments','#HCApparel #BlankApparel #SmallBusinessTikTok #TeamApparel','tiktok','organic_video','day1_launch_tiktok'),
  (1,'2026-09-28','Google Business','Business Update','Affordable apparel blanks and custom printing',$$HC Apparel helps brands, teams, businesses, creators, and event organizers source affordable apparel blanks with optional custom printing. Browse garments online or request help with a larger project.$$,'Visit website',null,null,'https://www.ilovehcapparel.net/','#HCApparel #CustomPrinting','google_business','organic','day1_launch_google_business'),
  (1,'2026-09-28','Email','Email Draft','Welcome to HC Apparel',$$Welcome to HC Apparel—your source for apparel blanks, custom printing support, and bulk-order help for brands, teams, businesses, and creators. This is a draft only and requires approval before sending.$$,'Shop Garments',null,null,'https://www.ilovehcapparel.net/ShopGarments','#HCApparel','email','organic_email','day1_launch_email'),
  (2,'2026-09-29','Facebook','Product Post','Current S&S Sale Pick: Columbia Trail Shaker Beanie',$$A current S&S sale pick is live at HC Apparel: the Columbia Trail Shaker Beanie, available while supplies last. HC Apparel customer price: $16.12. Verify the live sale carousel before approving this draft.$$,'Shop This Sale Pick','81e0e087-f135-4773-aa1c-c88148d6c07c','Columbia Trail Shaker Beanie','https://www.ilovehcapparel.net/ProductDetail?id=81e0e087-f135-4773-aa1c-c88148d6c07c','#HCApparel #Columbia #SalePick #BlankApparel','facebook','organic_social','day2_sale_pick_facebook'),
  (2,'2026-09-29','TikTok','Short Video Concept','Three current S&S sale picks',$$Video concept: show the live Columbia Trail Shaker Beanie, Women’s Sucker for Summer Half-Zip Pullover, and Men’s Ascender II Soft Shell Vest. Put “current S&S sale picks—while supplies last” on screen. Recheck live status before approval.$$,'View Current Sale Picks','81e0e087-f135-4773-aa1c-c88148d6c07c','Columbia Trail Shaker Beanie','https://www.ilovehcapparel.net/','#HCApparel #SSActivewear #Columbia #SaleFinds','tiktok','organic_video','day2_sale_picks_tiktok'),
  (2,'2026-09-29','Google Business','Product Update','Current Columbia sale pick',$$The Columbia Trail Shaker Beanie is currently featured in HC Apparel’s live S&S Sale Picks at a customer price of $16.12 while supplies last. Verify the promotion is still live before publishing.$$,'View Product','81e0e087-f135-4773-aa1c-c88148d6c07c','Columbia Trail Shaker Beanie','https://www.ilovehcapparel.net/ProductDetail?id=81e0e087-f135-4773-aa1c-c88148d6c07c','#HCApparel #Columbia','google_business','organic','day2_sale_pick_google_business'),
  (3,'2026-09-30','Instagram','Product Spotlight','adidas Performance Polo Spotlight',$$A clean performance polo for teams, staff, events, and business apparel. The adidas Men’s Performance Polo uses lightweight recycled polyester with a hydrophilic finish and a classic three-button placket. HC Apparel customer price: $29.43.$$,'View the adidas Polo','54dfcc92-e838-4ef0-8186-9e143e10f49c','adidas Men’s Performance Polo','https://www.ilovehcapparel.net/ProductDetail?id=54dfcc92-e838-4ef0-8186-9e143e10f49c','#HCApparel #adidas #PerformancePolo #BusinessApparel #TeamWear','instagram','organic_social','day3_adidas_a230'),
  (4,'2026-10-01','Facebook','Service Spotlight','Bring your apparel idea to life',$$Start with apparel blanks, upload your artwork, and use HC Apparel custom printing for business uniforms, teams, events, organizations, creator merchandise, and family projects.$$,'Start Your Order / Custom Printing',null,null,'https://www.ilovehcapparel.net/CustomPrinting','#HCApparel #CustomPrinting #TeamShirts #BusinessApparel','facebook','organic_social','day4_custom_printing'),
  (5,'2026-10-02','Instagram','Category Spotlight','Business apparel that works with your team',$$Build a polished team look with polos, quarter-zips, and outerwear. The adidas Men’s Performance Piqué Polo offers recycled polyester piqué, a hydrophilic finish, and a clean three-button design. HC Apparel customer price: $29.92.$$,'Shop Business Apparel','3b68d8cb-6cbe-4456-9125-e90ed8715e0f','adidas Men’s Performance Piqué Polo','https://www.ilovehcapparel.net/ProductDetail?id=3b68d8cb-6cbe-4456-9125-e90ed8715e0f','#HCApparel #BusinessApparel #StaffUniforms #adidas #TeamWear','instagram','organic_social','day5_business_apparel'),
  (6,'2026-10-03','TikTok','Educational Video','How to choose the right blank shirt for your brand',$$Teach three checks: fabric and weight for the intended use, fit and size range for the audience, and decoration compatibility for the artwork. Compare options based on the project instead of assuming one blank fits every brand.$$,'Browse Blank Apparel',null,null,'https://www.ilovehcapparel.net/ShopGarments','#HCApparel #BlankApparel #BrandTips #ApparelEducation','tiktok','organic_video','day6_blank_shirt_education'),
  (6,'2026-10-03','SEO / GEO','Educational Content Brief','How to choose the right blank shirt for your brand',$$Draft a useful website article covering fabric weight, cotton versus blends, fit, color range, size availability, print method, order quantity, and intended use. Do not make unsupported product claims.$$,'Explore T-Shirts',null,null,'https://www.ilovehcapparel.net/ShopGarments?category=t_shirts','#HCApparel #BlankShirts','seo_geo','organic_content','day6_blank_shirt_guide'),
  (7,'2026-10-04','Facebook','Community Outreach','Apparel help for local groups and businesses',$$HC Apparel supports small businesses, churches, schools, sports teams, family reunions, contractors, cleaning companies, creators, and local organizations with apparel blanks, custom-printing options, and bulk-order help.$$,'Request a Quote',null,null,'https://www.ilovehcapparel.net/RequestQuote','#HCApparel #LocalBusiness #CommunityOrganizations #TeamApparel','facebook','organic_social','day7_local_outreach'),
  (7,'2026-10-04','Local Outreach','Outreach Checklist','Begin genuine local outreach',$$Build a permission-based prospect list by category: schools, churches, sports teams, family reunions, landscapers, contractors, cleaning companies, local businesses, creators, and event organizers. Personalize outreach; do not scrape or spam.$$,'Request a Quote',null,null,'https://www.ilovehcapparel.net/RequestQuote','#HCApparel #LocalOutreach','local_outreach','organic_outreach','day7_outreach_checklist')
)
insert into public.marketing_social_content(campaign_id,day_number,planned_date,platform,content_type,headline,caption,cta,product_id,product_name,product_url,tracking_url,hashtags,status,utm_source,utm_medium,utm_campaign,utm_content)
select campaign.id,d.day_number,d.planned_date,d.platform,d.content_type,d.headline,d.caption,d.cta,d.product_id,d.product_name,d.product_url,
  d.product_url || case when position('?' in d.product_url)>0 then '&' else '?' end ||
  'utm_source='||d.utm_source||'&utm_medium='||d.utm_medium||'&utm_campaign=hc_apparel_organic_launch&utm_content='||d.utm_content,
  d.hashtags,'Draft',d.utm_source,d.utm_medium,'hc_apparel_organic_launch',d.utm_content
from campaign cross join drafts d
on conflict (campaign_id,day_number,platform,headline) do update set
  caption=excluded.caption,cta=excluded.cta,product_id=excluded.product_id,product_name=excluded.product_name,
  product_url=excluded.product_url,tracking_url=excluded.tracking_url,hashtags=excluded.hashtags,status='Draft',planned_date=excluded.planned_date;

insert into public.marketing_tasks(title,channel,why_it_matters,assigned_to,priority,status,due_date,notes,action_type,is_seed) values
('Organic Launch: Complete Google Business Profile','Google Business Profile','Makes HC Apparel easier to discover and trust locally.','King Terik','High','To Do','2026-09-28','Campaign: HC Apparel Organic Launch','Organic Launch',false),
('Organic Launch: Create Facebook profile/page','Facebook','Creates a home for launch posts and community engagement.','YHO / Mario','High','To Do','2026-09-28','Campaign: HC Apparel Organic Launch','Organic Launch',false),
('Organic Launch: Create Instagram profile','Instagram','Supports visual product and brand discovery.','YHO / Mario','High','To Do','2026-09-28','Campaign: HC Apparel Organic Launch','Organic Launch',false),
('Organic Launch: Reserve TikTok username','TikTok / Reels','Secures consistent naming before short-form posting begins.','YHO / Mario','Medium','To Do','2026-09-28','Campaign: HC Apparel Organic Launch','Organic Launch',false),
('Organic Launch: Publish launch post','Facebook','Introduces HC Apparel and its customer use cases.','King Terik','High','To Do','2026-09-28','Review drafts first; no automatic publishing.','Organic Launch',false),
('Organic Launch: Publish S&S Sale Pick','Facebook','Uses a real current sale item to create timely product interest.','YHO / Mario','High','To Do','2026-09-29','Reverify current sale status before publishing.','Organic Launch',false),
('Organic Launch: Publish Adidas spotlight','Instagram','Highlights a strong live business and team apparel product.','YHO / Mario','High','To Do','2026-09-30','Review A230 price and availability before publishing.','Organic Launch',false),
('Organic Launch: Publish Custom Printing post','Facebook','Connects apparel browsing to custom-order intent.','King Terik','High','To Do','2026-10-01','Draft only until approved.','Organic Launch',false),
('Organic Launch: Publish Business Apparel post','Instagram','Targets teams and organizations needing polished apparel.','YHO / Mario','Medium','To Do','2026-10-02','Draft only until approved.','Organic Launch',false),
('Organic Launch: Publish educational post','SEO / GEO','Builds useful search-friendly content without paid spend.','King Terik','Medium','To Do','2026-10-03','Review product claims before publishing.','Organic Launch',false),
('Organic Launch: Begin local outreach','Local Outreach','Starts genuine relationship-based prospecting without scraping or spam.','King Terik','High','To Do','2026-10-04','Use permission-based, personalized outreach only.','Organic Launch',false)
on conflict (title) do update set due_date=excluded.due_date,notes=excluded.notes,status='To Do';

insert into public.marketing_email_campaigns(campaign_name,campaign_type,subject,preview_text,audience,status,scheduled_date)
select 'HC Apparel Organic Launch — Welcome','Welcome','Welcome to HC Apparel','Affordable apparel blanks, custom printing, and bulk-order help.','Consented subscribers','Draft','2026-09-28 14:00:00+00'
where not exists (select 1 from public.marketing_email_campaigns where campaign_name='HC Apparel Organic Launch — Welcome');

commit;
