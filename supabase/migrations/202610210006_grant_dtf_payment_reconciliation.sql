begin;

create or replace function public.reconcile_paid_dtf_order(
  p_customer_order_id uuid,
  p_test_mode boolean default false
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_count integer;
  v_dtf_id uuid;
begin
  select count(*), (array_agg(id))[1] into v_count, v_dtf_id
  from public.dtf_transfer_orders
  where linked_customer_order_id=p_customer_order_id::text;
  if v_count<>1 then
    raise exception 'Paid customer order must link to exactly one DTF record';
  end if;
  update public.dtf_transfer_orders
  set payment_status='paid',
      is_sample=case when p_test_mode then true else is_sample end,
      test_label=case when p_test_mode then 'DTF Stripe sandbox E2E' else test_label end,
      stripe_mode=case when p_test_mode then 'test' else stripe_mode end,
      status=case when p_test_mode then 'draft' else status end,
      supplier_order_number=case when p_test_mode then null else supplier_order_number end,
      supplier_submitted_at=case when p_test_mode then null else supplier_submitted_at end,
      updated_at=now()
  where id=v_dtf_id;
  return jsonb_build_object('dtf_order_id',v_dtf_id,'linked_count',v_count,'payment_status','paid','is_sample',p_test_mode);
end $$;

revoke all on function public.reconcile_paid_dtf_order(uuid,boolean) from public,anon,authenticated;
grant execute on function public.reconcile_paid_dtf_order(uuid,boolean) to service_role;

commit;
