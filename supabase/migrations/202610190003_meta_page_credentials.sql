begin;
create table if not exists public.marketing_meta_page_credentials (
  page_key text primary key references public.marketing_page_scopes(page_key),
  ciphertext text not null,
  iv text not null,
  granted_scopes text[] not null default '{}',
  page_id text not null,
  updated_at timestamptz not null default now()
);
alter table public.marketing_meta_page_credentials enable row level security;
revoke all on public.marketing_meta_page_credentials from anon, authenticated;
grant all on public.marketing_meta_page_credentials to service_role;
commit;
