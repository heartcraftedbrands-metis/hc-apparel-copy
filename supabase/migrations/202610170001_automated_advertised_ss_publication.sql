begin;

create or replace function public.auto_publish_advertised_ss_session(p_style_session_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target record;
  v_product public.products%rowtype;
  v_product_id text;
  v_rule public.storefront_pricing_rules%rowtype;
  v_image text;
  v_name text;
  v_description text;
  v_variants jsonb;
  v_sizes jsonb;
  v_colors jsonb;
  v_price numeric;
  v_cost numeric;
  v_stock bigint;
  v_results jsonb := '[]'::jsonb;
  v_status text;
  v_message text;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  for v_target in
    with advertised(brand, advertised_style, supplier_alias, primary_type, category, product_subtype, rule_key, audience_tag) as (
      values
        ('American Apparel','FTEX00','FTEX00','t_shirts','short_sleeve_shirts','t_shirts','heavyweight_tshirt','mens'),
        ('American Apparel','1302GD','1302GD','t_shirts','womens_short_sleeve_shirts','t_shirts','heavyweight_tshirt','womens'),
        ('American Apparel','13ML0','13ML0','t_shirts','short_sleeve_shirts','t_shirts','heavyweight_tshirt','mens'),
        ('American Apparel','1301GD','1301GD','t_shirts','short_sleeve_shirts','t_shirts','heavyweight_tshirt','mens'),
        ('Lane Seven','LS19001','LS19001','hoodies','hoodies','hoodies','hoodie','mens'),
        ('Next Level','9303','9303','hoodies','hoodies','hoodies','hoodie','mens'),
        ('Independent Trading Co','SS4001Y','SS4001Y','hoodies','hoodies','hoodies','hoodie','kids'),
        ('Independent Trading Co','PRM1500Y','PRM1500Y','hoodies','hoodies','hoodies','hoodie','kids'),
        ('Independent Trading Co','IND330BLV','IND330BLV','hoodies','hoodies','hoodies','hoodie','mens'),
        ('Independent Trading Co','IND420XD','IND420XD','hoodies','hoodies','hoodies','hoodie','mens'),
        ('Comfort Colors','1566L','00408','crewnecks','womens_crewnecks','sweatshirts','crewneck','womens'),
        ('Comfort Colors','1567','70108','hoodies','hoodies','hoodies','hoodie','mens')
    )
    select a.*, s.style_id,
      max(nullif(s.style_name, '')) style_name,
      max(nullif(s.part_number, '')) part_number,
      max(coalesce(nullif(s.color_on_model_front_image,''), nullif(s.color_front_image,''), nullif(s.color_swatch_image,''))) image_url,
      max(nullif(s.raw_product->>'title','')) supplier_title,
      max(nullif(s.raw_product->>'description','')) supplier_description,
      max(s.fetched_at) fetched_at
    from advertised a
    join public.ss_sku_staging s
      on s.style_session_id = p_style_session_id
     and lower(s.brand) = lower(a.brand)
     and (upper(coalesce(s.part_number,'')) = upper(a.supplier_alias)
       or upper(coalesce(s.style_name,'')) = upper(a.advertised_style))
    group by a.brand,a.advertised_style,a.supplier_alias,a.primary_type,a.category,
      a.product_subtype,a.rule_key,a.audience_tag,s.style_id
  loop
    begin
      select * into v_rule from public.storefront_pricing_rules
      where rule_key = v_target.rule_key and is_active;
      if not found then
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'brand',v_target.brand,'style',v_target.advertised_style,'status','blocked',
          'message','No applicable active pricing rule: ' || v_target.rule_key));
        continue;
      end if;

      select coalesce(sum(s.inventory_qty),0), min(coalesce(s.customer_price,s.piece_price)),
        max(coalesce(nullif(s.color_on_model_front_image,''), nullif(s.color_front_image,''), nullif(s.color_swatch_image,'')))
      into v_stock,v_cost,v_image
      from public.ss_sku_staging s
      where s.style_session_id = p_style_session_id and s.style_id = v_target.style_id
        and s.inventory_qty > 0 and coalesce(s.customer_price,s.piece_price) > 0
        and coalesce(s.noe_retailing,false) is false;

      if v_stock < 25 or v_cost is null or v_image is null then
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'brand',v_target.brand,'style',v_target.advertised_style,'status','blocked',
          'message',case when v_stock < 25 then 'Insufficient current supplier inventory'
            when v_cost is null then 'Missing current supplier price' else 'Missing supplier product image' end));
        continue;
      end if;

      select p.* into v_product from public.products p
      where lower(coalesce(p.brand,'')) = lower(v_target.brand)
        and (upper(coalesce(p.style_number,'')) in (upper(v_target.advertised_style),upper(v_target.supplier_alias))
          or upper(coalesce(p.supplier_sku,'')) in (upper(v_target.advertised_style),upper(v_target.supplier_alias)))
      order by (p.visibility = 'public' and p.is_active) desc, p.updated_date desc nulls last
      limit 1;

      v_name := coalesce(nullif(v_target.supplier_title,''),nullif(v_target.style_name,''),v_target.advertised_style);
      if lower(v_name) not like (lower(v_target.brand) || '%') then v_name := v_target.brand || ' ' || v_name; end if;
      v_description := coalesce(nullif(regexp_replace(v_target.supplier_description,'<[^>]+>',' ','g'),''),
        v_name || ' blank garment. Custom printing is optional and quoted separately.');

      if not found then
        v_product_id := gen_random_uuid()::text;
        insert into public.products (
          id,owner_user_id,name,description,price,product_type,product_subtype,visibility,
          image_url,mockup_images,stock,category,categories,tags,is_active,vendor_source,
          vendor_cost,blank_garment_cost,profit_estimate,internal_notes,supplier_sku,brand,
          style_number,primary_garment_type,secondary_tags,storefront_pricing_rule_key,
          storefront_image_approved,vendor_data_refreshed_at,draft_qa_status
        ) values (
          v_product_id,auth.uid(),v_name,v_description,public.ss_staged_safe_price(v_cost),'physical',
          v_target.product_subtype,'draft',v_image,jsonb_build_array(v_image),v_stock,v_target.category,
          jsonb_build_array(v_target.primary_type,'apparel_blanks'),
          jsonb_build_array('S&S Activewear','storefront:'||v_target.audience_tag),false,'S&S Activewear',
          v_cost,v_cost,greatest(public.ss_staged_safe_price(v_cost)-v_cost,0),
          'Automated advertised-product import. Exact S&S brand/style match; pending atomic price and QA checks.',
          coalesce(v_target.part_number,v_target.supplier_alias),v_target.brand,v_target.advertised_style,v_target.primary_type,
          jsonb_build_array(v_target.audience_tag),v_target.rule_key,true,v_target.fetched_at,'ready_for_private_qa'
        );
        select * into v_product from public.products where id = v_product_id;
        v_status := 'published';
      else
        v_product_id := v_product.id;
        v_status := case when v_product.visibility='public' and v_product.is_active then 'updated' else 'published' end;
        update public.products set storefront_pricing_rule_key=v_target.rule_key,category=v_target.category,
          product_subtype=v_target.product_subtype,primary_garment_type=v_target.primary_type,
          brand=v_target.brand,style_number=v_target.advertised_style,supplier_sku=coalesce(v_target.part_number,v_target.supplier_alias),
          vendor_cost=v_cost,blank_garment_cost=v_cost,vendor_data_refreshed_at=v_target.fetched_at
          ,updated_date=now()
        where id=v_product_id;
        select * into v_product from public.products where id=v_product_id;
      end if;

      select jsonb_agg(jsonb_build_object(
          'sku',s.sku,'size',s.size_name,'color',s.color_name,
          'price',public.product_variant_safe_price(v_product,coalesce(s.customer_price,s.piece_price)),
          'vendor_cost',coalesce(s.customer_price,s.piece_price),'inventory',s.inventory_qty,
          'color_name',s.color_name,'color_code',s.color_code,
          'image_url',coalesce(nullif(s.color_on_model_front_image,''),nullif(s.color_front_image,''),v_image),
          'color_swatch_image',s.color_swatch_image,'unit_weight',s.unit_weight
        ) order by s.color_name,s.size_order,s.size_name,s.sku),
        to_jsonb(array_agg(distinct s.size_name order by s.size_name)),
        jsonb_agg(distinct jsonb_build_object('name',s.color_name,'color_code',s.color_code,'swatch_image',s.color_swatch_image)),
        min(public.product_variant_safe_price(v_product,coalesce(s.customer_price,s.piece_price)))
      into v_variants,v_sizes,v_colors,v_price
      from public.ss_sku_staging s
      where s.style_session_id=p_style_session_id and s.style_id=v_target.style_id
        and s.inventory_qty>0 and coalesce(s.customer_price,s.piece_price)>0
        and coalesce(s.noe_retailing,false) is false;

      if v_price is null or jsonb_array_length(coalesce(v_variants,'[]'::jsonb))=0 then
        raise exception 'No publishable priced variants remained';
      end if;

      update public.products set name=v_name,description=v_description,price=v_price,sale_price=null,
        image_url=v_image,mockup_images=jsonb_build_array(v_image),stock=v_stock,
        available_sizes=v_sizes,available_colors=v_colors,size_prices=v_variants,
        visibility='public',is_active=true,draft_qa_status='approved',draft_qa_reviewed_at=now(),
        storefront_price_applied_at=now(),storefront_image_approved=true,
        profit_estimate=greatest(v_price-v_cost-public.worst_enabled_processing_cost(v_price),0),
        price_edit_note='Automated exact-style S&S synchronization using the active HC Apparel pricing rule and enabled payment-fee protection.',
        internal_notes='Published automatically after exact S&S brand/style, duplicate, image, inventory, SKU, size/color, active pricing-rule, margin, and payment-fee QA. Supplier cost remains private.'
        ,updated_date=now()
      where id=v_product_id;

      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'brand',v_target.brand,'style',v_target.advertised_style,'supplier_style',coalesce(v_target.part_number,v_target.supplier_alias),
        'status',v_status,'product_id',v_product_id,'price',v_price,'stock',v_stock,
        'variants',jsonb_array_length(v_variants)));
    exception when others then
      get stacked diagnostics v_message = message_text;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'brand',v_target.brand,'style',v_target.advertised_style,'status','blocked','message',v_message));
    end;
  end loop;

  return v_results;
end;
$$;

revoke all on function public.auto_publish_advertised_ss_session(text) from public,anon;
grant execute on function public.auto_publish_advertised_ss_session(text) to authenticated;

commit;
