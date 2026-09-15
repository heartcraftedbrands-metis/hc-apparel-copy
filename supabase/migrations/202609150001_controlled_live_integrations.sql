-- Controlled Stripe live mode and admin-gated S&S ordering.
-- Defaults preserve test Stripe mode and keep both live vendor controls disabled.

alter table public.payment_settings
add column if not exists stripe_mode text not null default 'test',
add column if not exists last_stripe_event_id text,
add column if not exists last_stripe_event_type text,
add column if not exists last_stripe_event_mode text,
add column if not exists last_stripe_event_at timestamptz;

alter table public.payment_settings
drop constraint if exists payment_settings_stripe_mode_check;
alter table public.payment_settings
add constraint payment_settings_stripe_mode_check
check (stripe_mode in ('test', 'live'));

alter table public.orders
add column if not exists stripe_mode text;

alter table public.orders
drop constraint if exists orders_stripe_mode_check;
alter table public.orders
add constraint orders_stripe_mode_check
check (stripe_mode is null or stripe_mode in ('test', 'live'));

create table if not exists public.integration_settings (
  id boolean primary key default true check (id),
  ss_live_submission_enabled boolean not null default false,
  zerotouch_live_submission_enabled boolean not null default false,
  ss_api_connected boolean not null default false,
  last_ss_connection_at timestamptz,
  last_ss_connection_message text,
  last_ss_submission_at timestamptz,
  last_ss_submission_status text,
  last_ss_submission_draft_id text,
  last_ss_submission_order_number text,
  last_ss_submission_error text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.integration_settings (id)
values (true)
on conflict (id) do nothing;

alter table public.integration_settings enable row level security;
drop policy if exists admin_all_integration_settings on public.integration_settings;
create policy admin_all_integration_settings on public.integration_settings
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

revoke all on public.integration_settings from public, anon, authenticated;
grant select, update on public.integration_settings to authenticated;

alter table public.vendor_order_drafts
add column if not exists ss_submission_state text not null default 'not_submitted',
add column if not exists ss_order_number text,
add column if not exists ss_submitted_at timestamptz,
add column if not exists ss_submitted_by uuid references auth.users(id) on delete set null,
add column if not exists ss_submission_started_at timestamptz,
add column if not exists ss_api_response_summary jsonb,
add column if not exists ss_submission_error text;

alter table public.vendor_order_drafts
drop constraint if exists vendor_order_drafts_ss_submission_state_check;
alter table public.vendor_order_drafts
add constraint vendor_order_drafts_ss_submission_state_check
check (ss_submission_state in ('not_submitted', 'submitting', 'submitted', 'failed'));

alter table public.vendor_order_drafts
drop constraint if exists vendor_order_drafts_live_submission_disabled_check;

create or replace function public.enforce_ss_vendor_order_safety_mode()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_global_live_enabled boolean := false;
  v_live_state boolean;
begin
  if lower(coalesce(new.vendor_name, '')) not in ('s&s activewear', 's&s') then
    return new;
  end if;

  select coalesce(settings.ss_live_submission_enabled, false)
  into v_global_live_enabled
  from public.integration_settings settings
  where settings.id = true;

  v_live_state :=
    new.live_submission_enabled
    or new.ss_submission_state in ('submitting', 'submitted')
    or new.workflow_status in ('submitted_to_ss', 'vendor_order_confirmed', 'tracking_received', 'completed')
    or new.vendor_status in ('ordered_from_vendor', 'in_transit_to_me', 'received', 'partially_received');

  if v_live_state and not v_global_live_enabled then
    raise exception 'Live S&S submission is disabled'
      using errcode = '55000';
  end if;

  if new.ss_submission_state = 'submitted' and (
    nullif(btrim(coalesce(new.ss_order_number, '')), '') is null
    or new.ss_submitted_at is null
    or new.ss_submitted_by is null
  ) then
    raise exception 'A confirmed S&S order number and submission audit are required'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.set_live_integration_controls(
  p_ss_live_enabled boolean,
  p_zerotouch_live_enabled boolean
)
returns public.integration_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.integration_settings%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  update public.integration_settings settings
  set
    ss_live_submission_enabled = coalesce(p_ss_live_enabled, false),
    zerotouch_live_submission_enabled = coalesce(p_zerotouch_live_enabled, false),
    updated_at = now(),
    updated_by = auth.uid()
  where settings.id = true
  returning settings.* into v_settings;

  return v_settings;
end;
$$;

revoke all on function public.set_live_integration_controls(boolean, boolean)
from public, anon;
grant execute on function public.set_live_integration_controls(boolean, boolean)
to authenticated;

create or replace function public.record_ss_connection_result(
  p_connected boolean,
  p_message text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  update public.integration_settings
  set
    ss_api_connected = coalesce(p_connected, false),
    last_ss_connection_at = now(),
    last_ss_connection_message = left(coalesce(p_message, ''), 500),
    updated_at = now(),
    updated_by = auth.uid()
  where id = true;
end;
$$;

revoke all on function public.record_ss_connection_result(boolean, text)
from public, anon;
grant execute on function public.record_ss_connection_result(boolean, text)
to authenticated;

create or replace function public.begin_live_ss_submission(p_draft_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft public.vendor_order_drafts%rowtype;
  v_validation jsonb;
  v_enabled boolean := false;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  select coalesce(settings.ss_live_submission_enabled, false)
  into v_enabled
  from public.integration_settings settings
  where settings.id = true;
  if not v_enabled then
    raise exception 'Live S&S submission is disabled' using errcode = '55000';
  end if;

  select draft.* into v_draft
  from public.vendor_order_drafts draft
  where draft.id = p_draft_id
  for update;
  if not found then
    raise exception 'S&S vendor order draft not found' using errcode = 'P0002';
  end if;
  if lower(coalesce(v_draft.vendor_name, '')) not in ('s&s activewear', 's&s') then
    raise exception 'This draft is not assigned to S&S Activewear';
  end if;
  if v_draft.payment_status <> 'paid' then
    raise exception 'Payment must be confirmed before S&S submission';
  end if;
  if v_draft.workflow_status <> 'ready_to_submit_to_ss'
    or v_draft.vendor_status <> 'ready_to_order' then
    raise exception 'The vendor draft must be reviewed and marked ready to submit';
  end if;
  if not v_draft.validation_passed or not v_draft.ss_api_connected then
    raise exception 'Run and pass the S&S payload validation before live submission';
  end if;
  if v_draft.ss_submission_state in ('submitting', 'submitted')
    or nullif(btrim(coalesce(v_draft.external_vendor_order_number, '')), '') is not null then
    raise exception 'This vendor draft has already been submitted or is being submitted';
  end if;

  v_validation := public.get_ss_vendor_order_draft_validation(p_draft_id);
  if not coalesce((v_validation ->> 'payload_valid')::boolean, false) then
    raise exception 'Payment and all required vendor order fields must be complete';
  end if;

  update public.vendor_order_drafts
  set
    ss_submission_state = 'submitting',
    ss_submission_started_at = now(),
    ss_submission_error = null,
    live_submission_enabled = true,
    safety_mode_message = 'Live S&S submission authorized by admin; awaiting API confirmation'
  where id = p_draft_id;

  return jsonb_build_object(
    'draft_id', p_draft_id,
    'payload', v_validation -> 'payload',
    'authorized_by', auth.uid()
  );
end;
$$;

revoke all on function public.begin_live_ss_submission(text)
from public, anon;
grant execute on function public.begin_live_ss_submission(text)
to authenticated;

create or replace function public.fail_live_ss_submission(
  p_draft_id text,
  p_error text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  update public.vendor_order_drafts
  set
    ss_submission_state = 'failed',
    ss_submission_error = left(coalesce(p_error, 'S&S submission failed'), 1000),
    live_submission_enabled = false,
    safety_mode_message = 'S&S submission failed; draft remains unsent'
  where id = p_draft_id
    and ss_submission_state = 'submitting';

  update public.integration_settings
  set
    last_ss_submission_at = now(),
    last_ss_submission_status = 'failed',
    last_ss_submission_draft_id = p_draft_id,
    last_ss_submission_error = left(coalesce(p_error, 'S&S submission failed'), 1000),
    updated_at = now(),
    updated_by = auth.uid()
  where id = true;
end;
$$;

revoke all on function public.fail_live_ss_submission(text, text)
from public, anon;
grant execute on function public.fail_live_ss_submission(text, text)
to authenticated;

create or replace function public.complete_live_ss_submission(
  p_draft_id text,
  p_order_number text,
  p_response_summary jsonb
)
returns public.vendor_order_drafts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft public.vendor_order_drafts%rowtype;
  v_enabled boolean := false;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_order_number, '')), '') is null then
    raise exception 'S&S did not return an order number';
  end if;

  select coalesce(settings.ss_live_submission_enabled, false)
  into v_enabled
  from public.integration_settings settings
  where settings.id = true;
  if not v_enabled then
    raise exception 'Live S&S submission is disabled' using errcode = '55000';
  end if;

  update public.vendor_order_drafts draft
  set
    ss_submission_state = 'submitted',
    ss_order_number = btrim(p_order_number),
    external_vendor_order_number = btrim(p_order_number),
    ss_submitted_at = now(),
    ss_submitted_by = auth.uid(),
    ss_api_response_summary = coalesce(p_response_summary, '{}'::jsonb),
    ss_submission_error = null,
    workflow_status = 'submitted_to_ss',
    vendor_status = 'ordered_from_vendor',
    vendor_order_date = current_date,
    live_submission_enabled = true,
    safety_mode_message = 'Submitted to S&S Activewear by an administrator'
  where draft.id = p_draft_id
    and draft.ss_submission_state = 'submitting'
  returning draft.* into v_draft;
  if not found then
    raise exception 'S&S draft is not in the submitting state';
  end if;

  update public.orders
  set fulfillment_status = 'ordered_from_vendor'
  where id = v_draft.customer_order_id;

  update public.integration_settings
  set
    last_ss_submission_at = now(),
    last_ss_submission_status = 'submitted',
    last_ss_submission_draft_id = p_draft_id,
    last_ss_submission_order_number = btrim(p_order_number),
    last_ss_submission_error = null,
    updated_at = now(),
    updated_by = auth.uid()
  where id = true;

  return v_draft;
end;
$$;

revoke all on function public.complete_live_ss_submission(text, text, jsonb)
from public, anon;
grant execute on function public.complete_live_ss_submission(text, text, jsonb)
to authenticated;

create or replace function public.get_public_payment_settings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'payment_mode', settings.payment_mode,
        'stripe_connected', coalesce(settings.stripe_connected, false),
        'test_mode_enabled', coalesce(settings.test_mode_enabled, false),
        'invoice_instructions', settings.invoice_instructions,
        'payment_notes_customer', settings.payment_notes_customer
      )
      from public.payment_settings settings
      order by settings.updated_date desc
      limit 1
    ),
    jsonb_build_object(
      'payment_mode', 'manual',
      'stripe_connected', false,
      'test_mode_enabled', false
    )
  );
$$;

revoke all on function public.get_public_payment_settings() from public;
grant execute on function public.get_public_payment_settings() to anon, authenticated;
