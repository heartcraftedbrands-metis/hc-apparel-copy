create table if not exists public.brand_pages (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  tagline text not null default '',
  description text not null default '',
  hero_image_url text,
  logo_url text,
  categories text[] not null default '{}',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.brand_pages enable row level security;
drop policy if exists brand_pages_public_read on public.brand_pages;
create policy brand_pages_public_read on public.brand_pages
  for select to anon, authenticated using (is_active or public.is_admin());
drop policy if exists brand_pages_admin_write on public.brand_pages;
create policy brand_pages_admin_write on public.brand_pages
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.brand_pages to anon, authenticated;
grant insert, update, delete on public.brand_pages to authenticated;
