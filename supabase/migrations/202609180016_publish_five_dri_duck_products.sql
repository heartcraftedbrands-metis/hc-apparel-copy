begin;

do $$
declare
  before_count integer;
  changed_count integer;
begin
  select count(*) into before_count from public.storefront_products;
  if before_count <> 102 then
    raise exception 'Public catalog count changed; recheck before DRI DUCK publication';
  end if;

  if (select count(*) from public.products p
      join public.storefront_pricing_rules r
        on r.rule_key = p.storefront_pricing_rule_key and r.is_active
      where p.id in (
        '3599aa56-e60a-4228-bda7-94429b9ff12c',
        'bef05148-962a-4e6b-b00d-906569121f60',
        '2cbb2d17-f451-4c6e-9536-82f5b28cb625',
        '94305c4b-4391-47ea-8ff1-cb50299fc462',
        '898b762a-4f9d-4857-a284-de179f368de5'
      ) and p.brand = 'DRI DUCK' and p.created_date::date = date '2026-09-18'
        and p.visibility = 'draft' and p.is_active is false
        and p.product_type = 'physical' and p.vendor_source = 'S&S Activewear'
        and p.vendor_data_refreshed_at >= timestamptz '2026-09-18 00:00:00+00'
        and p.stock > 0 and p.price > 0 and p.vendor_cost > 0
        and p.image_url like 'https://www.ssactivewear.com/Images/%'
        and p.vendor_specs = '{}'::jsonb
        and p.name like 'DRI DUCK - %' and nullif(btrim(p.description), '') is not null
        and p.name !~* '(^|[^[:alnum:]_])(private|internal|qa|test)([^[:alnum:]_]|$)|(launch|catalog)[-[:space:]]?batch|not[[:space:]]+approved'
        and p.description !~* '(^|[^[:alnum:]_])(private|internal|qa|test)([^[:alnum:]_]|$)|(launch|catalog)[-[:space:]]?batch|not[[:space:]]+approved'
        and jsonb_array_length(p.size_prices) > 0
        and jsonb_array_length(p.available_sizes) > 0
        and jsonb_array_length(p.available_colors) > 0
        and p.price = (select min((v->>'price')::numeric)
          from jsonb_array_elements(p.size_prices) v)
        and (p.style_number <> '3458' or p.draft_qa_status = 'ready_for_private_qa')
      ) <> 5 then
    raise exception 'Exactly five private DRI DUCK products did not pass publication prerequisites';
  end if;

  if exists (
    select 1 from public.products p
    join public.storefront_pricing_rules r
      on r.rule_key = p.storefront_pricing_rule_key and r.is_active
    cross join lateral jsonb_array_elements(p.size_prices) v
    left join public.ss_sku_staging s
      on s.style_session_id = 'ss-brand-driduck-2026-09-18T13-47-37-082Z-87d2096d'
      and s.brand = 'DRI DUCK' and s.style_name = p.style_number
      and s.sku = v->>'sku'
    where p.id in (
      '3599aa56-e60a-4228-bda7-94429b9ff12c',
      'bef05148-962a-4e6b-b00d-906569121f60',
      '2cbb2d17-f451-4c6e-9536-82f5b28cb625',
      '94305c4b-4391-47ea-8ff1-cb50299fc462',
      '898b762a-4f9d-4857-a284-de179f368de5'
    ) and (
      s.sku is null or s.inventory_qty <= 0
      or (v->>'inventory')::numeric <= 0
      or nullif(v->>'image_url', '') is null
      or (v->>'price')::numeric > r.maximum_price
      or (s.map_price > 0.01 and (v->>'price')::numeric < s.map_price)
      or (v->>'price')::numeric <> round(greatest(
        coalesce(nullif(s.customer_price, 0), nullif(s.piece_price, 0)) + coalesce(r.storefront_margin_buffer, 3),
        coalesce(nullif(s.customer_price, 0), nullif(s.piece_price, 0)) * r.cost_multiplier + r.fixed_allowance + coalesce(r.storefront_margin_buffer, 3),
        coalesce(nullif(s.customer_price, 0), nullif(s.piece_price, 0)) / (1 - r.minimum_margin_percent),
        case when s.map_price > 0.01 then s.map_price else 0 end
      ), 2)
    )
  ) then
    raise exception 'A DRI DUCK SKU fails inventory, image, price rule, or real MAP';
  end if;

  update public.products p set
    visibility = 'public', is_active = true,
    draft_qa_status = 'approved', draft_qa_reviewed_at = now(),
    internal_notes = case when p.style_number = '9340' then
      'Published after explicit owner approval and private detail/cart QA on 2026-09-18. S&S MAP is $0.01 placeholder and remains unverified; no verified MAP floor was represented to customers. Pricing follows the DRI DUCK-specific margin rule. Vendor cost and this note are admin-only.'
    else
      'Published after explicit owner approval and private detail/cart QA on 2026-09-18. S&S real MAP, pricing rule, inventory, image, and SKU variants passed. Vendor cost and this note are admin-only.' end
  where p.id in (
    '3599aa56-e60a-4228-bda7-94429b9ff12c',
    'bef05148-962a-4e6b-b00d-906569121f60',
    '2cbb2d17-f451-4c6e-9536-82f5b28cb625',
    '94305c4b-4391-47ea-8ff1-cb50299fc462',
    '898b762a-4f9d-4857-a284-de179f368de5'
  ) and p.brand = 'DRI DUCK' and p.visibility = 'draft'
    and p.is_active is false;
  get diagnostics changed_count = row_count;
  if changed_count <> 5 then
    raise exception 'Expected to publish exactly five DRI DUCK rows, updated %', changed_count;
  end if;

  if (select count(*) from public.storefront_products) <> before_count + 5
     or (select count(*) from public.storefront_products where brand = 'DRI DUCK'
         and id in (
           '3599aa56-e60a-4228-bda7-94429b9ff12c',
           'bef05148-962a-4e6b-b00d-906569121f60',
           '2cbb2d17-f451-4c6e-9536-82f5b28cb625',
           '94305c4b-4391-47ea-8ff1-cb50299fc462',
           '898b762a-4f9d-4857-a284-de179f368de5'
         )) <> 5 then
    raise exception 'Expected exactly five new storefront products';
  end if;
  if exists (select 1 from public.storefront_products where brand = 'DRI DUCK'
      and (size_prices->0 ? 'vendor_cost' or vendor_specs <> '{}'::jsonb)) then
    raise exception 'Vendor-only DRI DUCK fields appeared in the storefront view';
  end if;
end;
$$;

commit;
