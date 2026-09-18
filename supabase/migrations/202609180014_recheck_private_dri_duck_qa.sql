begin;

do $$
begin
  if (select count(*) from public.storefront_products) <> 102 then
    raise exception 'Public catalog changed; recheck before updating private DRI DUCK QA';
  end if;
  if (select count(*) from public.products
      where id in (
        '3599aa56-e60a-4228-bda7-94429b9ff12c',
        'bef05148-962a-4e6b-b00d-906569121f60',
        '2cbb2d17-f451-4c6e-9536-82f5b28cb625',
        '94305c4b-4391-47ea-8ff1-cb50299fc462',
        '898b762a-4f9d-4857-a284-de179f368de5'
      ) and brand = 'DRI DUCK' and visibility = 'draft'
        and is_active is false and vendor_source = 'S&S Activewear'
        and vendor_data_refreshed_at >= timestamptz '2026-09-18 00:00:00+00'
        and stock > 0 and price > 0 and vendor_cost > 0
        and image_url like 'https://www.ssactivewear.com/Images/%'
        and jsonb_array_length(size_prices) > 0
        and jsonb_array_length(available_colors) > 0
        and jsonb_array_length(available_sizes) > 0) <> 5 then
    raise exception 'The exact five private authenticated S&S DRI DUCK drafts are not intact';
  end if;
  if (select count(*) from public.ss_sku_staging s
      where s.brand = 'DRI DUCK'
        and s.style_session_id = 'ss-brand-driduck-2026-09-18T13-47-37-082Z-87d2096d'
        and s.style_name = '3458' and s.inventory_qty > 0
        and s.map_price > 0.01 and s.map_price <= 18.99
        and s.sku is not null and coalesce(s.color_front_image, s.color_on_model_front_image) is not null) <> 3 then
    raise exception 'DRI DUCK 3458 no longer passes private-QA eligibility';
  end if;
  if exists (
    select 1 from public.products p
    join public.storefront_pricing_rules r on r.rule_key = p.storefront_pricing_rule_key and r.is_active
    cross join lateral jsonb_array_elements(p.size_prices) v
    left join public.ss_sku_staging s on s.style_session_id = 'ss-brand-driduck-2026-09-18T13-47-37-082Z-87d2096d'
      and s.brand = 'DRI DUCK' and s.style_name = '3458' and s.sku = v->>'sku'
    where p.id = '3599aa56-e60a-4228-bda7-94429b9ff12c'
      and (s.sku is null or s.inventory_qty <= 0 or s.map_price <= 0.01
        or (v->>'price')::numeric < s.map_price
        or (v->>'price')::numeric > r.maximum_price
        or (v->>'price')::numeric < round(greatest(
          coalesce(nullif(s.customer_price, 0), nullif(s.piece_price, 0)) + coalesce(r.storefront_margin_buffer, 3),
          coalesce(nullif(s.customer_price, 0), nullif(s.piece_price, 0)) * r.cost_multiplier + r.fixed_allowance + coalesce(r.storefront_margin_buffer, 3),
          coalesce(nullif(s.customer_price, 0), nullif(s.piece_price, 0)) / (1 - r.minimum_margin_percent)
        ), 2))
  ) then
    raise exception 'DRI DUCK 3458 attached variant price, MAP, or SKU no longer passes';
  end if;
end;
$$;

alter table public.products drop constraint products_draft_qa_status_check;
alter table public.products add constraint products_draft_qa_status_check
  check (draft_qa_status in ('ready_for_private_qa', 'ready_for_admin_approval', 'approved'));

-- Private QA is not publication approval. Keep both review states locked.
create or replace function public.guard_qa_ready_publication()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.draft_qa_status in ('ready_for_private_qa', 'ready_for_admin_approval')
     and (new.visibility = 'public' or new.is_active is true)
     and new.draft_qa_status is distinct from 'approved' then
    raise exception 'This draft needs admin publication approval before it can be public.';
  end if;
  return new;
end;
$$;

update public.products p set
  draft_qa_status = case when p.style_number = '3458' then 'ready_for_private_qa' else null end,
  draft_qa_reviewed_at = case when p.style_number = '3458' then now() else null end,
  vendor_specs = jsonb_set(coalesce(p.vendor_specs, '{}'::jsonb), '{map_review_required}',
    to_jsonb(p.style_number = '9340'), true),
  internal_notes = case p.style_number
    when '3458' then 'Ready for Private QA — not published. Authenticated S&S image loads; 3 stocked SKUs match S&S staging. Real MAP $16.47; all public candidates $16.47 satisfy the hat cap $18.99 and stored margin rule. Private detail/cart QA and separate admin publication approval remain required.'
    when '5020' then 'Blocked — not published. Authenticated S&S image and 65 stocked SKUs are present. Real MAP $96.80–$117.40; all 65 MAP-aware public prices exceed the stored outerwear cap $79.99. Review category price cap/business fit; do not price below MAP.'
    when '7035' then 'Blocked — not published. Authenticated S&S image and 28 stocked SKUs are present. Real MAP $63.84–$71.05; all 28 MAP-aware public prices exceed the stored fleece cap $59.99. Review category price cap/business fit; do not price below MAP.'
    when '9340' then 'Blocked — MAP not verified. Authenticated S&S image and 10 stocked SKUs are present. S&S MAP value is $0.01 placeholder, not clearance. Calculated public prices $52.14–$56.41 fit the stored fleece cap $59.99, but MAP must be verified before private QA readiness.'
    when '9416' then 'Blocked — not published. Authenticated S&S image and 6 stocked SKUs are present. Real MAP $82.38–$88.56; all 6 MAP-aware public prices exceed the stored outerwear cap $79.99. Review category price cap/business fit; do not price below MAP.'
  end
where p.brand = 'DRI DUCK' and p.created_date::date = date '2026-09-18'
  and p.style_number in ('3458', '5020', '7035', '9340', '9416')
  and p.visibility = 'draft' and p.is_active is false;

do $$
begin
  if (select count(*) from public.products where brand = 'DRI DUCK'
      and created_date::date = date '2026-09-18'
      and visibility = 'draft' and is_active is false) <> 5
    or (select count(*) from public.products where brand = 'DRI DUCK'
      and created_date::date = date '2026-09-18'
      and draft_qa_status = 'ready_for_private_qa') <> 1
    or (select count(*) from public.storefront_products) <> 102 then
    raise exception 'Private DRI DUCK QA update changed public visibility or status unexpectedly';
  end if;
end;
$$;

commit;
