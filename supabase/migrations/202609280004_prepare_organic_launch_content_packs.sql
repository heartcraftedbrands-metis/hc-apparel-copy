begin;

alter table public.marketing_social_content
  add column if not exists short_caption text,
  add column if not exists recommended_image_url text,
  add column if not exists image_video_concept text,
  add column if not exists recommended_format text,
  add column if not exists recommended_dimensions text,
  add column if not exists video_hook text,
  add column if not exists shot_list text[] not null default '{}',
  add column if not exists on_screen_text text,
  add column if not exists script_idea text,
  add column if not exists suggested_duration text,
  add column if not exists assigned_to text,
  add column if not exists email_subject text,
  add column if not exists email_preview_text text,
  add column if not exists email_heading text,
  add column if not exists email_body text,
  add column if not exists cta_button_copy text,
  add column if not exists published_url text,
  add column if not exists published_date timestamptz,
  add column if not exists product_validated_at timestamptz,
  add column if not exists sale_validation_status text;

alter table public.marketing_email_campaigns
  add column if not exists heading text,
  add column if not exists body text,
  add column if not exists cta_button_copy text,
  add column if not exists destination_url text,
  add column if not exists tracking_url text,
  add column if not exists published_url text,
  add column if not exists published_date timestamptz;

update public.marketing_social_content set status='Ready to Publish' where status='Ready';
alter table public.marketing_social_content drop constraint if exists marketing_social_content_status_check;
alter table public.marketing_social_content add constraint marketing_social_content_status_check
  check (status in ('Idea','Draft','Ready to Publish','Published','Archived','Needs Update'));

-- Complete every existing Organic Launch draft in place. No campaign or content row is duplicated.
with launch as (select id from public.marketing_campaigns where campaign_key='hc_apparel_organic_launch')
update public.marketing_social_content c set
  short_caption = case
    when day_number=1 then 'Affordable apparel blanks and optional custom printing for brands, teams, businesses, and creators.'
    when day_number=2 then 'A current HC Apparel S&S Sale Pick: Columbia Trail Shaker Beanie — $16.12 while the verified sale remains active.'
    when day_number=3 then 'A lightweight adidas performance polo for teams, staff, events, and everyday business wear — $29.43.'
    when day_number=4 then 'Choose your apparel, upload your artwork, and start a custom-printing order with HC Apparel.'
    when day_number=5 then 'Build a clean team look with the adidas Performance Piqué Polo — $29.92.'
    when day_number=6 then 'Choose a blank by fabric, fit, decoration method, and real-world use—not by guesswork.'
    else 'Apparel blanks, custom printing, and bulk-order help for local groups and businesses.' end,
  recommended_image_url = case
    when day_number=2 then 'https://www.ssactivewear.com/Images/Color/96672_f_fm.jpg'
    when day_number=3 then 'https://www.ssactivewear.com/Images/ModelColor/74514_omf_fm.jpg'
    when day_number=5 then 'https://www.ssactivewear.com/Images/ModelColor/136621_omf_fm.jpg'
    else null end,
  image_video_concept = case
    when day_number=1 then 'Use a clean storefront collage showing tees, polos, hoodies, and outerwear. Keep the garments large and readable; use a simple HC Apparel title card.'
    when day_number=2 then 'Lead with the verified Columbia Trail Shaker Beanie image. For a carousel or video, follow with the two other currently verified homepage Sale Picks and a live storefront screen recording.'
    when day_number=3 then 'Use the live A230 product image with a simple close crop on the polo, followed by detail frames for the collar, placket, and performance fabric.'
    when day_number=4 then 'Show the path from blank garment to finished idea: browse a garment, upload artwork, then use real printing or packing footage when available.'
    when day_number=5 then 'Use the live A430 product image, then pair it with a simple team-uniform mood board featuring polos, quarter-zips, and outerwear from the live catalog.'
    when day_number=6 then 'Use three simple panels or clips labeled Fabric & Weight, Fit & Sizes, and Decoration Method. A storefront screen recording can demonstrate each choice.'
    else 'Use a welcoming collage of work shirts, team apparel, event tees, and a real packing or printing detail. Avoid stock-testimonial imagery.' end,
  recommended_format = case
    when platform='TikTok' then 'Vertical short-form video / Reel'
    when platform='Instagram' then 'Portrait feed post; optional Reel alternative'
    when platform='Facebook' then 'Portrait feed post; optional carousel'
    when platform='Google Business' then 'Google Business update with image'
    when platform='Email' then 'Responsive email with one hero image'
    when platform='SEO / GEO' then 'Educational article with social-share image'
    else 'Personalized outreach graphic or one-page leave-behind' end,
  recommended_dimensions = case
    when platform='TikTok' then '1080 × 1920 px (9:16)'
    when platform in ('Instagram','Facebook','Local Outreach') then '1080 × 1350 px (4:5)'
    when platform='Google Business' then '1200 × 900 px (4:3)'
    when platform='Email' then '1200 × 600 px (2:1 hero)'
    else '1200 × 630 px (1.91:1)' end,
  assigned_to = case when platform in ('Instagram','TikTok') then 'YHO / Mario' else 'King Terik' end,
  product_validated_at = now(),
  sale_validation_status = case when day_number=2 then 'Verified against current authenticated S&S salePrice data and the live homepage Sale Picks.' else 'Live product/page revalidated.' end,
  status='Draft'
