begin;

alter table public.marketing_campaigns
  add column if not exists campaign_key text,
  add column if not exists platforms text[] not null default '{}',
  add column if not exists campaign_notes text,
  add column if not exists automatic_publishing_enabled boolean not null default false,
  add column if not exists publishing_frequency_per_week integer not null default 2,
  add column if not exists publishing_timezone text not null default 'America/New_York',
  add column if not exists facebook_channel_id text,
  add column if not exists pinterest_channel_id text,
  add column if not exists pinterest_board_id text,
  add column if not exists pinterest_board_name text,
  add column if not exists authorization_scope jsonb not null default '{}'::jsonb,
  add column if not exists emergency_stopped_at timestamptz,
  add column if not exists authorized_at timestamptz,
  add column if not exists authorized_by uuid references auth.users(id);

alter table public.marketing_campaigns drop constraint if exists marketing_campaigns_frequency_check;
alter table public.marketing_campaigns add constraint marketing_campaigns_frequency_check
  check (publishing_frequency_per_week between 1 and 14);
alter table public.marketing_campaigns drop constraint if exists marketing_campaigns_platforms_check;
alter table public.marketing_campaigns add constraint marketing_campaigns_platforms_check
  check (platforms <@ array['facebook','pinterest']::text[]);
alter table public.marketing_campaigns drop constraint if exists marketing_campaigns_status_check;
alter table public.marketing_campaigns add constraint marketing_campaigns_status_check
  check (status in ('Planning','Active','Paused','Completed','Archived','Cancelled'));

create unique index if not exists marketing_campaigns_key_unique
  on public.marketing_campaigns(campaign_key) where campaign_key is not null;

create table if not exists public.marketing_agent_settings (
  id boolean primary key default true check (id),
  emergency_stop boolean not null default false,
  inbound_reply_generation_enabled boolean not null default false check (inbound_reply_generation_enabled = false),
  incoming_comment_triggers_enabled boolean not null default false check (incoming_comment_triggers_enabled = false),
  direct_messages_enabled boolean not null default false check (direct_messages_enabled = false),
  standalone_comment_scope text not null default 'own_published_posts_only'
    check (standalone_comment_scope = 'own_published_posts_only'),
  timezone text not null default 'America/New_York' check (timezone = 'America/New_York'),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.marketing_agent_settings(id) values (true) on conflict (id) do nothing;

create table if not exists public.marketing_trend_research (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  source_type text not null check (source_type in ('Official Platform','Platform Insight','Public Research')),
  source_title text not null,
  source_url text not null,
  observed_at timestamptz not null,
  evidence_summary text not null,
  asset_fit text not null,
  recommendation_type text not null check (recommendation_type in ('Observed evidence','Experiment')),
  keywords text[] not null default '{}',
  aggregate_audience text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_url, observed_at, evidence_summary)
);

alter table public.social_studio_posts
  add column if not exists campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  add column if not exists workflow_status text not null default 'Draft',
  add column if not exists post_title text,
  add column if not exists post_description text,
  add column if not exists alt_text text,
  add column if not exists keywords text[] not null default '{}',
  add column if not exists destination_url text,
  add column if not exists tracking_url text,
  add column if not exists source_asset_path text,
  add column if not exists derivative_asset_path text,
  add column if not exists platform_post_id text,
  add column if not exists platform_live_url text,
  add column if not exists selected_channel_name text,
  add column if not exists pinterest_board_id text,
  add column if not exists pinterest_board_name text,
  add column if not exists schedule_timezone text not null default 'America/New_York',
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id),
  add column if not exists publishing_started_at timestamptz,
  add column if not exists published_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists failure_reason text,
  add column if not exists retry_count integer not null default 0,
  add column if not exists last_revalidated_at timestamptz,
  add column if not exists idempotency_key uuid not null default gen_random_uuid(),
  add column if not exists metrics jsonb not null default '{}'::jsonb,
  add column if not exists metrics_source text,
  add column if not exists metrics_retrieved_at timestamptz,
  add column if not exists verification_snapshot jsonb not null default '{}'::jsonb;

alter table public.social_studio_posts drop constraint if exists social_studio_posts_workflow_status_check;
alter table public.social_studio_posts add constraint social_studio_posts_workflow_status_check
  check (workflow_status in ('Draft','Approved','Scheduled','Publishing','Published','Failed','Cancelled'));
alter table public.social_studio_posts drop constraint if exists social_studio_posts_schedule_timezone_check;
alter table public.social_studio_posts add constraint social_studio_posts_schedule_timezone_check
  check (schedule_timezone = 'America/New_York');
alter table public.social_studio_posts drop constraint if exists social_studio_posts_retry_count_check;
alter table public.social_studio_posts add constraint social_studio_posts_retry_count_check check (retry_count between 0 and 20);

create unique index if not exists social_studio_posts_idempotency_unique
  on public.social_studio_posts(idempotency_key);
create index if not exists social_studio_posts_campaign_workflow_idx
  on public.social_studio_posts(campaign_id, workflow_status, scheduled_at);

create table if not exists public.marketing_agent_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_id uuid references auth.users(id),
  campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  post_id uuid references public.social_studio_posts(id) on delete set null,
  event_type text not null,
  from_status text,
  to_status text,
  platform_request_id text,
  details jsonb not null default '{}'::jsonb
);

