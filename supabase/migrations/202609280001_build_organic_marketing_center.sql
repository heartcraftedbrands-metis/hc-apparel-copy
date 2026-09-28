begin;

alter table public.marketing_settings
  add column if not exists monthly_paid_budget numeric(12,2) not null default 0 check (monthly_paid_budget >= 0),
  add column if not exists paid_advertising_enabled boolean not null default false,
  add column if not exists organic_marketing_enabled boolean not null default true,
  add column if not exists ai_assistant_enabled boolean not null default false;

update public.marketing_settings
set monthly_paid_budget = 0,
    paid_advertising_enabled = false,
    organic_marketing_enabled = true
where id = true;

alter table public.marketing_events drop constraint if exists marketing_events_event_name_check;
alter table public.marketing_events
  add constraint marketing_events_event_name_check check (event_name in (
    'page_view','product_view','view_product','brand_view','category_view','account_signup','login',
    'add_to_cart','remove_from_cart','checkout_started','begin_checkout','shipping_quote_success',
    'payment_method_selected','purchase_completed','purchase','quote_request_submitted','bulk_quote_submit',
    'contact_submitted','contact_submit','email_subscribed','newsletter_signup','sale_promo_clicked',
    'search_used','track_order_used','social_post_created','social_post_sent_to_buffer'
  ));
