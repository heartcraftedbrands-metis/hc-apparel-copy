begin;

create table if not exists public.marketing_social_accounts (
  id uuid primary key default gen_random_uuid(),
  platform text not null unique,
  handle text,
  profile_url text,
  status text not null check (status in ('Active','Planned / Setup','Inactive / Future','Separate Existing')),
  account_tier text not null default 'Secondary' check (account_tier in ('Primary','Secondary')),
  notes text,
  utm_source text not null,
  utm_medium text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.marketing_social_accounts enable row level security;
drop policy if exists marketing_social_accounts_admin on public.marketing_social_accounts;
create policy marketing_social_accounts_admin on public.marketing_social_accounts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.marketing_social_accounts from anon, authenticated;
grant select, insert, update, delete on public.marketing_social_accounts to authenticated;
grant all on public.marketing_social_accounts to service_role;
drop trigger if exists marketing_social_accounts_touch on public.marketing_social_accounts;
create trigger marketing_social_accounts_touch before update on public.marketing_social_accounts
  for each row execute function public.marketing_admin_touch_updated_at();

insert into public.marketing_social_accounts(platform,handle,profile_url,status,account_tier,notes,utm_source,utm_medium) values
('TikTok','@ilovehcapparel','https://www.tiktok.com/@ilovehcapparel','Active','Primary','Live HC Apparel short-form video account.','tiktok','organic_social'),
('X','@ilovehcapparel','https://x.com/ilovehcapparel','Active','Primary','Live HC Apparel account for product, teamwear, and business-apparel updates.','x','organic_social'),
('Pinterest',null,null,'Active','Secondary','Active organic discovery channel. Add the profile URL when confirmed.','pinterest','organic_social'),
('LinkedIn',null,null,'Planned / Setup','Secondary','Setup pending for business-apparel and local-business content.','linkedin','organic_social'),
('YouTube Shorts',null,null,'Planned / Setup','Secondary','Setup pending; adapt approved TikTok videos only after the channel is ready.','youtube','organic_video'),
('Facebook',null,null,'Inactive / Future','Secondary','Not part of the current active organic workflow.','facebook','organic_social'),
('Instagram',null,null,'Inactive / Future','Secondary','Not part of the current active organic workflow.','instagram','organic_social'),
('Google Business',null,null,'Separate Existing','Secondary','Tracked separately through the existing Google Business checklist.','google_business','organic')
on conflict (platform) do update set
  handle=excluded.handle,
  profile_url=coalesce(public.marketing_social_accounts.profile_url,excluded.profile_url),
  status=excluded.status,
  account_tier=excluded.account_tier,
  notes=excluded.notes,
  utm_source=excluded.utm_source,
  utm_medium=excluded.utm_medium;

alter table public.marketing_social_content
  add column if not exists account_handle text,
  add column if not exists account_profile_url text;
alter table public.marketing_social_content drop constraint if exists marketing_social_content_platform_check;
alter table public.marketing_social_content add constraint marketing_social_content_platform_check check (platform in (
  'Facebook','Instagram','TikTok','X','Pinterest','LinkedIn','YouTube Shorts','Google Business','Email','SEO / GEO','Local Outreach'
));

update public.marketing_social_content
set account_handle='@ilovehcapparel', account_profile_url='https://www.tiktok.com/@ilovehcapparel',
    utm_source='tiktok', utm_medium='organic_social'
where platform='TikTok';

update public.marketing_campaigns set
  channels=array['Google Business Profile','TikTok / Reels','X','Pinterest','LinkedIn','YouTube Shorts','Email','SEO / GEO','Local Outreach'],
  budget=0
where campaign_key='hc_apparel_organic_launch';

-- The original polymorphic trigger referenced campaign-only fields while handling
-- a channel row. Split the table branches so PostgreSQL never resolves a field
-- that does not exist on the active trigger record.
create or replace function public.marketing_paid_spend_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare paid_enabled boolean; paid_budget numeric;
begin
  select paid_advertising_enabled, monthly_paid_budget into paid_enabled, paid_budget
  from public.marketing_settings where id = true;
  if tg_table_name = 'marketing_channels' then
    if new.channel in ('Google Ads','Meta Ads','Paid Social Campaigns')
       and (not coalesce(paid_enabled,false) or coalesce(paid_budget,0) <= 0) then
      new.status := 'Future';
      new.monthly_budget := 0;
    end if;
  elsif tg_table_name = 'marketing_campaigns' then
    if coalesce(new.budget,0) > 0
       and (not coalesce(paid_enabled,false) or coalesce(paid_budget,0) <= 0) then
      raise exception 'Paid campaign budget requires an enabled paid advertising budget.';
    end if;
  end if;
  return new;
end;
$$;

insert into public.marketing_channels(channel,priority,status,why_it_matters,recommended_tactics,monthly_budget,notes) values
('X','High Priority','Active','Supports timely product, sports, teamwear, and business-apparel conversations.',array['Share useful product details','Feature sports and team apparel','Link to attributable product pages'],0,'Live account: @ilovehcapparel'),
('Pinterest','High Priority','Active','Creates durable organic discovery for apparel ideas and product collections.',array['Create product boards','Use current product images','Link pins to attributable storefront pages'],0,'Active; add the confirmed profile URL in Social Accounts.'),
('LinkedIn','High Priority','Future','Can reach businesses and organizations seeking staff apparel and branded teamwear.',array['Complete company profile','Prepare business-apparel posts','Use approved product links'],0,'Planned / Setup'),
('YouTube Shorts','High Priority','Future','Can extend approved short-form video content to search and video discovery.',array['Create the channel','Adapt approved TikTok videos','Use attributable product links'],0,'Planned / Setup')
on conflict (channel) do update set priority=excluded.priority,status=excluded.status,why_it_matters=excluded.why_it_matters,recommended_tactics=excluded.recommended_tactics,monthly_budget=0,notes=excluded.notes;

update public.marketing_channels set status='Active', notes='Live account: @ilovehcapparel', monthly_budget=0 where channel='TikTok / Reels';
update public.marketing_channels set status='Future', monthly_budget=0 where channel in ('Facebook','Instagram','Meta Ads');
update public.marketing_channels set status='Active', notes='Managed separately through the existing Google Business checklist.', monthly_budget=0 where channel='Google Business Profile';

update public.marketing_tasks set title='Organic Launch: TikTok account setup',status='Completed',notes='Campaign: HC Apparel Organic Launch. Live account: @ilovehcapparel.' where title='Organic Launch: Reserve TikTok username';
update public.marketing_tasks set status='Completed',notes='Live account: @ilovehcapparel.' where title='Create TikTok checklist';
update public.marketing_tasks set status='Dismissed',notes='Inactive / Future channel. Reactivate only after Super Admin changes the social account status.' where channel in ('Facebook','Instagram') and status not in ('Completed','Dismissed');

insert into public.marketing_tasks(title,channel,why_it_matters,assigned_to,priority,status,notes,action_type,is_seed) values
('Organic Launch: X account setup','X','Confirms the live account and attribution path for organic X content.','King Terik','High','Completed','Live account: @ilovehcapparel. Campaign: HC Apparel Organic Launch.','Setup',false),
('Organic Launch: Pinterest account active','Pinterest','Records Pinterest as an active organic discovery channel.','King Terik','Medium','Completed','Add the confirmed profile URL when available. Campaign: HC Apparel Organic Launch.','Setup',false),
('Set up HC Apparel LinkedIn','LinkedIn','Prepares a business-facing channel for uniforms, staff apparel, and organizations.','King Terik','Medium','To Do','Campaign: HC Apparel Organic Launch. No content will publish automatically.','Setup',false),
('Set up HC Apparel YouTube Shorts','YouTube Shorts','Creates a future home for approved vertical product and education videos.','YHO / Mario','Medium','To Do','Campaign: HC Apparel Organic Launch. No content will publish automatically.','Setup',false),
('Create first TikTok product video','TikTok / Reels','Starts the active short-form workflow with a real live product.','YHO / Mario','High','To Do','Use an approved campaign draft and keep the post manual.','Content',false),
('Adapt approved TikTok video for YouTube Shorts','YouTube Shorts','Reuses approved creative efficiently after YouTube setup is complete.','YHO / Mario','Medium','Waiting','Wait until the YouTube Shorts account is ready.','Content',false),
('Create X sports and team apparel post','X','Introduces live sports and teamwear products to the active X audience.','King Terik','High','To Do','Use current live product data and an attributable campaign link.','Content',false)
on conflict (title) do update set channel=excluded.channel,why_it_matters=excluded.why_it_matters,assigned_to=excluded.assigned_to,priority=excluded.priority,status=excluded.status,notes=excluded.notes,action_type=excluded.action_type;

commit;
