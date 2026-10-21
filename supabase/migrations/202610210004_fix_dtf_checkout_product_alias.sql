begin;

create or replace function public.create_or_reuse_dtf_customer_checkout(
  p_dtf_order_id uuid,p_customer_name text,p_customer_phone text default null,p_billing_address jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_user auth.users; v_dtf public.dtf_transfer_orders; v_existing public.orders; v_order public.orders;
  v_garment_items jsonb:='[]'::jsonb; v_items jsonb; v_merchandise numeric:=0; v_shipping numeric:=0;
  v_tax_detail jsonb:='{}'::jsonb; v_tax numeric:=0; v_total numeric:=0; v_bad_count integer:=0;
begin
  select * into v_user from auth.users where id=auth.uid();
  if not found then raise exception 'Authentication required'; end if;
  select * into v_dtf from public.dtf_transfer_orders where id=p_dtf_order_id and owner_user_id=v_user.id for update;
  if not found then raise exception 'Transfer order not found'; end if;
  if v_dtf.linked_customer_order_id is not null then
    select * into v_existing from public.orders where id=v_dtf.linked_customer_order_id::text and owner_user_id=v_user.id;
    if found then return jsonb_build_object('created',false,'order_id',v_existing.id); end if;
  end if;
  if v_dtf.shipping_quote_status not in ('quoted','verified_free') or v_dtf.shipping_quote_expires_at<=now() then raise exception 'A current verified freight quote is required'; end if;
  if v_dtf.shipping_pricing_snapshot->>'fingerprint' is distinct from v_dtf.quote_fingerprint then raise exception 'The freight quote no longer matches this order'; end if;
  select count(*) into v_bad_count from jsonb_array_elements(v_dtf.cart_snapshot) line
    left join public.products p on p.id::text=line->>'product_id'
    where p.id is null or p.visibility<>'public' or p.is_active is not true or coalesce(p.fulfillment_source,'ss_activewear')<>'ss_activewear';
  if v_bad_count>0 then raise exception 'Mixed DTF checkout supports verified S&S garment lines only'; end if;
  with priced as (
    select line,p.name as product_name,
      coalesce((select (variant->>'price')::numeric from jsonb_array_elements(coalesce(p.size_prices,'[]'::jsonb)) variant
        where (lower(coalesce(variant->>'size',''))=lower(coalesce(line->>'color','')||' / '||coalesce(line->>'size',''))
          or (lower(coalesce(variant->>'color',''))=lower(coalesce(line->>'color','')) and lower(coalesce(variant->>'size',''))=lower(coalesce(line->>'size',''))))
          and (line->>'sku' is null or coalesce(variant->>'sku','')=line->>'sku') limit 1),p.sale_price,p.price) unit_price
    from jsonb_array_elements(v_dtf.cart_snapshot) line join public.products p on p.id::text=line->>'product_id'
  )
  select coalesce(jsonb_agg(line||jsonb_build_object('product_name',product_name,'price',unit_price,
      'product_type','physical','purchase_mode','blank','is_customized',false,'artwork_file_url','')),'[]'::jsonb),
    coalesce(sum(unit_price*greatest(1,(line->>'quantity')::integer)),0)
    into v_garment_items,v_merchandise from priced;
  if exists(select 1 from jsonb_array_elements(v_garment_items) item where coalesce((item->>'price')::numeric,0)<=0) then raise exception 'A garment price could not be verified'; end if;
  v_items:=v_garment_items||jsonb_build_array(jsonb_build_object('product_id','dtf-transfer:'||v_dtf.id::text,
    'dtf_order_id',v_dtf.id,'product_name','HC Apparel DTF Transfers','product_type','transfer','quantity',1,
    'price',v_dtf.customer_total,'artwork_file_url','supabase://dtf-artwork/'||v_dtf.artwork_storage_path,
    'artwork_file_name',v_dtf.artwork_original_name,'width_inches',v_dtf.width_inches,'height_inches',v_dtf.height_inches,
    'transfer_quantity',v_dtf.quantity,'production_options',v_dtf.production_options));
  v_merchandise:=round(v_merchandise+v_dtf.customer_total,2); v_shipping:=coalesce(v_dtf.supplier_shipping,0);
  if upper(coalesce(v_dtf.shipping_address->>'state',''))='GA' then
    select public.get_georgia_checkout_tax_rate(v_dtf.shipping_address->>'zip',v_dtf.shipping_address->>'city',current_date) into v_tax_detail;
    if coalesce((v_tax_detail->>'ok')::boolean,false) is not true then raise exception 'Georgia destination tax could not be verified'; end if;
    v_tax:=round((v_merchandise+v_shipping)*coalesce((v_tax_detail->>'rate_percent')::numeric,0)/100,2);
  end if;
  v_total:=round(v_merchandise+v_shipping+v_tax,2);
  insert into public.orders(owner_user_id,created_by_email,customer_email,customer_name,customer_phone,order_items,
    total_amount,product_subtotal,shipping_amount,shipping_charged_to_customer,sales_tax_amount,amount_paid,balance_due,
    status,payment_status,fulfillment_status,has_physical_items,shipping_address,billing_address,checkout_source,quantity,
    artwork_file_url,print_method,internal_notes)
  values(v_user.id,v_user.email,v_user.email,btrim(p_customer_name),nullif(btrim(coalesce(p_customer_phone,'')),''),v_items,
    v_total,v_merchandise,v_shipping,v_shipping,v_tax,0,v_total,'awaiting_payment','awaiting_payment','not_started',true,
    v_dtf.shipping_address,p_billing_address,'dtf_transfer_order',v_dtf.quantity,'supabase://dtf-artwork/'||v_dtf.artwork_storage_path,
    'dtf_transfer','DTF freight fingerprint '||v_dtf.quote_fingerprint||'. No supplier order submitted.') returning * into v_order;
  update public.dtf_transfer_orders set linked_customer_order_id=v_order.id,payment_status='awaiting_payment',updated_at=now() where id=v_dtf.id;
  return jsonb_build_object('created',true,'order_id',v_order.id,'total',v_total,'supplier_order_submitted',false);
end $$;

revoke all on function public.create_or_reuse_dtf_customer_checkout(uuid,text,text,jsonb) from public;
grant execute on function public.create_or_reuse_dtf_customer_checkout(uuid,text,text,jsonb) to authenticated;

commit;
