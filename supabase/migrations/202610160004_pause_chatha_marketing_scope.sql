begin;

alter table public.marketing_page_scopes
  drop constraint if exists marketing_page_scopes_posting_status_check;
alter table public.marketing_page_scopes
  add constraint marketing_page_scopes_posting_status_check
  check (posting_status in ('unverified','connected','needs_authorization','paused'));

update public.marketing_page_scopes
set posting_status = 'paused',
    verification_notes = 'Paused by owner to remain on the current Buffer plan. Preserve configuration for later; do not prompt for an upgrade or paid trial.',
    updated_at = now()
where page_key = 'chatha_al_terik';

commit;
