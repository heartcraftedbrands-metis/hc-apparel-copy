begin;
alter table public.marketing_approval_requests
  add column if not exists approval_source text,
  add column if not exists approval_source_reference text,
  add column if not exists approval_evidence text;
alter table public.marketing_approval_requests
  drop constraint if exists marketing_approval_requests_approval_source_check;
alter table public.marketing_approval_requests
  add constraint marketing_approval_requests_approval_source_check
  check (approval_source is null or approval_source in ('marketing_center','approval_email','codex_conversation'));
comment on column public.marketing_approval_requests.approval_source is
  'Authenticated channel where the exact content version was explicitly approved.';
comment on column public.marketing_approval_requests.approval_source_reference is
  'Non-secret audit reference for the approval channel, such as a Codex conversation reference.';
comment on column public.marketing_approval_requests.approval_evidence is
  'The explicit approval statement supplied by the authenticated administrator.';
commit;
