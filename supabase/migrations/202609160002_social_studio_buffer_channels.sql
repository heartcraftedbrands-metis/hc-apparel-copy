-- Allow Studio drafts for the Buffer platforms available in the channel picker.
alter table public.social_studio_posts
  drop constraint if exists social_studio_posts_platform_check;

alter table public.social_studio_posts
  add constraint social_studio_posts_platform_check
  check (platform in (
    'instagram', 'facebook', 'x', 'pinterest', 'tiktok', 'linkedin',
    'youtube', 'threads', 'bluesky', 'google'
  ));
