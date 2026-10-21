begin;

alter table public.dtf_transfer_orders
  add column if not exists customer_shipping_charge numeric(12,2)
  check (customer_shipping_charge is null or customer_shipping_charge >= 0);

update public.dtf_transfer_orders
set customer_shipping_charge=supplier_shipping
where customer_shipping_charge is null and shipping_quote_status in ('quoted','verified_free');

create or replace function public.record_dtf_sandbox_test_freight(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_row public.dtf_transfer_orders; v_fingerprint text; v_expires timestamptz:=now()+interval '1 hour';
begin
  if not public.is_admin() and not public.has_dtf_sandbox_test_access() then raise exception 'DTF sandbox tester access required'; end if;
  select * into v_row from public.dtf_transfer_orders where id=p_order_id and owner_user_id=auth.uid() for update;
  if not found then raise exception 'Transfer order not found'; end if;
  v_fingerprint:=public.dtf_transfer_quote_fingerprint(v_row.shipping_address,v_row.artwork_sha256,v_row.width_inches,
    v_row.height_inches,v_row.quantity,v_row.production_options,v_row.cart_snapshot);
  update public.dtf_transfer_orders set supplier_shipping=13.50,customer_shipping_charge=13.50,shipping_quote_status='quoted',
    shipping_quote_source='Verified sandbox freight fixture — no supplier purchase',shipping_quote_at=now(),
    shipping_quote_expires_at=v_expires,quote_fingerprint=v_fingerprint,
    shipping_pricing_snapshot=jsonb_build_object('fingerprint',v_fingerprint,'source','verified_test_fixture','freight',13.50,'test_data',true),
    updated_at=now() where id=v_row.id returning * into v_row;
  return jsonb_build_object('id',v_row.id,'shipping_quote_status',v_row.shipping_quote_status,
    'customer_shipping_charge',v_row.customer_shipping_charge,'shipping_quote_at',v_row.shipping_quote_at,
    'shipping_quote_expires_at',v_row.shipping_quote_expires_at,'customer_total',v_row.customer_total);
end $$;

create or replace function public.resume_owned_dtf_transfer_order(
  p_order_id uuid,
  p_cart_snapshot jsonb default '[]'::jsonb
) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_order public.dtf_transfer_orders; v_current text;
begin
  select * into v_order from public.dtf_transfer_orders where id=p_order_id and (owner_user_id=auth.uid() or public.is_admin()) for update;
  if not found then raise exception 'Transfer order not found'; end if;
  v_current:=public.dtf_transfer_quote_fingerprint(v_order.shipping_address,v_order.artwork_sha256,v_order.width_inches,
    v_order.height_inches,v_order.quantity,v_order.production_options,coalesce(p_cart_snapshot,'[]'::jsonb));
  if v_order.shipping_quote_status in ('quoted','verified_free') and
    (v_order.shipping_quote_expires_at<=now() or v_order.quote_fingerprint is distinct from v_current or
     v_order.shipping_pricing_snapshot->>'fingerprint' is distinct from v_order.quote_fingerprint) then
    update public.dtf_transfer_orders set shipping_quote_status=case when shipping_quote_expires_at<=now() then 'expired' else 'supplier_quote_required' end,
      supplier_shipping=null,customer_shipping_charge=null,shipping_quote_source=null,shipping_quote_at=null,shipping_quote_expires_at=null,updated_at=now()
    where id=v_order.id returning * into v_order;
  end if;
  return jsonb_build_object(
    'id',v_order.id,'order_reference',v_order.order_reference,'status',v_order.status,'payment_status',v_order.payment_status,
    'width_inches',v_order.width_inches,'height_inches',v_order.height_inches,'quantity',v_order.quantity,
    'production_options',v_order.production_options,'customer_notes',v_order.customer_notes,
    'artwork_storage_path',v_order.artwork_storage_path,'artwork_original_name',v_order.artwork_original_name,
    'artwork_mime_type',v_order.artwork_mime_type,'artwork_sha256',v_order.artwork_sha256,'artwork_warnings',v_order.artwork_warnings,
    'shipping_address',v_order.shipping_address,'customer_total',v_order.customer_total,
    'customer_shipping_charge',v_order.customer_shipping_charge,'shipping_quote_status',v_order.shipping_quote_status,
    'shipping_quote_expires_at',v_order.shipping_quote_expires_at,'linked_customer_order_id',v_order.linked_customer_order_id,
    'idempotency_key',v_order.idempotency_key,'is_sample',v_order.is_sample,'test_label',v_order.test_label,
    'stripe_mode',v_order.stripe_mode,'created_at',v_order.created_at,'updated_at',v_order.updated_at
  );
end $$;

revoke all on function public.resume_owned_dtf_transfer_order(uuid,jsonb) from public,anon;
grant execute on function public.resume_owned_dtf_transfer_order(uuid,jsonb) to authenticated;

comment on column public.dtf_transfer_orders.customer_shipping_charge is
  'Customer-facing shipping amount. Kept separate from private supplier freight and cost fields.';

commit;
