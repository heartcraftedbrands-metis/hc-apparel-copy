alter table public.vendor_order_drafts
add column if not exists vendor_shipping_estimate numeric,
add column if not exists vendor_other_fees numeric,
add column if not exists cost_refreshed_at timestamptz,
add column if not exists cost_override_reason text;

create or replace function public.apply_ss_draft_cost_refresh(
  p_draft_id text,
  p_items jsonb,
  p_inventory jsonb,
  p_checked_at timestamptz
)
returns public.vendor_order_drafts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft public.vendor_order_drafts%rowtype;
  v_cost numeric;
  v_sale numeric;
  v_quantity numeric;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Current S&S cost results are required';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) item
    where coalesce((item->>'garment_cost')::numeric, 0) <= 0
      or coalesce((item->>'inventory_valid')::boolean, false) = false) then
    raise exception 'Every item requires a positive S&S cost and current inventory';
  end if;

  select coalesce(sum((item->>'garment_cost')::numeric * (item->>'quantity')::numeric), 0),
    coalesce(sum((item->>'sale_price')::numeric * (item->>'quantity')::numeric), 0),
    coalesce(sum((item->>'quantity')::numeric), 0)
  into v_cost, v_sale, v_quantity from jsonb_array_elements(p_items) item;

  update public.vendor_order_drafts draft set
    items = p_items,
    garment_cost = v_cost,
    sale_price = v_sale,
    estimated_profit = v_sale - v_cost
      - coalesce(draft.vendor_shipping_estimate, 0)
      - coalesce(draft.vendor_other_fees, 0),
    total_quantity = v_quantity,
    item_count = jsonb_array_length(p_items),
    cost_refreshed_at = p_checked_at,
    test_validation = coalesce(draft.test_validation, '{}'::jsonb)
      || jsonb_build_object('inventory_check', p_inventory, 'cost_checked_at', p_checked_at),
    validation_passed = false,
    workflow_status = case when draft.workflow_status = 'ready_to_submit_to_ss'
      then 'vendor_order_reviewed' else draft.workflow_status end,
    vendor_status = case when draft.vendor_status = 'ready_to_order'
      then 'draft' else draft.vendor_status end
  where draft.id = p_draft_id
  returning draft.* into v_draft;
  if not found then raise exception 'S&S vendor order draft not found'; end if;
  return v_draft;
end;
$$;

revoke all on function public.apply_ss_draft_cost_refresh(text,jsonb,jsonb,timestamptz) from public, anon;
grant execute on function public.apply_ss_draft_cost_refresh(text,jsonb,jsonb,timestamptz) to authenticated;

-- Zero is never a valid vendor cost. A written admin override may unblock
-- readiness, but it never creates a fake margin.
create or replace function public.ss_draft_cost_ready(p_draft public.vendor_order_drafts)
returns boolean language sql stable set search_path = public as $$
  select (
    not exists (select 1 from jsonb_array_elements(coalesce(p_draft.items, '[]'::jsonb)) item
      where coalesce((item->>'garment_cost')::numeric, 0) <= 0)
    or nullif(btrim(coalesce(p_draft.cost_override_reason, '')), '') is not null
  )
$$;

create or replace function public.guard_ss_draft_ready_cost()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.workflow_status = 'ready_to_submit_to_ss'
    and old.workflow_status is distinct from new.workflow_status then
    if not public.ss_draft_cost_ready(new) then
      raise exception 'Vendor cost is missing. Refresh S&S cost or add an admin override reason.';
    end if;
    if new.cost_refreshed_at is null
      and nullif(btrim(coalesce(new.cost_override_reason, '')), '') is null then
      raise exception 'Current S&S cost and inventory are required before submission readiness.';
    end if;
    if exists (select 1 from public.vendor_orders where customer_order_id = new.customer_order_id) then
      raise exception 'A vendor order already exists for this customer order.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists vendor_order_drafts_guard_ready_cost on public.vendor_order_drafts;
create trigger vendor_order_drafts_guard_ready_cost
before update of workflow_status on public.vendor_order_drafts
for each row execute function public.guard_ss_draft_ready_cost();
