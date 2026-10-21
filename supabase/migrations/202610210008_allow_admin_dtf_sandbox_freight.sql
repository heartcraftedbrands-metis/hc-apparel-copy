begin;

create or replace function public.record_dtf_sandbox_test_freight(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_row public.dtf_transfer_orders; v_fingerprint text; v_expires timestamptz:=now()+interval '1 hour';
begin
  if not public.is_admin() and not public.has_dtf_sandbox_test_access() then
    raise exception 'DTF sandbox tester access required';
  end if;
  select * into v_row from public.dtf_transfer_orders where id=p_order_id and owner_user_id=auth.uid() for update;
  if not found then raise exception 'Transfer order not found'; end if;
  v_fingerprint:=public.dtf_transfer_quote_fingerprint(v_row.shipping_address,v_row.artwork_sha256,v_row.width_inches,
    v_row.height_inches,v_row.quantity,v_row.production_options,v_row.cart_snapshot);
  update public.dtf_transfer_orders set supplier_shipping=13.50,shipping_quote_status='quoted',
    shipping_quote_source='Verified sandbox freight fixture — no supplier purchase',shipping_quote_at=now(),
    shipping_quote_expires_at=v_expires,quote_fingerprint=v_fingerprint,
    shipping_pricing_snapshot=jsonb_build_object('fingerprint',v_fingerprint,'source','verified_test_fixture','freight',13.50,'test_data',true),
    updated_at=now() where id=v_row.id returning * into v_row;
  return jsonb_build_object('id',v_row.id,'shipping_quote_status',v_row.shipping_quote_status,
    'supplier_shipping',v_row.supplier_shipping,'shipping_quote_source',v_row.shipping_quote_source,
    'shipping_quote_at',v_row.shipping_quote_at,'shipping_quote_expires_at',v_row.shipping_quote_expires_at,
    'customer_total',v_row.customer_total);
end $$;

revoke all on function public.record_dtf_sandbox_test_freight(uuid) from public,anon;
grant execute on function public.record_dtf_sandbox_test_freight(uuid) to authenticated;

commit;
