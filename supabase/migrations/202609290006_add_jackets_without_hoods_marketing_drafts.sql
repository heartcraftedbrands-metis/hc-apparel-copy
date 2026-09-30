begin;

-- The supplied artwork references Berne CH416, which is not currently public
-- in the HC Apparel catalog. Link to the verified live outerwear collection and
-- avoid product-specific availability, price, discount, or decoration claims.
with launch as (
  select id from public.marketing_campaigns
  where campaign_key='hc_apparel_organic_launch'
), pieces(day_number,planned_date,platform,headline,caption,short_caption,cta,product_name,product_url,tracking_url,hashtags,utm_source,utm_content,image_alt_text,format,account_handle,account_url,video_hook) as (values
  (7,'2026-10-05'::date,'TikTok','Jackets Without Hoods for Cooler Weather',
   'A clean outer layer can keep cooler-weather outfits practical without adding another hood. Browse HC Apparel’s live jackets and outerwear collection for current work-ready and everyday options.',
   'Jackets without hoods for cooler days, work, and everyday layering.',
   'Shop Jackets & Outerwear','Live Jackets & Outerwear Collection','https://www.ilovehcapparel.net/ShopGarments?type=outerwear',
   'https://www.ilovehcapparel.net/ShopGarments?type=outerwear&utm_source=tiktok&utm_medium=organic_social&utm_campaign=hc_apparel_organic_launch&utm_content=jackets_without_hoods_tiktok',
   '#Jackets #Outerwear #Workwear #CoolerWeather #HCApparel','tiktok','jackets_without_hoods_tiktok',
   'HC Apparel Jackets Without Hoods artwork showing a seated model in a brown canvas jacket and rust knit cap, with a maroon headline, decoration tip, website address, and listed garment style references including Berne Apparel CH416 in Brown Duck.',
   'TikTok photo post; optional manual in-app video edit','@ilovehcapparel','https://www.tiktok.com/@ilovehcapparel',
   'Looking for a cooler-weather jacket without another hood?'),
  (7,'2026-10-06'::date,'Pinterest','Jackets Without Hoods for Cooler Weather',
   'Looking for a clean outer layer without an attached hood? Browse HC Apparel’s live jackets and outerwear collection for cooler weather, everyday layering, and work-ready options. The linked collection reflects currently published products.',
   'Browse live jackets without hoods and other cooler-weather outerwear at HC Apparel.',
   'Shop Jackets & Outerwear','Live Jackets & Outerwear Collection','https://www.ilovehcapparel.net/ShopGarments?type=outerwear',
   'https://www.ilovehcapparel.net/ShopGarments?type=outerwear&utm_source=pinterest&utm_medium=organic_social&utm_campaign=hc_apparel_organic_launch&utm_content=jackets_without_hoods_pinterest',
   '#JacketsWithoutHoods #Outerwear #WorkwearStyle #CoolerWeather #HCApparel','pinterest','jackets_without_hoods_pinterest',
   'HC Apparel Jackets Without Hoods artwork showing a seated model in a brown canvas jacket and rust knit cap, with a maroon headline, decoration tip, website address, and listed garment style references including Berne Apparel CH416 in Brown Duck.',
   'Pinterest portrait Pin',null,null,null)
), updated as (
  update public.marketing_social_content content set
    day_number=pieces.day_number,
    planned_date=pieces.planned_date,
    platform=pieces.platform,
    content_type='Finished Artwork',
    headline=pieces.headline,
    caption=pieces.caption,
    short_caption=pieces.short_caption,
    cta=pieces.cta,
    product_id=null,
    product_name=pieces.product_name,
    product_url=pieces.product_url,
    product_link=pieces.product_url,
    tracking_url=pieces.tracking_url,
    hashtags=pieces.hashtags,
    status='Draft',
    utm_source=pieces.utm_source,
    utm_medium='organic_social',
    utm_campaign='hc_apparel_organic_launch',
    utm_content=pieces.utm_content,
    recommended_image_url='https://www.ilovehcapparel.net/marketing/hc-apparel-organic-launch/jackets-without-hoods.jpg',
    image_alt_text=pieces.image_alt_text,
    image_video_concept='Use the finished Super Admin artwork exactly as provided. Preserve all text, colors, borders, website address, and proportions. Do not crop, stretch, overlay, or alter it. TikTok editing remains manual in the TikTok app.',
    recommended_format=pieces.format,
    recommended_dimensions='990 × 1280 px · preserve complete artwork',
    video_hook=pieces.video_hook,
    assigned_to='King Terik',
    account_handle=pieces.account_handle,
    account_profile_url=pieces.account_url,
    active_schedule=true,
    product_active_verified=true,
    price_verified=true,
    link_verified=true,
    utm_link_verified=true,
    media_selected=true,
    caption_reviewed=false,
    cta_reviewed=false,
    sale_status_verified=true,
    sale_validation_status='Live outerwear category verified on 2026-09-29. Artwork references Berne CH416, which is not currently published; the draft makes no product-specific availability, price, discount, or customization claim.',
    published_url=null,
    published_date=null,
    updated_at=now()
  from launch, pieces
  where content.campaign_id=launch.id
    and content.platform=pieces.platform
    and (content.utm_content=pieces.utm_content
      or content.recommended_image_url='https://www.ilovehcapparel.net/marketing/hc-apparel-organic-launch/jackets-without-hoods.jpg')
  returning content.id
)
insert into public.marketing_social_content(
  campaign_id,day_number,planned_date,platform,content_type,headline,caption,short_caption,cta,
  product_name,product_url,product_link,tracking_url,hashtags,status,utm_source,utm_medium,utm_campaign,utm_content,
  recommended_image_url,image_alt_text,image_video_concept,recommended_format,recommended_dimensions,video_hook,assigned_to,
  account_handle,account_profile_url,active_schedule,product_active_verified,price_verified,link_verified,utm_link_verified,
  media_selected,caption_reviewed,cta_reviewed,sale_status_verified,sale_validation_status
)
select launch.id,pieces.day_number,pieces.planned_date,pieces.platform,'Finished Artwork',pieces.headline,pieces.caption,pieces.short_caption,pieces.cta,
  pieces.product_name,pieces.product_url,pieces.product_url,pieces.tracking_url,pieces.hashtags,'Draft',pieces.utm_source,'organic_social','hc_apparel_organic_launch',pieces.utm_content,
  'https://www.ilovehcapparel.net/marketing/hc-apparel-organic-launch/jackets-without-hoods.jpg',pieces.image_alt_text,
  'Use the finished Super Admin artwork exactly as provided. Preserve all text, colors, borders, website address, and proportions. Do not crop, stretch, overlay, or alter it. TikTok editing remains manual in the TikTok app.',
  pieces.format,'990 × 1280 px · preserve complete artwork',pieces.video_hook,'King Terik',pieces.account_handle,pieces.account_url,true,
  true,true,true,true,true,false,false,true,
  'Live outerwear category verified on 2026-09-29. Artwork references Berne CH416, which is not currently published; the draft makes no product-specific availability, price, discount, or customization claim.'
from launch cross join pieces
where not exists (
  select 1 from public.marketing_social_content content
  where content.campaign_id=launch.id
    and content.platform=pieces.platform
    and (content.utm_content=pieces.utm_content
      or content.recommended_image_url='https://www.ilovehcapparel.net/marketing/hc-apparel-organic-launch/jackets-without-hoods.jpg')
);

commit;