alter table public.marketing_events
  add column if not exists path text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists public.marketing_channels (
  id uuid primary key default gen_random_uuid(),
  channel text not null unique,
  priority text not null check (priority in ('Must Have','High Priority','Future / Paid')),
  status text not null default 'Active' check (status in ('Active','Inactive','Future')),
  why_it_matters text,
  recommended_tactics text[] not null default '{}',
  notes text,
  goals text,
  monthly_budget numeric(12,2) not null default 0 check (monthly_budget >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null unique,
  channel text not null,
  why_it_matters text,
  assigned_to text not null default 'King Terik',
  priority text not null default 'Medium' check (priority in ('Critical','High','Medium','Low')),
  status text not null default 'To Do' check (status in ('To Do','In Progress','Waiting','Completed','Dismissed')),
  due_date date,
  notes text,
  action_type text not null default 'Organic',
  is_seed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  campaign text not null,
  channel text not null default 'Organic',
  start_date date,
  end_date date,
  goal text,
  status text not null default 'Planning' check (status in ('Planning','Active','Paused','Completed','Archived')),
  budget numeric(12,2) not null default 0 check (budget >= 0),
  traffic integer,
  conversions integer,
  revenue numeric(12,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_social_content (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('Facebook','Instagram','TikTok','Google Business')),
  caption text,
  hashtags text,
  product_link text,
  product_id text,
  campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  status text not null default 'Idea' check (status in ('Idea','Draft','Ready','Published','Archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_email_campaigns (
  id uuid primary key default gen_random_uuid(),
  campaign_name text not null,
  campaign_type text not null check (campaign_type in ('Welcome','New Products','Brand Spotlight','Sale Products','Seasonal','Custom Printing','Bulk Orders','Subscriber Re-engagement')),
  subject text,
  preview_text text,
  audience text,
  status text not null default 'Idea' check (status in ('Idea','Draft','Ready','Scheduled','Sent','Archived')),
  scheduled_date timestamptz,
  performance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_google_business_items (
  id uuid primary key default gen_random_uuid(),
  item text not null unique,
  completed boolean not null default false,
  notes text,
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_competitors (
  id uuid primary key default gen_random_uuid(),
  competitor text not null,
  website text,
  products_focus text,
  observed_pricing text,
  strengths text,
  weaknesses text,
  opportunity text,
  date_reviewed date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_goals (
  id uuid primary key default gen_random_uuid(),
  metric text not null unique,
  target_value numeric,
  period text not null default 'Monthly',
  notes text,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_seo_pages (
  id uuid primary key default gen_random_uuid(),
  page_name text not null unique,
  path text not null,
  page_title text,
  meta_description text,
  canonical text,
  open_graph_status text,
  structured_data_status text,
  indexability text,
  audit_status text not null default 'Not audited' check (audit_status in ('Not audited','Needs attention','Pass')),
  notes text,
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_content_ideas (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  idea text not null unique,
  status text not null default 'Idea' check (status in ('Idea','Planned','Used','Archived')),
  created_at timestamptz not null default now()
);

create or replace function public.marketing_admin_touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

DO $block$
declare table_name text;
begin
  foreach table_name in array array['marketing_channels','marketing_tasks','marketing_campaigns','marketing_social_content','marketing_email_campaigns','marketing_google_business_items','marketing_competitors','marketing_goals','marketing_seo_pages','marketing_content_ideas']
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_admin', table_name);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', table_name || '_admin', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
    execute format('drop trigger if exists %I on public.%I', table_name || '_touch', table_name);
    execute format('create trigger %I before update on public.%I for each row execute function public.marketing_admin_touch_updated_at()', table_name || '_touch', table_name);
  end loop;
end $block$;

insert into public.marketing_channels(channel,priority,status,why_it_matters,recommended_tactics,monthly_budget) values
('Google Business Profile','Must Have','Active','Helps nearby customers find and trust HC Apparel.',array['Complete verification','Add products and photos','Publish updates','Request genuine reviews'],0),
('SEO / GEO','Must Have','Active','Builds durable discovery in search and answer engines.',array['Audit metadata','Improve category copy','Review structured data','Maintain sitemap and robots.txt'],0),
('Facebook','Must Have','Active','Reaches local organizations, teams, families, and businesses.',array['Complete profile','Share product and printing education','Feature local use cases'],0),
('Instagram','Must Have','Active','Supports visual product discovery and brand trust.',array['Publish product features','Use Reels','Show custom-printing work'],0),
('TikTok / Reels','High Priority','Active','Short video can expand organic reach without ad spend.',array['Create short garment comparisons','Show blank apparel details','Reuse vertical video'],0),
('Email Marketing','High Priority','Active','Keeps consented subscribers informed without paid media.',array['Prepare welcome email','Send product announcements only after approval','Feature current sale products'],0),
('Local Direct Outreach','High Priority','Active','Direct relationship-building fits HC Apparel’s local business model.',array['Build prospect categories','Prepare helpful outreach scripts','Track genuine conversations'],0),
('Google Ads','Future / Paid','Future','Can capture high-intent searches when revenue supports a budget.',array['Keep disabled until Super Admin sets a paid budget'],0),
('Meta Ads','Future / Paid','Future','Can support future paid reach and retargeting.',array['Keep disabled until Super Admin sets a paid budget'],0),
('Paid Social Campaigns','Future / Paid','Future','May support launches after organic conversion is proven.',array['Keep disabled until Super Admin sets a paid budget'],0)
on conflict (channel) do nothing;

insert into public.marketing_tasks(title,channel,why_it_matters,assigned_to,priority,status,action_type,is_seed) values
('Complete Google Business verification','Google Business Profile','Required before the profile can become a reliable local discovery channel.','King Terik','Critical','To Do','Setup',true),
('Add HC Apparel products to Google Business','Google Business Profile','Shows real offerings directly in local search.','King Terik','High','To Do','Content',true),
('Upload logo and product photos to Google Business','Google Business Profile','Complete visuals improve trust and profile usefulness.','YHO / Mario','High','To Do','Content',true),
('Publish first Google Business post','Google Business Profile','Starts a consistent organic update rhythm.','King Terik','High','To Do','Content',true),
('Request first genuine customer review','Google Business Profile','Authentic reviews build local proof.','King Terik','High','Waiting','Outreach',true),
('Audit homepage title and description','SEO / GEO','Strong metadata clarifies the storefront for search engines.','YHO / Mario','High','To Do','SEO Audit',true),
('Audit product-page metadata','SEO / GEO','Product discovery depends on complete unique metadata.','YHO / Mario','High','To Do','SEO Audit',true),
('Audit brand-page metadata','SEO / GEO','Brand landing pages should be distinct and indexable.','YHO / Mario','High','To Do','SEO Audit',true),
('Create search-friendly category copy','SEO / GEO','Useful category context improves search understanding.','King Terik','Medium','To Do','Copywriting',true),
('Review schema and structured data','SEO / GEO','Structured data helps search engines understand products and business information.','YHO / Mario','High','To Do','Technical SEO',true),
('Review sitemap','SEO / GEO','A current sitemap helps discovery of public catalog pages.','YHO / Mario','Medium','To Do','Technical SEO',true),
('Review robots.txt','SEO / GEO','Robots rules must not block public storefront discovery.','YHO / Mario','Medium','To Do','Technical SEO',true),
('Create Facebook profile checklist','Facebook','A complete profile supports organic local outreach.','King Terik','Medium','To Do','Setup',true),
('Create Instagram checklist','Instagram','A consistent profile makes product content easier to trust.','King Terik','Medium','To Do','Setup',true),
('Create TikTok checklist','TikTok / Reels','A repeatable setup reduces friction for short video.','YHO / Mario','Medium','To Do','Setup',true),
('Prepare first launch post','Instagram','Introduces HC Apparel without paid promotion.','King Terik','High','To Do','Content',true),
('Prepare first product-feature post','Instagram','Connects a real product to a customer need.','YHO / Mario','High','To Do','Content',true),
('Prepare first S&S Sale Picks post','Facebook','Turns current vendor sales into useful organic content.','YHO / Mario','High','To Do','Content',true),
('Prepare custom-printing post','Facebook','Explains the service to teams and small businesses.','King Terik','High','To Do','Content',true),
('Review subscriber collection','Email Marketing','Confirms consented subscriber growth is working.','King Terik','High','To Do','Audit',true),
('Prepare welcome email','Email Marketing','Welcomes subscribers after separate send approval.','YHO / Mario','Medium','To Do','Email Draft',true),
('Prepare first product announcement email','Email Marketing','Creates a reusable product announcement format.','YHO / Mario','Medium','To Do','Email Draft',true),
('Prepare S&S Sale Picks email','Email Marketing','Highlights current value without paid media.','YHO / Mario','Medium','To Do','Email Draft',true),
('Build local outreach prospect categories','Local Direct Outreach','Organizes outreach without scraping or spam.','King Terik','High','To Do','Research',true)
on conflict (title) do nothing;

insert into public.marketing_google_business_items(item) values
('Verification complete'),('Business description added'),('Website linked'),('Phone added'),('Hours added'),('Products added'),('Photos added'),('First post published'),('Reviews requested')
on conflict (item) do nothing;

insert into public.marketing_goals(metric) values
('Website visitors'),('Account signups'),('Add to cart'),('Purchases'),('Quote requests'),('Subscribers'),('Google Business interactions')
on conflict (metric) do nothing;

insert into public.marketing_seo_pages(page_name,path) values
('Homepage','/'),('Category pages','/ShopGarments'),('Brand pages','/brand/:slug'),('Product pages','/ProductDetail'),('Custom Printing','/CustomPrinting'),('Bulk Quote','/RequestQuote'),('Contact','/Contact')
on conflict (page_name) do nothing;

insert into public.marketing_content_ideas(category,idea) values
('Product Spotlight','Affordable blank hoodies for your brand'),
('Business Tips','3 blanks that work well for business uniforms'),
('Brand Spotlight','What’s the difference between Gildan and Comfort Colors?'),
('S&S Sale Picks','Current S&S sale picks at HC Apparel'),
('Local Business','Blank polos for teams and businesses')
on conflict (idea) do nothing;

create or replace function public.log_marketing_event(p_event_name text, p_product_id text default null, p_product_name text default null, p_source text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_event_name not in ('page_view','product_view','brand_view','category_view','account_signup','login','add_to_cart','remove_from_cart','checkout_started','shipping_quote_success','payment_method_selected','sale_promo_clicked','search_used','track_order_used') then return; end if;
  if not coalesce((select internal_analytics_enabled from public.marketing_settings where id = true), false) then return; end if;
  insert into public.marketing_events (event_name, product_id, product_name, source, path)
  values (p_event_name, left(p_product_id, 100), left(p_product_name, 180), left(p_source, 80), left(p_source, 500));
end;
$$;
revoke all on function public.log_marketing_event(text,text,text,text) from public;
grant execute on function public.log_marketing_event(text,text,text,text) to anon, authenticated;

create or replace function public.marketing_record_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare event_type text;
begin
  if tg_table_name = 'orders' then
    if new.is_sample or new.payment_status <> 'paid' or new.status in ('canceled','refunded') then return new; end if;
    if tg_op = 'UPDATE' and old.payment_status = 'paid' then return new; end if;
    event_type := 'purchase_completed';
  elsif tg_table_name = 'quote_requests' then
    if new.is_sample then return new; end if;
    event_type := 'quote_request_submitted';
  elsif tg_table_name = 'contact_messages' then
    if new.is_sample then return new; end if;
    event_type := 'contact_submitted';
  elsif tg_table_name = 'social_studio_posts' then
    if tg_op = 'INSERT' then event_type := 'social_post_created';
    elsif new.buffer_post_id is not null and old.buffer_post_id is null then event_type := 'social_post_sent_to_buffer';
    else return new; end if;
  end if;
  if event_type is not null and coalesce((select internal_analytics_enabled from public.marketing_settings where id = true), false) then
    insert into public.marketing_events(event_name, source, dedupe_key)
    values (event_type, tg_table_name, event_type || ':' || new.id::text)
    on conflict (dedupe_key) do nothing;
  end if;
  return new;
end;
$$;

alter table public.marketing_settings drop constraint if exists marketing_settings_paid_budget_guard;
alter table public.marketing_settings add constraint marketing_settings_paid_budget_guard
  check (monthly_paid_budget > 0 or paid_advertising_enabled = false);

create or replace function public.marketing_paid_spend_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare paid_enabled boolean; paid_budget numeric;
begin
  select paid_advertising_enabled, monthly_paid_budget into paid_enabled, paid_budget from public.marketing_settings where id = true;
  if tg_table_name = 'marketing_channels' and new.channel in ('Google Ads','Meta Ads','Paid Social Campaigns') and (not coalesce(paid_enabled,false) or coalesce(paid_budget,0) <= 0) then
    new.status := 'Future'; new.monthly_budget := 0;
  elsif tg_table_name = 'marketing_campaigns' and coalesce(new.budget,0) > 0 and (not coalesce(paid_enabled,false) or coalesce(paid_budget,0) <= 0) then
    raise exception 'Paid campaign budget requires an enabled paid advertising budget.';
  end if;
  return new;
end;
$$;
drop trigger if exists marketing_channels_paid_guard on public.marketing_channels;
create trigger marketing_channels_paid_guard before insert or update on public.marketing_channels for each row execute function public.marketing_paid_spend_guard();
drop trigger if exists marketing_campaigns_paid_guard on public.marketing_campaigns;
create trigger marketing_campaigns_paid_guard before insert or update on public.marketing_campaigns for each row execute function public.marketing_paid_spend_guard();

insert into public.marketing_campaigns(campaign,channel,goal,status,budget) values
('HC Apparel Launch','Organic','Introduce HC Apparel and establish reliable baseline engagement.','Planning',0),
('S&S Sale Picks','Organic','Feature current verified sale products.','Planning',0),
('Fall Apparel','Organic','Highlight seasonal apparel when inventory supports it.','Planning',0),
('Custom Printing','Organic','Explain custom-printing services to teams and businesses.','Planning',0),
('Business Uniforms','Organic','Reach organizations that need branded staff apparel.','Planning',0),
('Bulk Orders','Organic','Promote the bulk quote workflow to qualified organizations.','Planning',0)
on conflict do nothing;

update public.marketing_tasks
set notes = 'Prospect categories: Schools; Churches; Sports teams; Family reunions; Landscapers; Contractors; Cleaning companies; Local businesses; Creators; Event organizers. Do not scrape or spam.'
where title = 'Build local outreach prospect categories' and coalesce(notes,'') = '';

commit;