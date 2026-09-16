alter table public.social_studio_posts
  add column if not exists category text not null default '';
