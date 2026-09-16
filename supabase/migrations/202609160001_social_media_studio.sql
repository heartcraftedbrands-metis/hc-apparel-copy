begin;

create table if not exists public.social_studio_posts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  platform text not null check (platform in ('instagram', 'facebook', 'x')),
  content_type text not null,
  brand text not null,
  product_id text,
  product_name text,
  tone text not null,
  audience text not null,
  caption_length text not null,
  cta text not null,
  include_hashtags boolean not null default true,
  notes text not null default '',
  image_prompt text not null default '',
  source_image_url text,
  image_url text,
  caption text not null default '',
  hashtags text not null default '',
  status text not null default 'draft' check (status in ('draft', 'sent_to_buffer', 'scheduled', 'posted')),
  buffer_post_id text,
  buffer_channel_id text,
  scheduled_at timestamptz,
  sent_to_buffer_at timestamptz
);

create index if not exists social_studio_posts_created_at_idx
  on public.social_studio_posts (created_at desc);

alter table public.social_studio_posts enable row level security;
create policy social_studio_posts_admin_all on public.social_studio_posts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update on public.social_studio_posts to authenticated;
grant all on public.social_studio_posts to service_role;

-- Only the server-side service role can read this encrypted credential row.
create table if not exists public.social_studio_buffer_credentials (
  id boolean primary key default true check (id),
  ciphertext text not null,
  iv text not null,
  updated_at timestamptz not null default now()
);
alter table public.social_studio_buffer_credentials enable row level security;
revoke all on public.social_studio_buffer_credentials from anon, authenticated;
grant all on public.social_studio_buffer_credentials to service_role;

commit;
