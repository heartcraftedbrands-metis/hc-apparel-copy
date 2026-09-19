alter table public.vendor_order_drafts
  add column if not exists ss_guid text,
  add column if not exists ss_po_number text,
  add column if not exists ss_warehouse text,
  add column if not exists ss_order_status text,
  add column if not exists ss_order_date timestamptz,
  add column if not exists ss_expected_delivery_date timestamptz,
  add column if not exists ss_tracking_number text,
  add column if not exists ss_status_refreshed_at timestamptz;

create or replace function public.record_ss_order_confirmation(
  p_draft_id text,
  p_confirmation jsonb
)
returns public.vendor_order_drafts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft public.vendor_order_drafts%rowtype;
  v_order_number text := nullif(btrim(p_confirmation ->> 'order_number'), '');
  v_guid text := nullif(btrim(p_confirmation ->> 'guid'), '');
  v_status text := nullif(btrim(p_confirmation ->> 'status'), '');
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if v_order_number is null then
    raise exception 'S&S confirmation did not include an order number';
  end if;

  select * into v_draft
  from public.vendor_order_drafts
  where id = p_draft_id
  for update;
  if not found then
    raise exception 'S&S vendor order draft not found' using errcode = 'P0002';
  end if;

  if nullif(btrim(coalesce(v_draft.ss_order_number, '')), '') is not null
    and v_draft.ss_order_number <> v_order_number then
    raise exception 'A different S&S order is already recorded for this draft';
  end if;
  if nullif(btrim(coalesce(v_draft.ss_guid, '')), '') is not null
    and v_guid is not null and v_draft.ss_guid <> v_guid then
    raise exception 'A different S&S GUID is already recorded for this draft';
  end if;

  update public.vendor_order_drafts draft
  set
    ss_submission_state = 'submitted',
    ss_order_number = v_order_number,
    external_vendor_order_number = v_order_number,
    ss_guid = coalesce(v_guid, draft.ss_guid),
    ss_po_number = coalesce(nullif(btrim(p_confirmation ->> 'po_number'), ''), draft.vendor_order_number),
    ss_warehouse = nullif(btrim(p_confirmation ->> 'warehouse'), ''),
    ss_order_status = v_status,
    ss_order_date = nullif(p_confirmation ->> 'order_date', '')::timestamptz,
    ss_expected_delivery_date = nullif(p_confirmation ->> 'expected_delivery_date', '')::timestamptz,
    ss_tracking_number = nullif(btrim(p_confirmation ->> 'tracking_number'), ''),
    ss_status_refreshed_at = now(),
    ss_submitted_at = coalesce(draft.ss_submitted_at, nullif(p_confirmation ->> 'order_date', '')::timestamptz, now()),
    ss_submitted_by = coalesce(draft.ss_submitted_by, auth.uid()),
    ss_api_response_summary = p_confirmation,
    ss_submission_error = null,
    workflow_status = case
      when lower(coalesce(v_status, '')) = 'shipped' then 'tracking_received'
      when lower(coalesce(v_status, '')) = 'completed' then 'vendor_order_confirmed'
      else 'submitted_to_ss'
    end,
    vendor_status = case
      when lower(coalesce(v_status, '')) = 'shipped' then 'in_transit_to_me'
      when lower(coalesce(v_status, '')) = 'completed' then 'received'
      when lower(coalesce(v_status, '')) = 'canceled' then 'cancelled'
      else 'ordered_from_vendor'
    end,
    vendor_order_date = coalesce(draft.vendor_order_date, (nullif(p_confirmation ->> 'order_date', '')::timestamptz)::date, current_date),
    live_submission_enabled = true,
    safety_mode_message = 'S&S order confirmed; duplicate submission blocked'
  where draft.id = p_draft_id
  returning draft.* into v_draft;

  update public.orders
  set fulfillment_status = case
    when lower(coalesce(v_status, '')) = 'shipped' then 'in_transit_to_me'
    when lower(coalesce(v_status, '')) = 'completed' then 'completed'
    when lower(coalesce(v_status, '')) = 'canceled' then fulfillment_status
    else 'ordered_from_vendor'
  end
  where id = v_draft.customer_order_id;

  update public.integration_settings
  set last_ss_submission_at = coalesce(v_draft.ss_submitted_at, now()),
      last_ss_submission_status = coalesce(v_status, 'submitted'),
      last_ss_submission_draft_id = p_draft_id,
      last_ss_submission_order_number = v_order_number,
      last_ss_submission_error = null,
      updated_at = now(),
      updated_by = auth.uid()
  where id = true;

  return v_draft;
end;
$$;

revoke all on function public.record_ss_order_confirmation(text, jsonb) from public, anon;
grant execute on function public.record_ss_order_confirmation(text, jsonb) to authenticated;

create or replace function public.guard_ss_duplicate_submission()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.ss_submission_state = 'submitting'
    and old.ss_submission_state is distinct from 'submitting'
    and (
      nullif(btrim(coalesce(old.ss_order_number, '')), '') is not null
      or nullif(btrim(coalesce(old.external_vendor_order_number, '')), '') is not null
      or nullif(btrim(coalesce(old.ss_guid, '')), '') is not null
    ) then
    raise exception 'This vendor draft already has an S&S confirmation; duplicate submission blocked';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_ss_duplicate_submission on public.vendor_order_drafts;
create trigger guard_ss_duplicate_submission
before update on public.vendor_order_drafts
for each row execute function public.guard_ss_duplicate_submission();
