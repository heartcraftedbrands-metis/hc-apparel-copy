begin;

alter table public.design_preview_cart_items
  add column if not exists archived_at timestamptz,
  add column if not exists purge_after timestamptz,
  add column if not exists archive_reason text,
  add constraint design_preview_cart_six_month_retention
    check (
      (archived_at is null and purge_after is null)
      or purge_after = archived_at + interval '6 months'
    ) not valid;

create index if not exists design_preview_cart_active_owner_idx
  on public.design_preview_cart_items(owner_user_id, updated_at desc)
  where archived_at is null;

commit;
