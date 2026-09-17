begin;

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  title text not null,
  email text,
  email_is_placeholder boolean not null default false,
  responsibilities text[] not null default '{}',
  calendar_assignment text not null default 'Primary HC Apparel calendar',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.team_members (name, title, email, email_is_placeholder, responsibilities, calendar_assignment)
values
  ('King Terik', 'CEO / CTO', 'heartfamilyco@gmail.com', false,
    array['Site/admin oversight','Technical systems','Pricing rules','Vendor integrations','Final approval on live S&S submissions','Business strategy','Calendar/admin ownership'], 'heartfamilyco@gmail.com'),
  ('YHO / Mario', 'VP of Operations', 'yho@ilovehcapparel.net', true,
    array['Operations','Order preparation','Fulfillment coordination','Vendor order review','Production scheduling','Delivery/pickup coordination','Customer/order follow-ups'], 'Internal tasks; shared primary calendar, no separate Google login')
on conflict (name) do nothing;

create table if not exists public.productivity_tasks (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id),
  assigned_to uuid references public.team_members(id),
  related_order_id text, related_quote_id text, related_customer_id text, related_vendor_draft_id text,
  title text not null, description text not null default '',
  status text not null default 'suggested' check (status in ('suggested','approved','scheduled','completed','dismissed')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  due_date timestamptz, scheduled_start timestamptz, scheduled_end timestamptz,
  calendar_event_id text, calendar_id text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.calendar_event_suggestions (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id), assigned_to uuid references public.team_members(id),
  related_order_id text, related_quote_id text, related_customer_id text, related_vendor_draft_id text,
  title text not null, description text not null default '', reason text not null default '',
  status text not null default 'suggested' check (status in ('suggested','approved','scheduled','completed','dismissed')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  due_date timestamptz, scheduled_start timestamptz, scheduled_end timestamptz,
  calendar_event_id text, calendar_id text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.created_calendar_events (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id), suggestion_id uuid unique references public.calendar_event_suggestions(id),
  assigned_to uuid references public.team_members(id),
  related_order_id text, related_quote_id text, related_customer_id text, related_vendor_draft_id text,
  title text not null, description text not null default '',
  status text not null default 'scheduled' check (status in ('suggested','approved','scheduled','completed','dismissed')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  due_date timestamptz, scheduled_start timestamptz not null, scheduled_end timestamptz not null,
  calendar_event_id text not null, calendar_id text not null, event_url text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- Service-role-only credentials. Never grant this table to browser roles.
create table if not exists public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique references auth.users(id),
  google_email text not null, selected_calendar_id text, selected_calendar_name text,
  encrypted_access_token text not null, encrypted_refresh_token text not null,
  access_expires_at timestamptz not null,
  connected_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.calendar_oauth_states (
  state_hash text primary key, owner_user_id uuid not null references auth.users(id),
  expires_at timestamptz not null, created_at timestamptz not null default now()
);

alter table public.team_members enable row level security;
alter table public.productivity_tasks enable row level security;
alter table public.calendar_event_suggestions enable row level security;
alter table public.created_calendar_events enable row level security;
alter table public.calendar_connections enable row level security;
alter table public.calendar_oauth_states enable row level security;

create policy team_members_admin on public.team_members for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy productivity_tasks_admin on public.productivity_tasks for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy calendar_event_suggestions_admin on public.calendar_event_suggestions for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy created_calendar_events_admin on public.created_calendar_events for select to authenticated using (public.is_admin());

revoke all on public.team_members, public.productivity_tasks, public.calendar_event_suggestions,
  public.created_calendar_events, public.calendar_connections, public.calendar_oauth_states from anon, authenticated;
grant select on public.team_members, public.created_calendar_events to authenticated;
grant select, insert, update on public.productivity_tasks, public.calendar_event_suggestions to authenticated;
grant all on public.team_members, public.productivity_tasks, public.calendar_event_suggestions,
  public.created_calendar_events, public.calendar_connections, public.calendar_oauth_states to service_role;
-- RLS above still requires is_admin for every browser read/write.
commit;
