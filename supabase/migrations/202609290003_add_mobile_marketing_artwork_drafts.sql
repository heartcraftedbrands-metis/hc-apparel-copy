begin;

alter table public.marketing_social_content
  add column if not exists image_alt_text text,
  add column if not exists media_storage_path text;

-- Google Business is approved, but remains a separately managed organic channel.
update public.marketing_social_accounts
set status='Active', notes='Approved Google Business Profile. Content remains manually managed; no direct publishing connection is claimed.'
where platform='Google Business';

update public.marketing_google_business_items
set completed=true, notes='Profile approval confirmed by Super Admin.', updated_at=now()
where item='Verification complete';

-- Reuse an exact campaign piece when it already exists. These keys are stable so
-- rerunning the migration cannot create duplicate artwork drafts.
with launch as (
  select id from public.marketing_campaigns where campaign_key='hc_apparel_organic_launch'
), pieces(day_number,planned_date,platform,headline,caption,cta,product_name,product_url,tracking_url,hashtags,utm_source,utm_content,image_url,image_alt_text,format,dimensions,account_handle,account_url) as (values
  (1,'2026-09-30'::date,'Pinterest','Puffers & Insulated Outerwear for Cooler Days',
   'Explore puffers, insulated vests, and other outerwear for cooler days, everyday layering, teams, and work. Browse the current HC Apparel outerwear collection for live styles and availability.',
   'Shop Outerwear','Puffers & Insulated Outerwear','https://www.ilovehcapparel.net/ShopGarments?type=outerwear',
   'https://www.ilovehcapparel.net/ShopGarments?type=outerwear&utm_source=pinterest&utm_medium=organic_social&utm_campaign=hc_apparel_organic_launch&utm_content=outerwear_puffers_pinterest',
   '#PufferVest #InsulatedOuterwear #OuterwearStyle #HCApparel','pinterest','outerwear_puffers_pinterest',
   'https://www.ilovehcapparel.net/marketing/hc-apparel-organic-launch/puffers-insulated.jpg',
   'HC Apparel Puffers & Insulated graphic showing a seated model wearing a blue insulated vest over a white sweatshirt, with the HC Apparel website and garment style details.',
   'Pinterest portrait pin','995 × 1280 px · preserve complete artwork',null,null),
  (1,'2026-09-30'::date,'X','Puffers & Insulated Outerwear',
   'Cooler days call for a dependable layer. Browse puffers, insulated vests, and more in HC Apparel’s live outerwear collection.',
   'Shop Outerwear','Puffers & Insulated Outerwear','https://www.ilovehcapparel.net/ShopGarments?type=outerwear',
   'https://www.ilovehcapparel.net/ShopGarments?type=outerwear&utm_source=x&utm_medium=organic_social&utm_campaign=hc_apparel_organic_launch&utm_content=outerwear_puffers_x',
   '#Outerwear #PufferVest #HCApparel','x','outerwear_puffers_x',
   'https://www.ilovehcapparel.net/marketing/hc-apparel-organic-launch/puffers-insulated.jpg',
   'HC Apparel Puffers & Insulated graphic showing a seated model wearing a blue insulated vest over a white sweatshirt, with the HC Apparel website and garment style details.',
   'X image post','995 × 1280 px · preserve complete artwork','@ilovehcapparel','https://x.com/ilovehcapparel'),
  (2,'2026-10-01'::date,'Pinterest','Rain Jackets and Lightweight Outerwear',
   'Browse current rain jackets and lightweight outerwear for workdays, teams, travel, and everyday layering. Visit HC Apparel to review live styles and availability.',
   'Shop Outerwear','Rain Jackets','https://www.ilovehcapparel.net/ShopGarments?type=outerwear',
   'https://www.ilovehcapparel.net/ShopGarments?type=outerwear&utm_source=pinterest&utm_medium=organic_social&utm_campaign=hc_apparel_organic_launch&utm_content=outerwear_rain_jackets_pinterest',
   '#RainJacket #LightweightOuterwear #Workwear #HCApparel','pinterest','outerwear_rain_jackets_pinterest',
   'https://www.ilovehcapparel.net/marketing/hc-apparel-organic-launch/rain-jackets.jpg',
   'HC Apparel Rain Jackets graphic showing a model wearing a black Columbia rain jacket, plus a decoration tip, website address, and garment style details.',
   'Pinterest portrait pin','1009 × 1280 px · preserve complete artwork',null,null),
  (2,'2026-10-01'::date,'X','Rain Jackets for Work and Everyday Wear',
   'Looking for a practical outer layer? Browse current rain jackets and lightweight outerwear at HC Apparel.',
   'Shop Outerwear','Rain Jackets','https://www.ilovehcapparel.net/ShopGarments?type=outerwear',
   'https://www.ilovehcapparel.net/ShopGarments?type=outerwear&utm_source=x&utm_medium=organic_social&utm_campaign=hc_apparel_organic_launch&utm_content=outerwear_rain_jackets_x',
   '#RainJacket #Outerwear #HCApparel','x','outerwear_rain_jackets_x',
   'https://www.ilovehcapparel.net/marketing/hc-apparel-organic-launch/rain-jackets.jpg',
   'HC Apparel Rain Jackets graphic showing a model wearing a black Columbia rain jacket, plus a decoration tip, website address, and garment style details.',
   'X image post','1009 × 1280 px · preserve complete artwork','@ilovehcapparel','https://x.com/ilovehcapparel'),
  (3,'2026-10-02'::date,'Pinterest','Outerwear for Warmth, Work and Everyday Wear',
   'Compare puffers, insulated layers, workwear jackets, and more for cooler weather and demanding workdays. Browse HC Apparel’s current outerwear collection before choosing your next layer.',
   'Shop All Outerwear','Outerwear Overview','https://www.ilovehcapparel.net/ShopGarments?type=outerwear',
   'https://www.ilovehcapparel.net/ShopGarments?type=outerwear&utm_source=pinterest&utm_medium=organic_social&utm_campaign=hc_apparel_organic_launch&utm_content=outerwear_overview_pinterest',
   '#Outerwear #Workwear #InsulatedJacket #HCApparel','pinterest','outerwear_overview_pinterest',
   'https://www.ilovehcapparel.net/marketing/hc-apparel-organic-launch/outerwear-overview.jpg',
   'HC Apparel outerwear overview graphic featuring fabric and website artwork above side-by-side Puffers & Insulated and Workwear sections with two models.',
   'Pinterest portrait pin','1000 × 1280 px · preserve complete artwork',null,null),
  (3,'2026-10-02'::date,'X','Outerwear for Warmth and Work',
   'From insulated layers to durable workwear, find the outerwear that fits the job and the season at HC Apparel.',
   'Shop All Outerwear','Outerwear Overview','https://www.ilovehcapparel.net/ShopGarments?type=outerwear',
   'https://www.ilovehcapparel.net/ShopGarments?type=outerwear&utm_source=x&utm_medium=organic_social&utm_campaign=hc_apparel_organic_launch&utm_content=outerwear_overview_x',
   '#Outerwear #Workwear #HCApparel','x','outerwear_overview_x',
   'https://www.ilovehcapparel.net/marketing/hc-apparel-organic-launch/outerwear-overview.jpg',
   'HC Apparel outerwear overview graphic featuring fabric and website artwork above side-by-side Puffers & Insulated and Workwear sections with two models.',
   'X image post','1000 × 1280 px · preserve complete artwork','@ilovehcapparel','https://x.com/ilovehcapparel')
), updated as (
  update public.marketing_social_content content set
    day_number=pieces.day_number, planned_date=pieces.planned_date, platform=pieces.platform,
    content_type='Finished Artwork', headline=pieces.headline, caption=pieces.caption,
    short_caption=pieces.caption, cta=pieces.cta, product_name=pieces.product_name,
    product_url=pieces.product_url, product_link=pieces.product_url, tracking_url=pieces.tracking_url,
    hashtags=pieces.hashtags, status='Draft', utm_source=pieces.utm_source,
    utm_medium='organic_social', utm_campaign='hc_apparel_organic_launch', utm_content=pieces.utm_content,
    recommended_image_url=pieces.image_url, image_alt_text=pieces.image_alt_text,
    image_video_concept='Use the finished Super Admin artwork exactly as provided. Do not crop, stretch, overlay, or alter it.',
    recommended_format=pieces.format, recommended_dimensions=pieces.dimensions,
    assigned_to='King Terik', account_handle=pieces.account_handle,
    account_profile_url=pieces.account_url, active_schedule=true, media_selected=true,
    link_verified=true, utm_link_verified=true, caption_reviewed=false, cta_reviewed=false,
    sale_validation_status='Outerwear category link verified against the live Shop Garments route. No price, discount, or inventory claim is included.',
    updated_at=now()
  from launch, pieces
  where content.campaign_id=launch.id
    and (content.utm_content=pieces.utm_content or (content.platform=pieces.platform and content.headline=pieces.headline))
  returning content.id
)
insert into public.marketing_social_content(
  campaign_id,day_number,planned_date,platform,content_type,headline,caption,short_caption,cta,
  product_name,product_url,product_link,tracking_url,hashtags,status,utm_source,utm_medium,utm_campaign,utm_content,
  recommended_image_url,image_alt_text,image_video_concept,recommended_format,recommended_dimensions,assigned_to,
  account_handle,account_profile_url,active_schedule,media_selected,link_verified,utm_link_verified,caption_reviewed,cta_reviewed,sale_validation_status
)
select launch.id,pieces.day_number,pieces.planned_date,pieces.platform,'Finished Artwork',pieces.headline,pieces.caption,pieces.caption,pieces.cta,
  pieces.product_name,pieces.product_url,pieces.product_url,pieces.tracking_url,pieces.hashtags,'Draft',pieces.utm_source,'organic_social','hc_apparel_organic_launch',pieces.utm_content,
  pieces.image_url,pieces.image_alt_text,'Use the finished Super Admin artwork exactly as provided. Do not crop, stretch, overlay, or alter it.',pieces.format,pieces.dimensions,'King Terik',
  pieces.account_handle,pieces.account_url,true,true,true,true,false,false,'Outerwear category link verified against the live Shop Garments route. No price, discount, or inventory claim is included.'
from launch cross join pieces
where not exists (
  select 1 from public.marketing_social_content content
  where content.campaign_id=launch.id
    and (content.utm_content=pieces.utm_content or (content.platform=pieces.platform and content.headline=pieces.headline))
);

commit;
