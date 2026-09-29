begin;

alter table public.marketing_social_content
  add column if not exists active_schedule boolean not null default true,
  add column if not exists original_platform text,
  add column if not exists inactive_channel_reason text;

-- Keep the original row and ID while reassigning useful launch drafts to
-- active channels. original_platform retains the Meta history without making
-- duplicate campaign drafts.
with conversions as (
  select content.id,
    case
      when content.platform='Facebook' and content.day_number=1 then 'X'
      when content.platform='Instagram' and content.day_number=1 then 'LinkedIn'
      when content.platform='Facebook' and content.day_number=2 then 'Pinterest'
      when content.platform='Instagram' and content.day_number=3 then 'YouTube Shorts'
      when content.platform='Facebook' and content.day_number=4 then 'YouTube Shorts'
      when content.platform='Instagram' and content.day_number=5 then 'LinkedIn'
      when content.platform='Facebook' and content.day_number=7 then 'X'
    end as target_platform
  from public.marketing_social_content content
  join public.marketing_campaigns campaign on campaign.id=content.campaign_id
  where campaign.campaign_key='hc_apparel_organic_launch'
    and content.platform in ('Facebook','Instagram')
    and content.status not in ('Published','Archived')
), mapped as (
  select conversions.*,
    case target_platform when 'X' then 'x' when 'Pinterest' then 'pinterest' when 'LinkedIn' then 'linkedin' when 'YouTube Shorts' then 'youtube' end as target_source,
    case target_platform when 'YouTube Shorts' then 'organic_video' else 'organic_social' end as target_medium
  from conversions where target_platform is not null
)
update public.marketing_social_content content set
  original_platform=content.platform,
  platform=mapped.target_platform,
  active_schedule=true,
  inactive_channel_reason=null,
  account_handle=account.handle,
  account_profile_url=account.profile_url,
  utm_source=mapped.target_source,
  utm_medium=mapped.target_medium,
  tracking_url=regexp_replace(
    regexp_replace(content.tracking_url,'utm_source=[^&]*','utm_source='||mapped.target_source),
    'utm_medium=[^&]*','utm_medium='||mapped.target_medium
  ),
  recommended_format=case when mapped.target_platform='YouTube Shorts' then 'Vertical short-form video' else content.recommended_format end,
  recommended_dimensions=case when mapped.target_platform='YouTube Shorts' then '1080 × 1920 px (9:16)' else content.recommended_dimensions end
from mapped
left join public.marketing_social_accounts account on account.platform=mapped.target_platform
where content.id=mapped.id;

-- Any Meta item not converted above stays available as history, but cannot
-- appear in today's work, the active calendar, approvals, or next-week output.
update public.marketing_social_content
set active_schedule=false,
    inactive_channel_reason='Inactive Channel',
    status=case when status='Published' then status else 'Archived' end
where platform in ('Facebook','Instagram');

update public.marketing_social_accounts
set status='Active',
    notes=case
      when platform in ('LinkedIn','YouTube Shorts') then 'Active organic strategy channel. Add the confirmed profile URL or handle when available.'
      else notes
    end
where platform in ('TikTok','X','Pinterest','LinkedIn','YouTube Shorts');

update public.marketing_channels
set status='Active', monthly_budget=0
where channel in ('TikTok / Reels','X','Pinterest','LinkedIn','YouTube Shorts');

update public.marketing_channels
set status='Future', monthly_budget=0
where channel in ('Facebook','Instagram','Meta Ads');

create index if not exists marketing_social_content_active_schedule_idx
  on public.marketing_social_content(campaign_id,active_schedule,planned_date);

commit;
