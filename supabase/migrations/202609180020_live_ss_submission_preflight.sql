create or replace function public.preview_live_ss_submission(p_draft_id text)
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
  select coalesce(ss_live_submission_enabled, false) into v_enabled
  from public.integration_settings where id = true;
  if not v_enabled then raise exception 'Live S&S submission is disabled'; end if;

  select * into v_draft from public.vendor_order_drafts where id = p_draft_id;
  if not found then raise exception 'S&S vendor order draft not found'; end if;
  if lower(coalesce(v_draft.vendor_name, '')) not in ('s&s activewear', 's&s') then
    raise exception 'This draft is not assigned to S&S Activewear';
  end if;
  if v_draft.payment_status <> 'paid' then raise exception 'Payment must be confirmed before S&S submission'; end if;
  if v_draft.workflow_status <> 'ready_to_submit_to_ss' or v_draft.vendor_status <> 'ready_to_order' then
    raise exception 'The vendor draft must be reviewed and marked ready to submit';
  end if;
  if not v_draft.validation_passed or not v_draft.ss_api_connected then
    raise exception 'Run and pass the S&S payload validation before live submission';
  end if;
  if not public.ss_draft_cost_ready(v_draft) then
    raise exception 'Vendor cost is missing. Refresh S&S cost before submitting.';
  end if;
  if v_draft.ss_submission_state in ('submitting', 'submitted')
    or nullif(btrim(coalesce(v_draft.ss_order_number, '')), '') is not null
    or nullif(btrim(coalesce(v_draft.external_vendor_order_number, '')), '') is not null
    or nullif(btrim(coalesce(v_draft.ss_guid, '')), '') is not null then
    raise exception 'This vendor draft has already been submitted or is being submitted';
  end if;

  v_validation := public.get_ss_vendor_order_draft_validation(p_draft_id);
  if not coalesce((v_validation ->> 'payload_valid')::boolean, false) then
    raise exception 'Payment and all required vendor order fields must be complete';
  end if;
  return jsonb_build_object(
    'draft_id', p_draft_id,
    'customer_order_number', v_draft.customer_order_number,
    'vendor_order_number', v_draft.vendor_order_number,
    'payload', (v_validation -> 'payload') || jsonb_build_object('customer_name', v_draft.customer_name),
    'checks_passed', true
  );
end;
$$;
revoke all on function public.preview_live_ss_submission(text) from public, anon;
grant execute on function public.preview_live_ss_submission(text) to authenticated;

create or replace function public.fail_live_ss_submission_v2(
  p_draft_id text,
  p_error text,
  p_response_summary jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  update public.vendor_order_drafts set
    ss_submission_state = 'failed',
    ss_submission_error = left(coalesce(p_error, 'S&S submission failed'), 1000),
    ss_api_response_summary = coalesce(p_response_summary, ss_api_response_summary),
    live_submission_enabled = false,
    safety_mode_message = 'S&S submission failed; draft remains ready for manual review'
  where id = p_draft_id and ss_submission_state = 'submitting';
  update public.integration_settings set
    last_ss_submission_at = now(), last_ss_submission_status = 'failed',
    last_ss_submission_draft_id = p_draft_id,
    last_ss_submission_error = left(coalesce(p_error, 'S&S submission failed'), 1000),
    updated_at = now(), updated_by = auth.uid()
  where id = true;
end;
$$;
revoke all on function public.fail_live_ss_submission_v2(text,text,jsonb) from public, anon;
grant execute on function public.fail_live_ss_submission_v2(text,text,jsonb) to authenticated;

create or replace function public.begin_live_ss_submission(p_draft_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_preview jsonb;
begin
  perform 1 from public.vendor_order_drafts where id = p_draft_id for update;
  v_preview := public.preview_live_ss_submission(p_draft_id);
  update public.vendor_order_drafts set
    ss_submission_state = 'submitting', ss_submission_started_at = now(),
    ss_submission_error = null, live_submission_enabled = true,
    safety_mode_message = 'Live S&S submission authorized by admin; awaiting API confirmation'
  where id = p_draft_id;
  return v_preview || jsonb_build_object('authorized_by', auth.uid());
end;
$$;
revoke all on function public.begin_live_ss_submission(text) from public, anon;
grant execute on function public.begin_live_ss_submission(text) to authenticated;
