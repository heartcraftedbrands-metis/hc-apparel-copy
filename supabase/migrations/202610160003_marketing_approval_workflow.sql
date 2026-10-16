begin;

create table if not exists public.marketing_page_scopes (
  page_key text primary key check (page_key in ('hc_apparel','chatha_al_terik')),
  display_name text not null,
  expected_channel_name text not null,
  voice_notes text not null default '',
  buffer_channel_id text,
  posting_status text not null default 'unverified' check (posting_status in ('unverified','connected','needs_authorization')),
  messaging_status text not null default 'not_connected' check (messaging_status in ('not_connected','connected','permission_missing')),
  verification_notes text,
  verified_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.marketing_page_scopes(page_key,display_name,expected_channel_name,voice_notes)
values
  ('hc_apparel','HC Apparel','HC Apparel','Warm, clear, practical, community-minded, and confident. Use only verified business and catalog facts.'),
  ('chatha_al_terik','Chatha Al-Terik','Chatha Al-Terik','Inspiring and reflective. Preserve the submitted quote meaning and keep this Page separate from HC Apparel.')
on conflict (page_key) do nothing;

create table if not exists public.marketing_approval_requests (
  id uuid primary key default gen_random_uuid(),
  page_key text not null references public.marketing_page_scopes(page_key),
  request_type text not null check (request_type in ('post','chat_reply')),
  source_kind text not null default 'draft' check (source_kind in ('draft','photo','quote','incoming_chat','controlled_test')),
  source_material text,
  proposed_content text not null,
  image_path text,
  image_url text,
  context jsonb not null default '{}'::jsonb,
  conversation_id text,
  incoming_message_id text,
  incoming_message_at timestamptz,
  content_version integer not null default 1 check (content_version > 0),
  content_hash text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','scheduled','sending','sent','failed','outdated')),
  scheduled_at timestamptz,
  approved_version integer,
  approved_hash text,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  linked_post_id uuid references public.social_studio_posts(id) on delete set null,
  platform_request_id text,
  delivery_status text,
  failure_reason text,
  idempotency_key uuid not null default gen_random_uuid() unique,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_approval_exact_approval check (
    (status not in ('approved','scheduled','sending','sent')) or
    (approved_version = content_version and approved_hash = content_hash and approved_by is not null and approved_at is not null)
  )
);

create unique index if not exists marketing_approval_post_version_unique
  on public.marketing_approval_requests(linked_post_id,content_version)
  where linked_post_id is not null;
create index if not exists marketing_approval_queue_idx
  on public.marketing_approval_requests(status,page_key,created_at desc);
create unique index if not exists marketing_approval_conversation_message_unique
  on public.marketing_approval_requests(page_key,conversation_id,incoming_message_id)
  where request_type = 'chat_reply' and incoming_message_id is not null;

create table if not exists public.marketing_approval_notifications (
  id uuid primary key default gen_random_uuid(),
  approval_request_id uuid not null references public.marketing_approval_requests(id) on delete cascade,
  content_version integer not null,
  recipient text not null,
  notification_type text not null default 'approval_request' check (notification_type = 'approval_request'),
  provider_message_id text,
  status text not null default 'pending' check (status in ('pending','accepted','failed','uncertain')),
  failure_reason text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique(approval_request_id,content_version,recipient,notification_type)
);

create table if not exists public.marketing_approval_events (
  id uuid primary key default gen_random_uuid(),
  approval_request_id uuid not null references public.marketing_approval_requests(id) on delete cascade,
  content_version integer not null,
  actor_id uuid references auth.users(id),
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

alter table public.marketing_page_scopes enable row level security;
alter table public.marketing_approval_requests enable row level security;
alter table public.marketing_approval_notifications enable row level security;
alter table public.marketing_approval_events enable row level security;

drop policy if exists marketing_page_scopes_admin on public.marketing_page_scopes;
create policy marketing_page_scopes_admin on public.marketing_page_scopes for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists marketing_approval_requests_admin on public.marketing_approval_requests;
create policy marketing_approval_requests_admin on public.marketing_approval_requests for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists marketing_approval_notifications_admin on public.marketing_approval_notifications;
create policy marketing_approval_notifications_admin on public.marketing_approval_notifications for select to authenticated using (public.is_admin());
drop policy if exists marketing_approval_events_admin on public.marketing_approval_events;
create policy marketing_approval_events_admin on public.marketing_approval_events for select to authenticated using (public.is_admin());

revoke all on public.marketing_page_scopes, public.marketing_approval_requests, public.marketing_approval_notifications, public.marketing_approval_events from anon, authenticated;
grant select, insert, update on public.marketing_page_scopes, public.marketing_approval_requests to authenticated;
grant select on public.marketing_approval_notifications, public.marketing_approval_events to authenticated;
grant all on public.marketing_page_scopes, public.marketing_approval_requests, public.marketing_approval_notifications, public.marketing_approval_events to service_role;

commit;
