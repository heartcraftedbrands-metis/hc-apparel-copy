begin;

-- The Edge Function checks id and role after verifying the caller's JWT.
-- Do not grant browser roles any additional access to profiles.
grant select (id, role) on public.profiles to service_role;

alter table public.calendar_connections
  add column if not exists king_calendar_id text,
  add column if not exists king_calendar_name text,
  add column if not exists yho_calendar_id text,
  add column if not exists yho_calendar_name text,
  add column if not exists shared_calendar_id text,
  add column if not exists shared_calendar_name text;

alter table public.calendar_event_suggestions
  add column if not exists calendar_target text not null default 'yho'
    check (calendar_target in ('king', 'yho', 'shared'));

alter table public.productivity_tasks
  add column if not exists calendar_target text not null default 'yho'
    check (calendar_target in ('king', 'yho', 'shared'));

alter table public.created_calendar_events
  add column if not exists calendar_target text not null default 'yho'
    check (calendar_target in ('king', 'yho', 'shared'));

update public.team_members
set calendar_assignment = 'HC Apparel — King Terik', updated_at = now()
where name = 'King Terik';

update public.team_members
set calendar_assignment = 'HC Apparel — YHO Operations', updated_at = now()
where name = 'YHO / Mario';

commit;
