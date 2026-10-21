alter table public.dtf_transfer_orders
  add column if not exists shipping_quote_status text not null default 'pending'
    check (shipping_quote_status in ('pending','verified_free','supplier_quote_required','quoted','expired')),
  add column if not exists shipping_quote_source text,
  add column if not exists shipping_quote_at timestamptz,
  add column if not exists shipping_quote_expires_at timestamptz,
  add column if not exists combined_ss_supplier_subtotal numeric(12,2),
  add column if not exists shipping_pricing_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists quote_fingerprint text,
  add column if not exists cart_snapshot jsonb not null default '[]'::jsonb,
  add column if not exists linked_customer_order_id text references public.orders(id) on delete set null;

comment on column public.dtf_transfer_orders.shipping_quote_status is
  'Transfer freight gate. Live payment may not start unless freight is verified_free or a current authenticated supplier quote is stored.';
comment on column public.dtf_transfer_orders.combined_ss_supplier_subtotal is
  'Private S&S supplier subtotal across eligible garment and transfer lines used once for free-freight evaluation.';
comment on column public.dtf_transfer_orders.shipping_pricing_snapshot is
  'Private audit record of the verified S&S freight rule or authenticated cart quote; never customer-editable.';

create extension if not exists pgcrypto;

create or replace function public.dtf_transfer_quote_fingerprint(
  p_shipping_address jsonb, p_artwork_sha256 text, p_width numeric, p_height numeric,
  p_quantity integer, p_options jsonb, p_cart_snapshot jsonb
) returns text language sql immutable set search_path = '' as $$
  select encode(extensions.digest(convert_to(
    jsonb_build_object(
      'shipping_address', coalesce(p_shipping_address, '{}'::jsonb),
      'artwork_sha256', coalesce(p_artwork_sha256,''),
      'width', p_width, 'height', p_height, 'quantity', p_quantity,
      'options', coalesce(p_options,'{}'::jsonb),
      'cart', coalesce(p_cart_snapshot,'[]'::jsonb)
    )::text, 'utf8'), 'sha256'), 'hex');
$$;

create or replace function public.dtf_transfer_supplier_unit_cost(p_width numeric,p_height numeric,p_quantity integer,p_precut boolean default false)
returns numeric language sql immutable set search_path='' as $$
  with refs(size_area,c1,c15,c50,c100,c250) as (values
    (4::numeric,.35,.30,.26,.22,.19),(9,.54,.49,.44,.40,.36),(16,.95,.87,.77,.66,.56),
    (17.4592,.99,.90,.80,.70,.62),(36,2.12,1.84,1.62,1.39,1.15),(64,3.76,3.45,3.03,2.60,2.16),
    (100,5.87,5.32,4.66,4.00,3.34),(154,9.04,8.29,7.25,6.22,5.18),(96,5.69,5.09,4.49,3.84,3.18),
    (204,11.98,9.92,8.68,7.45,6.20)), nearest as (
      select *,abs(size_area-(p_width*p_height)) distance from refs order by distance limit 1
    ) select round(((case when p_quantity>=250 then c250 when p_quantity>=100 then c100 when p_quantity>=50 then c50 when p_quantity>=15 then c15 else c1 end)
      *(p_width*p_height)/size_area + case when p_precut then .30 else 0 end)::numeric,2) from nearest;
$$;