where c.campaign_id=(select id from launch);

-- Human-polished final captions, distinct by channel.
with launch as (select id from public.marketing_campaigns where campaign_key='hc_apparel_organic_launch')
update public.marketing_social_content c set caption=case
  when day_number=1 and platform='Facebook' then $$Building a brand, outfitting a team, planning an event, or creating merch? The right blank makes the rest of the project easier. HC Apparel brings dependable tees, polos, hoodies, and outerwear together with optional custom-printing help—without making the process complicated. Explore the shop and find the right starting point.$$
  when day_number=1 and platform='Instagram' then $$Your next apparel project starts with the right blank. HC Apparel helps brands, teams, businesses, creators, and event organizers find dependable tees, polos, hoodies, outerwear, and more—with custom-printing support when you need it. Tap through to explore the live catalog.$$
  when day_number=1 and platform='TikTok' then $$A quick look at how HC Apparel helps you move from blank apparel to a brand-, team-, or event-ready idea. Browse the live catalog and start with the garment that fits your project.$$
  when day_number=1 and platform='Google Business' then $$HC Apparel offers affordable apparel blanks, custom-printing support, and bulk-order help for brands, teams, businesses, creators, and local organizations. Browse the live catalog or start a custom project online.$$
  when day_number=1 and platform='Email' then $$Whether you are building a brand, outfitting a team, organizing an event, or creating merchandise, HC Apparel gives you a practical place to begin. Browse dependable apparel blanks, compare live options, and request custom-printing or bulk-order help when your project calls for it.$$
  when day_number=2 and platform='Facebook' then $$A practical cold-weather pick is currently featured in HC Apparel’s S&S Sale Picks: the Columbia Trail Shaker Beanie. The current HC Apparel customer price is $16.12 while the verified sale remains active. View the live product for available colors and options.$$
  when day_number=2 and platform='TikTok' then $$Three real S&S Sale Picks, one quick scroll. Start with the Columbia Trail Shaker Beanie at a current HC Apparel customer price of $16.12, then view the other live picks on the homepage. Sale status should be rechecked before manual posting.$$
  when day_number=2 and platform='Google Business' then $$The Columbia Trail Shaker Beanie is a current HC Apparel S&S Sale Pick at a customer price of $16.12 while the verified sale remains active. Visit the live product page to review available options.$$
  when day_number=3 then $$A polished polo that can move from the workday to team events. The adidas Men’s Performance Polo A230 has a lightweight recycled-polyester build, a hydrophilic finish, and a clean three-button placket. Current HC Apparel customer price: $29.43. View the live product for colors and sizes.$$
  when day_number=4 then $$Have an apparel idea but need a clear place to start? Choose a blank, upload your artwork, and tell HC Apparel what you are creating. Custom printing can support business uniforms, teams, events, organizations, creator merchandise, and family projects.$$
  when day_number=5 then $$A coordinated team look can be simple. Start with the adidas Men’s Performance Piqué Polo A430 for a clean, professional layer built with recycled polyester piqué and a hydrophilic finish. Current HC Apparel customer price: $29.92. Explore the live product and build from there.$$
  when day_number=6 and platform='TikTok' then $$Choosing a blank shirt is easier when you check three things first: fabric and weight, fit and size range, and how the artwork will be decorated. Match the shirt to the project instead of assuming one blank works for everyone.$$
  when day_number=6 then $$Create a practical guide that helps customers compare blank shirts by fabric weight, cotton versus blends, fit, color range, size availability, decoration method, order quantity, and intended use. Keep claims tied to live product specifications.$$
  when day_number=7 and platform='Facebook' then $$Local projects deserve apparel that fits the people and the purpose. HC Apparel supports small businesses, churches, schools, sports teams, family reunions, contractors, cleaning companies, creators, and community organizations with blanks, custom-printing options, and bulk-order help.$$
  else $$Build a permission-based list of local schools, churches, teams, family-reunion organizers, landscapers, contractors, cleaning companies, businesses, creators, and event organizers. Reach out personally, explain how HC Apparel can help, and never scrape or spam contacts.$$ end
