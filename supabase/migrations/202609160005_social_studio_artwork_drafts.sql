begin;

alter table public.social_studio_posts
  add column if not exists image_mode text not null default 'lifestyle',
  add column if not exists artwork_path text;

update public.social_studio_posts
set image_mode = 'product'
where source_image_url is not null and source_image_url = image_url;

alter table public.social_studio_posts
  add constraint social_studio_posts_image_mode_check
  check (image_mode in ('product', 'lifestyle', 'artwork'));

create table if not exists public.social_studio_draft_audit (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_id uuid not null references auth.users(id),
  post_id uuid not null,
  action text not null check (action in ('duplicated', 'deleted', 'artwork_replaced')),
  details jsonb not null default '{}'::jsonb
);

alter table public.social_studio_draft_audit enable row level security;
create policy social_studio_draft_audit_admin_read on public.social_studio_draft_audit
  for select to authenticated using (public.is_admin());
grant select on public.social_studio_draft_audit to authenticated;
grant all on public.social_studio_draft_audit to service_role;

commit;
