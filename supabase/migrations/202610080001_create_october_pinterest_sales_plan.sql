begin;

-- Keep platform scheduling state separate from content approval. A Pin can be
-- complete and planned without claiming that Pinterest or Buffer accepted it.
alter table public.marketing_social_content
  add column if not exists calendar_series_key text,
  add column if not exists planned_time time without time zone,
  add column if not exists planned_timezone text not null default 'America/New_York',
  add column if not exists planned_at timestamptz,
  add column if not exists pinterest_board text,
  add column if not exists schedule_status text not null default 'Planned',
  add column if not exists schedule_batch integer,
  add column if not exists schedule_confirmation_id text,
  add column if not exists schedule_error text,
  add column if not exists destination_verified_at timestamptz;

alter table public.marketing_social_content
  drop constraint if exists marketing_social_content_day_number_check;
alter table public.marketing_social_content
  add constraint marketing_social_content_day_number_check
  check (day_number is null or day_number between 1 and 31);

alter table public.marketing_social_content
  drop constraint if exists marketing_social_content_schedule_status_check;
alter table public.marketing_social_content
  add constraint marketing_social_content_schedule_status_check
  check (schedule_status in ('Planned','Ready','Scheduled on Pinterest','Published','Failed'));

alter table public.marketing_social_content
  drop constraint if exists marketing_social_content_schedule_batch_check;
alter table public.marketing_social_content
  add constraint marketing_social_content_schedule_batch_check
  check (schedule_batch is null or schedule_batch in (1,2));

create or replace function public.sync_marketing_content_planned_at()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.planned_date is null or new.planned_time is null then
    new.planned_at := null;
  else
    new.planned_at := (new.planned_date + new.planned_time)
      at time zone coalesce(nullif(new.planned_timezone,''), 'America/New_York');
  end if;
  return new;
end;
$$;

drop trigger if exists sync_marketing_content_planned_at_trigger on public.marketing_social_content;
create trigger sync_marketing_content_planned_at_trigger
before insert or update of planned_date,planned_time,planned_timezone
on public.marketing_social_content for each row
execute function public.sync_marketing_content_planned_at();

create or replace function public.enforce_confirmed_pinterest_schedule()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.schedule_status='Scheduled on Pinterest'
    and nullif(btrim(new.schedule_confirmation_id),'') is null then
    raise exception 'Pinterest scheduling must be confirmed by the connected publishing service before using Scheduled on Pinterest.';
  end if;
  return new;
end;
$$;

drop trigger if exists confirmed_pinterest_schedule_guard on public.marketing_social_content;
create trigger confirmed_pinterest_schedule_guard
before insert or update of schedule_status,schedule_confirmation_id
on public.marketing_social_content for each row
execute function public.enforce_confirmed_pinterest_schedule();

alter table public.marketing_social_accounts
  add column if not exists publishing_service text,
  add column if not exists publishing_connection_status text,
  add column if not exists publishing_verified_at timestamptz,
  add column if not exists connected_channel_name text,
  add column if not exists available_boards text[] not null default '{}',
  add column if not exists direct_schedule_available boolean not null default false;

update public.marketing_social_accounts
set handle='heartfamilyco',
    publishing_service='Buffer',
    publishing_connection_status='Connected and schedule-capable; no Pins from this plan have been submitted.',
    publishing_verified_at='2026-10-08 15:00:00-04'::timestamptz,
    connected_channel_name='Pinterest — heartfamilyco (My organization)',
    available_boards=array['Apparel Blanks','Custom Printing'],
    direct_schedule_available=true,
    notes='Pinterest channel and the Apparel Blanks board were verified through the existing Buffer connection on October 8, 2026. Marketing Center records remain planned until Buffer returns a scheduling confirmation.',
    updated_at=now()
where platform='Pinterest';