where c.campaign_id=(select id from launch);

-- Video-ready packs.
with launch as (select id from public.marketing_campaigns where campaign_key='hc_apparel_organic_launch')
update public.marketing_social_content c set
  video_hook=case day_number when 1 then 'Need blanks for a brand, team, or event?' when 2 then 'Three real S&S Sale Picks in under 20 seconds.' else 'Before you choose a blank shirt, check these three things.' end,
  shot_list=case day_number
    when 1 then array['0–3s: HC Apparel title plus garment grid','3–8s: scroll tees, polos, hoodies, and outerwear','8–13s: show artwork-upload/custom-printing path','13–18s: end card with Shop Garments CTA']
    when 2 then array['0–3s: live Sale Picks headline','3–8s: Columbia Trail Shaker Beanie and $16.12 customer price','8–14s: show the two other verified homepage Sale Picks','14–18s: live homepage and View Current Sale Picks CTA']
    else array['0–3s: hook over shirt close-up','3–8s: compare fabric and weight','8–13s: compare fit and size range','13–18s: match decoration method to artwork','18–22s: Browse Blank Apparel CTA'] end,
  on_screen_text=case day_number when 1 then 'Blanks for brands, teams & creators' when 2 then 'Current S&S Sale Picks • Recheck before posting' else '1. Fabric & weight  2. Fit & sizes  3. Decoration method' end,
  script_idea=case day_number when 1 then 'Start with the project, then choose the blank. HC Apparel helps you browse garments and move toward custom printing when you are ready.' when 2 then 'Here are three current S&S Sale Picks at HC Apparel. Start with this Columbia beanie, then see the full live selection on the homepage.' else 'The best blank depends on how it will feel, who will wear it, and how the design will be applied. Check those three things before you buy.' end,
  suggested_duration=case when day_number=6 then '20–25 seconds' else '15–20 seconds' end
where c.campaign_id=(select id from launch) and c.platform='TikTok';

-- Complete the existing email content pack without sending it.
with launch as (select id from public.marketing_campaigns where campaign_key='hc_apparel_organic_launch')
update public.marketing_social_content c set
  email_subject='Welcome to HC Apparel',
  email_preview_text='Affordable apparel blanks, custom printing, and bulk-order help for your next project.',
  email_heading='Start with the right apparel blank',
  email_body='Browse live tees, polos, hoodies, outerwear, and more for brands, teams, businesses, creators, and events. When your project needs decoration or a larger quantity, HC Apparel can also help with custom printing and bulk-order planning.',
  cta_button_copy='Shop Garments'
where c.campaign_id=(select id from launch) and c.platform='Email';

update public.marketing_email_campaigns set
  subject='Welcome to HC Apparel',
  preview_text='Affordable apparel blanks, custom printing, and bulk-order help for your next project.',
  heading='Start with the right apparel blank',
  body='Browse live tees, polos, hoodies, outerwear, and more for brands, teams, businesses, creators, and events. When your project needs decoration or a larger quantity, HC Apparel can also help with custom printing and bulk-order planning.',
  cta_button_copy='Shop Garments',
  destination_url='https://www.ilovehcapparel.net/ShopGarments',
  tracking_url='https://www.ilovehcapparel.net/ShopGarments?utm_source=email&utm_medium=organic_email&utm_campaign=hc_apparel_organic_launch&utm_content=day1_launch_email',
  status='Draft'
where campaign_name='HC Apparel Organic Launch — Welcome';

commit;
