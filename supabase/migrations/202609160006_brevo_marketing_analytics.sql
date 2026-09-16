begin;

alter table public.newsletter_subscribers
  add column if not exists first_name text,
  add column if not exists interests text[] not null default '{}',
  add column if not exists source text not null default 'legacy',
  add column if not exists consent_status text not null default 'legacy_unverified',
  add column if not exists consent_at timestamptz,
  add column if not exists brevo_sync_status text not null default 'not_synced',
  add column if not exists brevo_contact_id text,
  add column if not exists brevo_synced_at timestamptz,
  add column if not exists brevo_last_error text;
create unique index if not exists newsletter_subscribers_email_exact_unique on public.newsletter_subscribers(email);

create table if not exists public.marketing_settings (
  id boolean primary key default true check (id),
  ga4_measurement_id text,
  pinterest_tag_id text,
  vercel_analytics_enabled boolean not null default false,
  internal_analytics_enabled boolean not null default true,
  double_opt_in boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.marketing_settings (id) values (true) on conflict (id) do nothing;
alter table public.marketing_settings enable row level security;
create policy marketing_settings_admin on public.marketing_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke all on public.marketing_settings from anon, authenticated;
grant select, update on public.marketing_settings to authenticated;
grant all on public.marketing_settings to service_role;

create table if not exists public.marketing_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  event_name text not null check (event_name in ('page_view','view_product','add_to_cart','begin_checkout','purchase','bulk_quote_submit','contact_submit','newsletter_signup','social_post_created','social_post_sent_to_buffer')),
  product_id text,
  product_name text,
  source text,
  dedupe_key text unique,
  is_test boolean not null default false
);
create index if not exists marketing_events_created_at_idx on public.marketing_events (created_at desc);
create index if not exists marketing_events_name_idx on public.marketing_events (event_name, created_at desc);
alter table public.marketing_events enable row level security;
create policy marketing_events_admin_read on public.marketing_events for select to authenticated using (public.is_admin());
revoke all on public.marketing_events from anon, authenticated;
grant select on public.marketing_events to authenticated;
grant all on public.marketing_events to service_role;

create or replace function public.marketing_public_settings()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ga4_measurement_id', ga4_measurement_id,
    'pinterest_tag_id', pinterest_tag_id,
    'vercel_analytics_enabled', vercel_analytics_enabled,
    'internal_analytics_enabled', internal_analytics_enabled)
  from public.marketing_settings where id = true;
$$;
revoke all on function public.marketing_public_settings() from public;
grant execute on function public.marketing_public_settings() to anon, authenticated;

create or replace function public.log_marketing_event(p_event_name text, p_product_id text default null, p_product_name text default null, p_source text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_event_name not in ('page_view','view_product','add_to_cart','begin_checkout') then return; end if;
  if not (select internal_analytics_enabled from public.marketing_settings where id = true) then return; end if;
  insert into public.marketing_events (event_name, product_id, product_name, source)
  values (p_event_name, left(p_product_id, 100), left(p_product_name, 180), left(p_source, 80));
end;
$$;
revoke all on function public.log_marketing_event(text,text,text,text) from public;
grant execute on function public.log_marketing_event(text,text,text,text) to anon, authenticated;

create or replace function public.marketing_record_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare event_type text;
begin
  if tg_table_name = 'orders' then
    if new.is_sample or new.payment_status <> 'paid' or new.status in ('canceled','refunded') then return new; end if;
    if tg_op = 'UPDATE' then
      if old.payment_status = 'paid' then return new; end if;
    end if;
    event_type := 'purchase';
  elsif tg_table_name = 'quote_requests' then
    if new.is_sample then return new; end if;
    event_type := 'bulk_quote_submit';
  elsif tg_table_name = 'contact_messages' then
    if new.is_sample then return new; end if;
    event_type := 'contact_submit';
  elsif tg_table_name = 'social_studio_posts' then
    if tg_op = 'INSERT' then event_type := 'social_post_created';
    elsif new.buffer_post_id is not null and old.buffer_post_id is null then event_type := 'social_post_sent_to_buffer';
    else return new; end if;
  end if;
  if event_type is not null and (select internal_analytics_enabled from public.marketing_settings where id = true) then
    insert into public.marketing_events(event_name, source, dedupe_key)
    values (event_type, tg_table_name, event_type || ':' || new.id::text)
    on conflict (dedupe_key) do nothing;
  end if;
  return new;
end;
$$;
create trigger marketing_order_paid after insert or update of payment_status on public.orders
  for each row execute function public.marketing_record_event();
create trigger marketing_quote after insert on public.quote_requests
  for each row execute function public.marketing_record_event();
create trigger marketing_contact after insert on public.contact_messages
  for each row execute function public.marketing_record_event();
create trigger marketing_social after insert or update of buffer_post_id on public.social_studio_posts
  for each row execute function public.marketing_record_event();

commit;
