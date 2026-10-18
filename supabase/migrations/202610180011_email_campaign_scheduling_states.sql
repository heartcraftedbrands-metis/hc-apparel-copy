begin;

alter table public.marketing_email_campaigns
  drop constraint if exists marketing_email_campaigns_status_check;

alter table public.marketing_email_campaigns
  add constraint marketing_email_campaigns_status_check
  check (status in ('Idea','Draft','Ready','Scheduling','Scheduled','Sent','Failed','Archived'));

commit;
