begin;

do $$
declare v_user_id uuid;
begin
  select id into v_user_id from auth.users
  where lower(email)='dtf-sandbox-20261021@ilovehcapparel.net'
  order by created_at desc limit 1;
  if v_user_id is null then raise exception 'DTF sandbox account was not created'; end if;
  update auth.users set email_confirmed_at=coalesce(email_confirmed_at,now()),updated_at=now()
  where id=v_user_id;
  update public.profiles set role='customer',full_name='HC Apparel DTF Sandbox',updated_at=now()
  where id=v_user_id;
end $$;

create table if not exists public.dtf_sandbox_test_access(
  user_id uuid primary key references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  purpose text not null,
  created_at timestamptz not null default now()
);
alter table public.dtf_sandbox_test_access enable row level security;
revoke all on public.dtf_sandbox_test_access from public,anon,authenticated;

insert into public.dtf_sandbox_test_access(user_id,expires_at,purpose)
select id,now()+interval '2 hours','One-time DTF Stripe sandbox E2E'
from auth.users where lower(email)='dtf-sandbox-20261021@ilovehcapparel.net'
on conflict(user_id) do update set expires_at=excluded.expires_at,purpose=excluded.purpose;

create or replace function public.has_dtf_sandbox_test_access()
returns boolean language sql stable security definer set search_path=public,auth as $$
  select exists(select 1 from public.dtf_sandbox_test_access where user_id=auth.uid() and expires_at>now())
$$;
revoke all on function public.has_dtf_sandbox_test_access() from public,anon;
grant execute on function public.has_dtf_sandbox_test_access() to authenticated;

create or replace function public.mark_dtf_e2e_test_order(p_dtf_order_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_dtf public.dtf_transfer_orders; v_order public.orders;
begin
  if not public.is_admin() and not public.has_dtf_sandbox_test_access() then
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
  where id=v_dtf.linked_customer_order_id and owner_user_id=auth.uid() returning * into v_order;
  if not found then raise exception 'Linked customer order not found'; end if;
  return jsonb_build_object('dtf_order_id',v_dtf.id,'order_id',v_order.id,'is_sample',true,'stripe_mode','test');
end $$;

commit;