create or replace function public.marketing_agent_validate_transition()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.workflow_status is not distinct from old.workflow_status then return new; end if;
  if not (
    (old.workflow_status = 'Draft' and new.workflow_status in ('Approved','Cancelled')) or
    (old.workflow_status = 'Approved' and new.workflow_status in ('Draft','Scheduled','Publishing','Cancelled')) or
    (old.workflow_status = 'Scheduled' and new.workflow_status in ('Publishing','Published','Failed','Cancelled')) or
    (old.workflow_status = 'Publishing' and new.workflow_status in ('Scheduled','Published','Failed','Cancelled')) or
    (old.workflow_status = 'Failed' and new.workflow_status in ('Approved','Publishing','Cancelled'))
  ) then
    raise exception 'Invalid marketing post workflow transition: % -> %', old.workflow_status, new.workflow_status;
  end if;
  return new;
end;
$$;

drop trigger if exists social_studio_posts_validate_workflow on public.social_studio_posts;
create trigger social_studio_posts_validate_workflow
  before update of workflow_status on public.social_studio_posts
  for each row execute function public.marketing_agent_validate_transition();

create or replace function public.marketing_agent_audit_transition()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.workflow_status is distinct from old.workflow_status then
    insert into public.marketing_agent_events(actor_id,campaign_id,post_id,event_type,from_status,to_status,platform_request_id)
    values (auth.uid(),new.campaign_id,new.id,'workflow_transition',old.workflow_status,new.workflow_status,new.platform_post_id);
  end if;
  return new;
end;
$$;

drop trigger if exists social_studio_posts_audit_workflow on public.social_studio_posts;
create trigger social_studio_posts_audit_workflow
  after update of workflow_status on public.social_studio_posts
  for each row execute function public.marketing_agent_audit_transition();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('marketing-private-assets','marketing-private-assets',false,10485760,array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

alter table public.marketing_agent_settings enable row level security;
alter table public.marketing_trend_research enable row level security;
alter table public.marketing_agent_events enable row level security;

drop policy if exists marketing_agent_settings_admin on public.marketing_agent_settings;
create policy marketing_agent_settings_admin on public.marketing_agent_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists marketing_trend_research_admin on public.marketing_trend_research;
create policy marketing_trend_research_admin on public.marketing_trend_research
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists marketing_agent_events_admin_read on public.marketing_agent_events;
create policy marketing_agent_events_admin_read on public.marketing_agent_events
  for select to authenticated using (public.is_admin());

revoke all on public.marketing_agent_settings, public.marketing_trend_research, public.marketing_agent_events from anon, authenticated;
grant select, insert, update on public.marketing_agent_settings, public.marketing_trend_research to authenticated;
grant select on public.marketing_agent_events to authenticated;
grant all on public.marketing_agent_settings, public.marketing_trend_research, public.marketing_agent_events to service_role;

insert into public.marketing_trend_research(
  source_type,source_title,source_url,observed_at,evidence_summary,asset_fit,recommendation_type,keywords,aggregate_audience
) values
(
  'Official Platform','Pinterest Predicts 2026','https://business.pinterest.com/pdf/pinterest-predicts/2026-trend-report/',
  '2026-10-13T00:00:00-04:00','Pinterest identifies multiple 2026 fashion themes, including Cool Blue, Brooched, Glamoratti, Poetcore, Laced Up, Khaki Coded, and Throwback Kid.',
  'Use only when an uploaded asset or verified live product genuinely fits the color, styling, or audience context. The theme is creative direction, not a product claim.',
  'Observed evidence',array['fashion inspiration','apparel color stories','creator styling'],'Pinterest trend-report audience; aggregate only.'
),
(
  'Official Platform','Pinterest Trends API','https://developers.pinterest.com/docs/analytics-and-reports/trends/',
  '2026-10-13T00:00:00-04:00','Pinterest documents current keyword trend results with week-over-week, month-over-month, and year-over-year growth plus normalized time series.',
  'When a Pinterest API Trends connection is authorized, compare apparel, team, creator, mockup, and seasonal terms before recommending keywords or boards.',
  'Experiment',array['apparel blanks','team apparel','creator apparel','digital mockups'],'Use aggregate trend data; never identify or target individuals.'
),
(
  'Official Platform','Pinterest Audience Insights','https://developers.pinterest.com/docs/analytics-and-reports/audience-insights/',
  '2026-10-13T00:00:00-04:00','Pinterest documents aggregate total- and engaged-audience interest categories for business accounts.',
  'Use aggregate interests to evaluate owned Pinterest boards and formats. Do not message, tag, or profile individual people.',
  'Observed evidence',array['aggregate audience','owned boards','organic content'],'Business-account aggregate audiences only.'
)
on conflict (source_url,observed_at,evidence_summary) do nothing;

update public.marketing_social_accounts
set status = case when status = 'Inactive / Future' then 'Planned / Setup' else status end,
    notes = 'Connect the selected HC Apparel business Page as a Facebook channel in the existing Buffer account. Publishing remains blocked until that Page appears as an available connected channel.'
where platform = 'Facebook';

commit;