with launch as (
  select id from public.marketing_campaigns where campaign_key='hc_apparel_organic_launch'
), pieces(
  day_number,planned_date,headline,description,short_caption,product_id,product_name,
  destination_url,utm_content,image_url,image_alt_text,hashtags,format,dimensions,
  batch_number,reuse_utm_content,verification_note
) as (values
  (1,'2026-10-09'::date,'Puffers & Insulated Outerwear for Fall Layering',
   'Build a practical cooler-weather rotation with puffers, insulated vests, and other easy layers. Explore HC Apparel’s live outerwear collection for current styles and available options. Shop the collection.',
   'Puffers and insulated layers for cooler days. Shop HC Apparel outerwear.',
   null,null,'https://www.ilovehcapparel.net/ShopGarments?type=outerwear','oct09_puffers_insulated',
   'https://www.ilovehcapparel.net/marketing/hc-apparel-organic-launch/puffers-insulated.jpg',
   'HC Apparel Puffers & Insulated artwork showing a seated model wearing a blue insulated vest over a white sweatshirt, with the HC Apparel website and garment style details.',
   '#Puffers #InsulatedOuterwear #FallLayering','Pinterest portrait Pin','995 × 1280 px · preserve complete supplied artwork',1,'outerwear_puffers_pinterest',
   'Verified live outerwear collection with 38 public active products on 2026-10-08. The supplied artwork is preserved; no exact-style availability or price claim is made.'),

  (2,'2026-10-10','Gildan Heavy Cotton 5000 Blank T-Shirts',
   'Start with a dependable blank tee for everyday wear, events, teams, or creative projects. Browse the live Gildan 5000 product page to choose from currently available colors and sizes. Shop the Gildan 5000.',
   'A versatile blank tee for everyday projects. Shop the live Gildan 5000.',
   'd12b6912-b9fb-4582-9d57-a40e0499b274','Gildan 5000','https://www.ilovehcapparel.net/ProductDetail?id=d12b6912-b9fb-4582-9d57-a40e0499b274','oct10_gildan_5000',
   'https://www.ssactivewear.com/Images/Color/33476_f_fm.jpg',
   'Authorized supplier catalog photograph of a Gildan 5000 blank T-shirt shown from the front.',
   '#Gildan5000 #BlankTShirts #ApparelBlanks','Pinterest product Pin','Original authorized catalog image · show the full garment',1,null,
   'Gildan 5000 was public, active, and had stocked variants when verified on 2026-10-08.'),

  (3,'2026-10-11','Blank Hoodies for Fall: Gildan 18500',
   'A blank pullover hoodie is an easy fall layer for teams, organizations, workdays, and everyday outfits. Review the live Gildan 18500 page for current colors, sizes, and availability. Shop blank hoodies.',
   'Layer up for fall with the live Gildan 18500 blank hoodie.',
   '824e99db-7758-495b-99f4-0e2d5a4ff0da','Gildan 18500','https://www.ilovehcapparel.net/ProductDetail?id=824e99db-7758-495b-99f4-0e2d5a4ff0da','oct11_blank_hoodies_fall',
   'https://www.ssactivewear.com/Images/Color/33306_f_fm.jpg',
   'Authorized supplier catalog photograph of a Gildan 18500 pullover hoodie shown from the front.',
   '#BlankHoodies #FallApparel #Gildan18500','Pinterest product Pin','Original authorized catalog image · show the full garment',1,null,
   'Gildan 18500 was public, active, and had stocked variants when verified on 2026-10-08.'),

  (4,'2026-10-12','Comfort Colors 1717 Blank Tees',
   'Explore the live Comfort Colors 1717 blank tee for laid-back brand collections, group apparel, and everyday projects. Check the product page for current color and size options. Shop Comfort Colors tees.',
   'Explore the live Comfort Colors 1717 for relaxed blank-tee projects.',
   '150f3861-4f9c-46f3-8b76-54ecf40c2413','Comfort Colors 1717','https://www.ilovehcapparel.net/ProductDetail?id=150f3861-4f9c-46f3-8b76-54ecf40c2413','oct12_comfort_colors_1717',
   'https://www.ssactivewear.com/Images/Color/47183_f_fm.jpg',
   'Authorized supplier catalog photograph of a Comfort Colors 1717 blank T-shirt shown from the front.',
   '#ComfortColors1717 #BlankTees #CreatorApparel','Pinterest product Pin','Original authorized catalog image · show the full garment',1,null,
   'Comfort Colors 1717 was public, active, and had stocked variants when verified on 2026-10-08.'),

  (5,'2026-10-13','Jackets Without Hoods: Berne CH416 Chore Coat',
   'Looking for a cooler-weather layer without an attached hood? The live Berne CH416 Heritage Chore Coat offers a clean workwear option for layering. Review current colors, sizes, and availability on the product page. Shop this coat.',
   'A clean cooler-weather workwear layer without an attached hood. Shop Berne CH416.',
   'de5d2534-d256-472d-97a1-dc7a77ee1cae','Berne Men''s Heritage Chore Coat CH416','https://www.ilovehcapparel.net/ProductDetail?id=de5d2534-d256-472d-97a1-dc7a77ee1cae','oct13_berne_ch416',
   'https://www.ilovehcapparel.net/marketing/hc-apparel-organic-launch/jackets-without-hoods.jpg',
   'HC Apparel Jackets Without Hoods artwork showing a seated model in a brown canvas jacket and rust knit cap, with a maroon headline, decoration tip, website address, and Berne Apparel CH416 style reference.',
   '#BerneCH416 #JacketsWithoutHoods #Workwear','Pinterest portrait Pin','990 × 1280 px · preserve complete supplied artwork',1,'jackets_without_hoods_pinterest',
   'Berne CH416 was public, active, and had stocked variants when verified on 2026-10-08. No price, discount, or customization claim is included.'),

  (6,'2026-10-14','Crewneck Sweatshirts for Cooler Days',
   'Keep fall layering simple with a blank crewneck sweatshirt. Explore the live Shaka Wear 241C2 crewneck for current product options, then choose the size and color that fit your project. Shop crewnecks.',
   'A straightforward blank crewneck for cooler days. Shop the live Shaka Wear 241C2.',
   '055f92f7-3453-4455-9db5-a112239ff91c','Shaka Wear 241C2 Crewneck','https://www.ilovehcapparel.net/ProductDetail?id=055f92f7-3453-4455-9db5-a112239ff91c','oct14_crewneck_sweatshirts',
   'https://www.ssactivewear.com/Images/Color/142656_f_fm.jpg',
   'Authorized supplier catalog photograph of a Shaka Wear 241C2 blank crewneck sweatshirt shown from the front.',
   '#CrewneckSweatshirt #BlankApparel #FallLayers','Pinterest product Pin','Original authorized catalog image · show the full garment',1,null,
   'Shaka Wear 241C2 was public, active, and had stocked variants when verified on 2026-10-08.'),

  (7,'2026-10-15','Blank Apparel for Brand Creators',
   'Building a clothing brand starts with the right blank. Use the live Next Level 3600 product page to compare current colors and sizes for your next creator collection or merchandise idea. Shop blank tees.',
   'Start your next creator collection with a live blank tee option.',
   'a0d2a65a-0c03-4b0d-a97a-3940be0a6391','Next Level 3600','https://www.ilovehcapparel.net/ProductDetail?id=a0d2a65a-0c03-4b0d-a97a-3940be0a6391','oct15_brand_creators',
   'https://www.ssactivewear.com/Images/ModelColor/96037_omf_fm.jpg',
   'Authorized supplier catalog photograph of a model wearing the Next Level 3600 blank T-shirt.',
   '#BrandCreators #BlankApparel #NextLevel3600','Pinterest product Pin','Original authorized catalog image · preserve the complete photograph',1,null,
   'Next Level 3600 was public, active, and had stocked variants when verified on 2026-10-08.'),

  (8,'2026-10-16','Rain Jackets for Work, Travel, and Everyday Layers',
   'Be ready for changing weather with rain jackets and lightweight outerwear suited to workdays, travel, teams, and everyday layering. Browse HC Apparel’s live outerwear collection for current options. Shop outerwear.',
   'Browse rain jackets and lightweight outerwear for changing weather.',
   null,null,'https://www.ilovehcapparel.net/ShopGarments?type=outerwear','oct16_rain_jackets',
   'https://www.ilovehcapparel.net/marketing/hc-apparel-organic-launch/rain-jackets.jpg',
   'HC Apparel Rain Jackets artwork showing a model wearing a black Columbia rain jacket, plus a decoration tip, website address, and garment style details.',
   '#RainJackets #LightweightOuterwear #Workwear','Pinterest portrait Pin','1009 × 1280 px · preserve complete supplied artwork',1,'outerwear_rain_jackets_pinterest',
   'Verified live outerwear collection with 38 public active products on 2026-10-08. The supplied artwork is preserved; no exact-style availability or price claim is made.'),

  (9,'2026-10-17','Bella + Canvas 3001 Blank Tees',
   'The live Bella + Canvas 3001 gives creators, teams, and small brands another flexible blank-tee option. Visit the product page to review current colors, sizes, and availability. Shop Bella + Canvas tees.',
   'Explore the live Bella + Canvas 3001 for your next blank-tee project.',
   '41c95206-3b16-4091-9c02-e4d03311ec10','Bella + Canvas 3001','https://www.ilovehcapparel.net/ProductDetail?id=41c95206-3b16-4091-9c02-e4d03311ec10','oct17_bella_canvas_3001',
   'https://www.ssactivewear.com/Images/Color/34126_f_fm.jpg',
   'Authorized supplier catalog photograph of a Bella + Canvas 3001 blank T-shirt shown from the front.',
   '#BellaCanvas3001 #BlankTees #SmallBrandApparel','Pinterest product Pin','Original authorized catalog image · show the full garment',1,null,
   'Bella + Canvas 3001 was public, active, and had stocked variants when verified on 2026-10-08.'),

  (10,'2026-10-18','Shaka Wear Tees for Streetwear Projects',
   'Explore the live Shaka Wear 297C2 tee as a starting point for streetwear-inspired collections, creator merchandise, and everyday blank-apparel projects. Check current options on the product page. Shop Shaka Wear.',
   'Explore a live Shaka Wear tee for streetwear-inspired projects.',
   '609c9c51-b9c1-4afa-80b8-bc6c66a25690','Shaka Wear 297C2 SHTDSS','https://www.ilovehcapparel.net/ProductDetail?id=609c9c51-b9c1-4afa-80b8-bc6c66a25690','oct18_shaka_wear_tees',
   'https://www.ssactivewear.com/Images/Color/127195_f_fm.jpg',
   'Authorized supplier catalog photograph of a Shaka Wear 297C2 blank T-shirt shown from the front.',
   '#ShakaWear #StreetwearBlanks #BlankTees','Pinterest product Pin','Original authorized catalog image · show the full garment',1,null,
   'Shaka Wear 297C2 was public, active, and had stocked variants when verified on 2026-10-08.'),

  (11,'2026-10-19','American Apparel 2001 Everyday Essentials',
   'Keep everyday apparel projects simple with the live American Apparel 2001 blank tee. Review current colors, sizes, and availability before choosing the right option for your group, event, or collection. Shop American Apparel.',
   'An everyday blank-tee essential for groups, events, and collections.',
   '87e3cf23-d6c4-4996-9be1-9eacdcf2b932','American Apparel 2001','https://www.ilovehcapparel.net/ProductDetail?id=87e3cf23-d6c4-4996-9be1-9eacdcf2b932','oct19_american_apparel_2001',
   'https://www.ssactivewear.com/Images/Color/67565_f_fm.jpg',
   'Authorized supplier catalog photograph of an American Apparel 2001 blank T-shirt shown from the front.',
   '#AmericanApparel2001 #EverydayEssentials #BlankTees','Pinterest product Pin','Original authorized catalog image · show the full garment',2,null,
   'American Apparel 2001 was public, active, and had stocked variants when verified on 2026-10-08.'),

  (12,'2026-10-20','Workwear and Outerwear Built for the Season',
   'Compare live workwear jackets, insulated layers, and other outerwear for cooler job sites and everyday use. Browse the current HC Apparel outerwear collection to find the right layer. Shop workwear and outerwear.',
   'Compare live workwear and outerwear for cooler days.',
   null,null,'https://www.ilovehcapparel.net/ShopGarments?type=outerwear','oct20_workwear_outerwear',
   'https://www.ilovehcapparel.net/marketing/hc-apparel-organic-launch/outerwear-overview.jpg',
   'HC Apparel outerwear overview artwork featuring fabric and website artwork above side-by-side Puffers & Insulated and Workwear sections with two models.',
   '#Workwear #Outerwear #FallLayers','Pinterest portrait Pin','1000 × 1280 px · preserve complete supplied artwork',2,'outerwear_overview_pinterest',
   'Verified live outerwear collection with 38 public active products on 2026-10-08. The supplied artwork is preserved; no exact-style availability or price claim is made.'),

  (13,'2026-10-21','Blank Apparel for Teams and Groups',
   'Planning shirts for a team, school, church, organization, reunion, or community group? Start with the live Gildan 64000 and compare current colors and sizes for your order. Shop blank team apparel.',
   'Start a team or group order with a live blank-tee option.',
   '4162eaf9-061e-4b3c-9a00-4dd7cf2172eb','Gildan 64000','https://www.ilovehcapparel.net/ProductDetail?id=4162eaf9-061e-4b3c-9a00-4dd7cf2172eb','oct21_teams_groups',
   'https://www.ssactivewear.com/Images/Color/33310_f_fm.jpg',
   'Authorized supplier catalog photograph of a Gildan 64000 blank T-shirt shown from the front.',
   '#TeamApparel #GroupShirts #BlankTShirts','Pinterest product Pin','Original authorized catalog image · show the full garment',2,null,
   'Gildan 64000 was public, active, and had stocked variants when verified on 2026-10-08.'),

  (14,'2026-10-22','Fall Apparel Roundup: Tees, Hoodies, Crewnecks, and Outerwear',
   'Refresh your fall lineup with blank tees, hoodies, crewnecks, quarter-zips, and outerwear. The live adidas A721 quarter-zip is one current layering option; browse the full HC Apparel catalog to compare more fall-ready styles. Shop fall apparel.',
   'Round out fall with tees, hoodies, crewnecks, quarter-zips, and outerwear.',
   '4e9ae0c7-243e-44c6-a90c-47042b949bd2','adidas Men''s Elevated Fleece Quarter-Zip Pullover A721','https://www.ilovehcapparel.net/ShopGarments','oct22_fall_apparel_roundup',
   'https://www.ssactivewear.com/Images/Color/139646_f_fm.jpg',
   'Authorized supplier catalog photograph of the adidas A721 elevated fleece quarter-zip pullover shown from the front.',
   '#FallApparel #BlankHoodies #CrewneckSweatshirts','Pinterest collection Pin','Original authorized catalog image · show the full garment',2,null,
   'The adidas A721 anchor product was public, active, and had stocked variants, and the all-garments destination was live when verified on 2026-10-08.')
), updated as (
  update public.marketing_social_content content set
    day_number=pieces.day_number,
    planned_date=pieces.planned_date,
    planned_time='20:00:00'::time,
    planned_timezone='America/New_York',
    calendar_series_key='pinterest_october_sales_2026',
    platform='Pinterest',
    content_type='Pinterest Sales Pin',
    headline=pieces.headline,
    caption=pieces.description,
    short_caption=pieces.short_caption,
    cta='Shop',
    product_id=pieces.product_id,
    product_name=pieces.product_name,
    product_url=pieces.destination_url,
    product_link=pieces.destination_url,
    tracking_url=pieces.destination_url || case when position('?' in pieces.destination_url)>0 then '&' else '?' end ||
      'utm_source=pinterest&utm_medium=organic_social&utm_campaign=hc_apparel_organic_launch&utm_content=' || pieces.utm_content,
    hashtags=pieces.hashtags,
    status='Draft',
    utm_source='pinterest',
    utm_medium='organic_social',
    utm_campaign='hc_apparel_organic_launch',
    utm_content=pieces.utm_content,
    recommended_image_url=pieces.image_url,
    image_alt_text=pieces.image_alt_text,
    image_video_concept='Use the listed finished artwork or authorized live catalog photograph. Preserve the complete image; do not crop out garments, headlines, or website text.',
    recommended_format=pieces.format,
    recommended_dimensions=pieces.dimensions,
    assigned_to='King Terik',
    account_handle='heartfamilyco',
    active_schedule=true,
    product_active_verified=true,
    price_verified=true,
    link_verified=true,
    utm_link_verified=true,
    media_selected=true,
    sale_status_verified=true,
    sale_validation_status=pieces.verification_note,
    pinterest_board='Apparel Blanks',
    schedule_status='Planned',
    schedule_batch=pieces.batch_number,
    schedule_confirmation_id=null,
    schedule_error=null,
    destination_verified_at='2026-10-08 15:07:01-04'::timestamptz,
    published_url=null,
    published_date=null,
    updated_at=now()
  from launch, pieces
  where content.campaign_id=launch.id
    and content.platform='Pinterest'
    and (content.utm_content=pieces.utm_content
      or (pieces.reuse_utm_content is not null and content.utm_content=pieces.reuse_utm_content))
  returning content.id
)
insert into public.marketing_social_content(
  campaign_id,day_number,planned_date,planned_time,planned_timezone,calendar_series_key,
  platform,content_type,headline,caption,short_caption,cta,product_id,product_name,
  product_url,product_link,tracking_url,hashtags,status,utm_source,utm_medium,utm_campaign,utm_content,
  recommended_image_url,image_alt_text,image_video_concept,recommended_format,recommended_dimensions,
  assigned_to,account_handle,active_schedule,product_active_verified,price_verified,link_verified,
  utm_link_verified,media_selected,sale_status_verified,sale_validation_status,pinterest_board,
  schedule_status,schedule_batch,destination_verified_at
)
select
  launch.id,pieces.day_number,pieces.planned_date,'20:00:00'::time,'America/New_York','pinterest_october_sales_2026',
  'Pinterest','Pinterest Sales Pin',pieces.headline,pieces.description,pieces.short_caption,'Shop',pieces.product_id,pieces.product_name,
  pieces.destination_url,pieces.destination_url,
  pieces.destination_url || case when position('?' in pieces.destination_url)>0 then '&' else '?' end ||
    'utm_source=pinterest&utm_medium=organic_social&utm_campaign=hc_apparel_organic_launch&utm_content=' || pieces.utm_content,
  pieces.hashtags,'Draft','pinterest','organic_social','hc_apparel_organic_launch',pieces.utm_content,
  pieces.image_url,pieces.image_alt_text,
  'Use the listed finished artwork or authorized live catalog photograph. Preserve the complete image; do not crop out garments, headlines, or website text.',
  pieces.format,pieces.dimensions,'King Terik','heartfamilyco',true,true,true,true,true,true,true,pieces.verification_note,
  'Apparel Blanks','Planned',pieces.batch_number,'2026-10-08 15:07:01-04'::timestamptz
from launch cross join pieces
where not exists (
  select 1 from public.marketing_social_content content
  where content.campaign_id=launch.id and content.platform='Pinterest'
    and (content.utm_content=pieces.utm_content
      or (pieces.reuse_utm_content is not null and content.utm_content=pieces.reuse_utm_content))
);

-- Backfill planned_at for rows updated above; the trigger handles later edits.
update public.marketing_social_content
set planned_at=(planned_date + planned_time) at time zone planned_timezone
where calendar_series_key='pinterest_october_sales_2026';

commit;
