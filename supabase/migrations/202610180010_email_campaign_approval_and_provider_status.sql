begin;

alter table public.marketing_email_campaigns
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists provider_scheduled_at timestamptz;

create index if not exists marketing_email_campaigns_provider_campaign_id_idx
  on public.marketing_email_campaigns(provider_campaign_id)
  where provider_campaign_id is not null;

commit;
