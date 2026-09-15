-- Prevent legacy admin status controls from bypassing the controlled S&S order action.
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

  if (
    new.workflow_status in ('submitted_to_ss', 'vendor_order_confirmed', 'tracking_received', 'completed')
    or new.vendor_status in ('ordered_from_vendor', 'in_transit_to_me', 'received', 'partially_received')
  ) and new.ss_submission_state <> 'submitted' then
    raise exception 'Use the controlled live S&S submission action before marking this draft ordered'
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

-- Include the customer name in the server-only authorized payload used by S&S.
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
    'payload', (v_validation -> 'payload') || jsonb_build_object(
      'customer_name', v_draft.customer_name
    ),
    'authorized_by', auth.uid()
  );
end;
$$;

revoke all on function public.begin_live_ss_submission(text)
from public, anon;
grant execute on function public.begin_live_ss_submission(text)
to authenticated;
