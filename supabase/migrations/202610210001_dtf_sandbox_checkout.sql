begin;

alter table public.dtf_transfer_orders
  add column if not exists is_sample boolean not null default false,
  add column if not exists test_label text,
  add column if not exists stripe_mode text check (stripe_mode in ('test','live'));

create unique index if not exists dtf_transfer_orders_one_linked_customer_order
  on public.dtf_transfer_orders(linked_customer_order_id)
  where linked_customer_order_id is not null;

create or replace function public.block_dtf_test_supplier_submission()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.is_sample is true and (
    new.status in ('submitted','in_production','shipped','delivered')
    or new.supplier_order_number is not null
    or new.supplier_submitted_at is not null
  ) then
    raise exception 'DTF test orders cannot be submitted to the supplier';
  end if;
  return new;
end $$;

drop trigger if exists dtf_test_orders_block_supplier_submission on public.dtf_transfer_orders;
create trigger dtf_test_orders_block_supplier_submission
before insert or update of is_sample,status,supplier_order_number,supplier_submitted_at
on public.dtf_transfer_orders for each row execute function public.block_dtf_test_supplier_submission();

create or replace function public.mark_dtf_e2e_test_order(p_dtf_order_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_dtf public.dtf_transfer_orders; v_order public.orders;
begin
  if not public.is_admin() and lower(coalesce(auth.jwt()->>'email',''))<>'dtf-sandbox-20261021@ilovehcapparel.net' then
    raise exception 'DTF sandbox tester access required';
  end if;
  select * into v_dtf from public.dtf_transfer_orders where id=p_dtf_order_id and owner_user_id=auth.uid() for update;
  if not found then raise exception 'Transfer order not found'; end if;
  if v_dtf.linked_customer_order_id is null then raise exception 'Linked customer order is required'; end if;
  update public.dtf_transfer_orders set is_sample=true,test_label='DTF Stripe sandbox E2E',stripe_mode='test',
    status='draft',supplier_order_number=null,supplier_submitted_at=null,updated_at=now()
  where id=v_dtf.id returning * into v_dtf;
  update public.orders set is_sample=true,stripe_mode='test',fulfillment_status='not_started',
    internal_notes=concat_ws(E'\n',nullif(internal_notes,''),'[TEST DATA] DTF Stripe sandbox E2E. Do not fulfill or submit to supplier.')
  where id=v_dtf.linked_customer_order_id returning * into v_order;
  if not found then raise exception 'Linked customer order not found'; end if;
  return jsonb_build_object('dtf_order_id',v_dtf.id,'order_id',v_order.id,'is_sample',true,'stripe_mode','test');
end $$;

revoke all on function public.mark_dtf_e2e_test_order(uuid) from public,anon;
grant execute on function public.mark_dtf_e2e_test_order(uuid) to authenticated;
revoke all on function public.block_dtf_test_supplier_submission() from public,anon,authenticated;

commit;
