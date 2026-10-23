begin;
alter table public.marketing_approval_requests drop constraint if exists marketing_approval_requests_request_type_check;
alter table public.marketing_approval_requests add constraint marketing_approval_requests_request_type_check
  check (request_type in ('post','chat_reply','comment_reply'));
create table if not exists public.marketing_meta_threads (
  id uuid primary key default gen_random_uuid(),
  page_key text not null references public.marketing_page_scopes(page_key),
  channel text not null check (channel in ('messenger','facebook_comment')),
  provider_thread_id text not null,
  provider_customer_id text,
  customer_name text,
  provider_post_id text,
  latest_incoming_id text,
  latest_incoming_at timestamptz,
  response_window_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(page_key,channel,provider_thread_id)
);
create table if not exists public.marketing_meta_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.marketing_meta_threads(id) on delete cascade,
  provider_message_id text not null unique,
  direction text not null check (direction in ('incoming','outgoing')),
  body text not null default '',
  provider_created_at timestamptz not null,
  provider_parent_id text,
  raw_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.marketing_meta_deliveries (
  id uuid primary key default gen_random_uuid(),
  approval_request_id uuid not null references public.marketing_approval_requests(id),
  content_version integer not null,
  idempotency_key text not null unique,
  provider_message_id text,
  status text not null check (status in ('sending','accepted','delivered','failed','uncertain')),
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(approval_request_id,content_version)
);
alter table public.marketing_meta_threads enable row level security;
alter table public.marketing_meta_messages enable row level security;
alter table public.marketing_meta_deliveries enable row level security;
create policy marketing_meta_threads_admin on public.marketing_meta_threads for select to authenticated using (public.is_admin());
create policy marketing_meta_messages_admin on public.marketing_meta_messages for select to authenticated using (public.is_admin());
create policy marketing_meta_deliveries_admin on public.marketing_meta_deliveries for select to authenticated using (public.is_admin());
revoke all on public.marketing_meta_threads, public.marketing_meta_messages, public.marketing_meta_deliveries from anon, authenticated;
grant select on public.marketing_meta_threads, public.marketing_meta_messages, public.marketing_meta_deliveries to authenticated;
grant all on public.marketing_meta_threads, public.marketing_meta_messages, public.marketing_meta_deliveries to service_role;
create index if not exists marketing_meta_threads_latest_idx on public.marketing_meta_threads(page_key,latest_incoming_at desc);
create index if not exists marketing_meta_messages_thread_idx on public.marketing_meta_messages(thread_id,provider_created_at);
commit;