create or replace function public.save_dtf_transfer_draft(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_user uuid := auth.uid(); v_existing public.dtf_transfer_orders; v_row public.dtf_transfer_orders; v_fingerprint text;
  v_supplier_unit numeric; v_retail_unit numeric; v_quantity integer;
  v_garment_supplier_subtotal numeric := 0;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  v_quantity := (p_payload->>'quantity')::integer;
  v_supplier_unit := public.dtf_transfer_supplier_unit_cost((p_payload->>'width_inches')::numeric,(p_payload->>'height_inches')::numeric,v_quantity,coalesce((p_payload->'production_options'->>'precut')::boolean,false));
  v_retail_unit := ceil(((v_supplier_unit*1.18+.30)/.971)*100)/100;
  select coalesce(sum(coalesce(p.vendor_cost,p.blank_garment_cost,0)*greatest(1,(line->>'quantity')::integer)),0)
    into v_garment_supplier_subtotal
  from jsonb_array_elements(coalesce(p_payload->'cart_snapshot','[]'::jsonb)) line
  join public.products p on p.id::text=line->>'product_id'
  where coalesce(p.fulfillment_source,'ss_activewear')='ss_activewear';
  v_fingerprint := public.dtf_transfer_quote_fingerprint(
    p_payload->'shipping_address', p_payload->>'artwork_sha256', (p_payload->>'width_inches')::numeric,
    (p_payload->>'height_inches')::numeric, (p_payload->>'quantity')::integer,
    p_payload->'production_options', p_payload->'cart_snapshot');
  if nullif(p_payload->>'id','') is not null then
    select * into v_existing from public.dtf_transfer_orders where id=(p_payload->>'id')::uuid and owner_user_id=v_user for update;
    if not found then raise exception 'Transfer draft not found'; end if;
    if v_existing.status <> 'draft' or v_existing.payment_status not in ('unpaid','quote_required') then raise exception 'This transfer order can no longer be changed'; end if;
    update public.dtf_transfer_orders set
      width_inches=(p_payload->>'width_inches')::numeric, height_inches=(p_payload->>'height_inches')::numeric,
      quantity=(p_payload->>'quantity')::integer, production_options=coalesce(p_payload->'production_options','{}'::jsonb),
      customer_notes=p_payload->>'customer_notes', artwork_storage_path=p_payload->>'artwork_storage_path',
      artwork_original_name=p_payload->>'artwork_original_name', artwork_mime_type=p_payload->>'artwork_mime_type',
      artwork_sha256=p_payload->>'artwork_sha256', artwork_warnings=coalesce(p_payload->'artwork_warnings','[]'::jsonb),
      shipping_address=coalesce(p_payload->'shipping_address','{}'::jsonb), cart_snapshot=coalesce(p_payload->'cart_snapshot','[]'::jsonb),
      customer_total=round(v_retail_unit*v_quantity,2), supplier_cost=round(v_supplier_unit*v_quantity,2),
      combined_ss_supplier_subtotal=round(v_supplier_unit*v_quantity+v_garment_supplier_subtotal,2),
      quote_fingerprint=v_fingerprint,
      shipping_quote_status=case when quote_fingerprint is distinct from v_fingerprint then 'supplier_quote_required' else shipping_quote_status end,
      supplier_shipping=case when quote_fingerprint is distinct from v_fingerprint then null else supplier_shipping end,
      shipping_quote_source=case when quote_fingerprint is distinct from v_fingerprint then null else shipping_quote_source end,
      shipping_quote_at=case when quote_fingerprint is distinct from v_fingerprint then null else shipping_quote_at end,
      shipping_quote_expires_at=case when quote_fingerprint is distinct from v_fingerprint then null else shipping_quote_expires_at end,
      updated_at=now()
    where id=v_existing.id returning * into v_row;
  else
    insert into public.dtf_transfer_orders(owner_user_id,order_reference,width_inches,height_inches,quantity,production_options,customer_notes,
      artwork_storage_path,artwork_original_name,artwork_mime_type,artwork_sha256,artwork_warnings,shipping_address,customer_total,
      supplier_cost,combined_ss_supplier_subtotal,cart_snapshot,quote_fingerprint,shipping_quote_status,idempotency_key)
    values(v_user,'DTF-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),(p_payload->>'width_inches')::numeric,
      (p_payload->>'height_inches')::numeric,(p_payload->>'quantity')::integer,coalesce(p_payload->'production_options','{}'::jsonb),
      p_payload->>'customer_notes',p_payload->>'artwork_storage_path',p_payload->>'artwork_original_name',p_payload->>'artwork_mime_type',
      p_payload->>'artwork_sha256',coalesce(p_payload->'artwork_warnings','[]'::jsonb),coalesce(p_payload->'shipping_address','{}'::jsonb),
      round(v_retail_unit*v_quantity,2),round(v_supplier_unit*v_quantity,2),round(v_supplier_unit*v_quantity+v_garment_supplier_subtotal,2),
      coalesce(p_payload->'cart_snapshot','[]'::jsonb),v_fingerprint,'supplier_quote_required',coalesce(nullif(p_payload->>'idempotency_key',''),gen_random_uuid()::text))
    returning * into v_row;
  end if;
  return jsonb_build_object('id',v_row.id,'order_reference',v_row.order_reference,'status',v_row.status,
    'payment_status',v_row.payment_status,'shipping_quote_status',v_row.shipping_quote_status,
    'shipping_quote_at',v_row.shipping_quote_at,'shipping_quote_expires_at',v_row.shipping_quote_expires_at,
    'supplier_shipping',v_row.supplier_shipping,'customer_total',v_row.customer_total,'updated_at',v_row.updated_at);
end $$;

create or replace function public.record_dtf_shipping_quote(
  p_order_id uuid, p_freight numeric, p_source text, p_quoted_at timestamptz, p_expires_at timestamptz,
  p_free_freight boolean default false
) returns public.dtf_transfer_orders language plpgsql security definer set search_path = public, auth as $$
declare v_row public.dtf_transfer_orders;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_freight < 0 or nullif(btrim(p_source),'') is null then raise exception 'Exact freight and source are required'; end if;
  if p_expires_at <= p_quoted_at or p_expires_at <= now() then raise exception 'Quote expiration must be in the future'; end if;
  select * into v_row from public.dtf_transfer_orders where id=p_order_id for update;
  if not found then raise exception 'Transfer order not found'; end if;
  if p_free_freight and (coalesce(v_row.combined_ss_supplier_subtotal,0) < 200) then raise exception 'Verified free freight requires at least $200 eligible S&S supplier subtotal'; end if;
  update public.dtf_transfer_orders set supplier_shipping=p_freight,
    shipping_quote_status=case when p_free_freight then 'verified_free' else 'quoted' end,
    shipping_quote_source=p_source,shipping_quote_at=p_quoted_at,shipping_quote_expires_at=p_expires_at,
    shipping_pricing_snapshot=jsonb_build_object('fingerprint',quote_fingerprint,'freight',p_freight,'source',p_source,
      'quoted_at',p_quoted_at,'expires_at',p_expires_at,'free_freight',p_free_freight,'recorded_by',auth.uid()),updated_at=now()
  where id=p_order_id returning * into v_row;
  return v_row;
end $$;

revoke all on function public.save_dtf_transfer_draft(jsonb) from public;
grant execute on function public.save_dtf_transfer_draft(jsonb) to authenticated;
revoke all on function public.record_dtf_shipping_quote(uuid,numeric,text,timestamptz,timestamptz,boolean) from public;
grant execute on function public.record_dtf_shipping_quote(uuid,numeric,text,timestamptz,timestamptz,boolean) to authenticated;

create or replace view public.customer_dtf_transfer_orders with (security_invoker=true) as
select id,owner_user_id,source,status,payment_status,order_reference,width_inches,height_inches,quantity,
  production_options,customer_notes,artwork_storage_path,artwork_original_name,artwork_mime_type,artwork_sha256,
  artwork_warnings,shipping_address,customer_total,supplier_shipping,shipping_quote_status,shipping_quote_at,
  shipping_quote_expires_at,linked_customer_order_id,created_at,updated_at
from public.dtf_transfer_orders;
grant select on public.customer_dtf_transfer_orders to authenticated;

revoke select on public.dtf_transfer_orders from authenticated;
grant select(id,owner_user_id,source,status,payment_status,order_reference,width_inches,height_inches,quantity,
  production_options,customer_notes,artwork_storage_path,artwork_original_name,artwork_mime_type,artwork_sha256,
  artwork_warnings,shipping_address,customer_total,supplier_shipping,shipping_quote_status,shipping_quote_at,
  shipping_quote_expires_at,linked_customer_order_id,created_at,updated_at) on public.dtf_transfer_orders to authenticated;

create or replace function public.list_admin_dtf_transfer_orders()
returns setof public.dtf_transfer_orders language plpgsql security definer set search_path=public,auth as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  return query select * from public.dtf_transfer_orders order by created_at desc limit 500;
end $$;
revoke all on function public.list_admin_dtf_transfer_orders() from public;
grant execute on function public.list_admin_dtf_transfer_orders() to authenticated;

create or replace function public.validate_dtf_checkout_resume(p_order_id uuid,p_cart_snapshot jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_row public.dtf_transfer_orders; v_current text;
begin
  select * into v_row from public.dtf_transfer_orders where id=p_order_id and owner_user_id=auth.uid() for update;
  if not found then raise exception 'Transfer order not found'; end if;
  v_current:=public.dtf_transfer_quote_fingerprint(v_row.shipping_address,v_row.artwork_sha256,v_row.width_inches,
    v_row.height_inches,v_row.quantity,v_row.production_options,coalesce(p_cart_snapshot,'[]'::jsonb));
  if v_row.shipping_quote_status in ('quoted','verified_free') and
    (v_row.shipping_quote_expires_at<=now() or v_row.quote_fingerprint is distinct from v_current or
     v_row.shipping_pricing_snapshot->>'fingerprint' is distinct from v_row.quote_fingerprint) then
    update public.dtf_transfer_orders set shipping_quote_status=case when shipping_quote_expires_at<=now() then 'expired' else 'supplier_quote_required' end,
      supplier_shipping=null,shipping_quote_source=null,shipping_quote_at=null,shipping_quote_expires_at=null,updated_at=now()
    where id=v_row.id returning * into v_row;
  end if;
  return jsonb_build_object('id',v_row.id,'order_reference',v_row.order_reference,'shipping_quote_status',v_row.shipping_quote_status,
    'supplier_shipping',v_row.supplier_shipping,'shipping_quote_at',v_row.shipping_quote_at,
    'shipping_quote_expires_at',v_row.shipping_quote_expires_at,'customer_total',v_row.customer_total,
    'linked_customer_order_id',v_row.linked_customer_order_id);
end $$;
revoke all on function public.validate_dtf_checkout_resume(uuid,jsonb) from public;
grant execute on function public.validate_dtf_checkout_resume(uuid,jsonb) to authenticated;

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
    select line,p,
      coalesce((select (variant->>'price')::numeric from jsonb_array_elements(coalesce(p.size_prices,'[]'::jsonb)) variant
        where (lower(coalesce(variant->>'size',''))=lower(coalesce(line->>'color','')||' / '||coalesce(line->>'size',''))
          or (lower(coalesce(variant->>'color',''))=lower(coalesce(line->>'color','')) and lower(coalesce(variant->>'size',''))=lower(coalesce(line->>'size',''))))
          and (line->>'sku' is null or coalesce(variant->>'sku','')=line->>'sku') limit 1),p.sale_price,p.price) unit_price
    from jsonb_array_elements(v_dtf.cart_snapshot) line join public.products p on p.id::text=line->>'product_id'
  )
  select coalesce(jsonb_agg(line||jsonb_build_object('product_name',p.name,'price',unit_price,
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
