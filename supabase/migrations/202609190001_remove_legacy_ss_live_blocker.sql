-- The authoritative live-order control is integration_settings.ss_live_submission_enabled.
-- Keep ZeroTouch validation here, but remove the obsolete unconditional S&S block
-- that predates the controlled admin-only submission workflow.
create or replace function public.enforce_zerotouch_ready_safety()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_errors jsonb;
begin
  if new.zerotouch_ready then
    v_errors := public.get_zerotouch_validation_errors(new);
    if jsonb_array_length(v_errors) > 0 then
      raise exception 'ZeroTouch preparation is incomplete: %', v_errors::text
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.verify_ss_live_transition_guard(p_draft_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  begin
    update public.vendor_order_drafts set live_submission_enabled = true where id = p_draft_id;
    if not found then raise exception 'S&S vendor order draft not found'; end if;
    raise exception 'ROLLBACK_SS_LIVE_PROBE';
  exception when others then
    if sqlerrm = 'ROLLBACK_SS_LIVE_PROBE' then
      return jsonb_build_object('ready', true, 'reason', 'Backend live transition guard passed; probe rolled back');
    end if;
    return jsonb_build_object('ready', false, 'reason', left(sqlerrm, 500));
  end;
end;
$$;
revoke all on function public.verify_ss_live_transition_guard(text) from public, anon;
grant execute on function public.verify_ss_live_transition_guard(text) to authenticated;
