begin;

do $$
declare
  before_count integer;
  changed_count integer;
  after_count integer;
begin
  select count(*) into before_count from public.storefront_products;
  if before_count <> 100 then
    raise exception 'Public catalog count changed; review before publishing';
  end if;

  if (select count(*) from public.products p
      where p.id in ('0e764aaf-9774-487a-addd-fe3f5ad6059c',
                     '01ce9d6d-2e28-4cc1-8c93-223d494f1553')
        and p.brand = 'Comfort Colors'
        and p.style_number in ('00108', '00908')
        and p.visibility = 'draft' and p.is_active is false
        and p.draft_qa_status = 'ready_for_admin_approval'
        and p.product_type = 'physical'
        and p.stock > 0 and p.price > 0
        and p.vendor_data_refreshed_at >= timestamp with time zone '2026-09-18 00:00:00+00'
        and nullif(btrim(p.image_url), '') is not null
        and jsonb_array_length(p.size_prices) > 0
        and jsonb_array_length(p.available_sizes) > 0
        and jsonb_array_length(p.available_colors) > 0
        and p.name !~* '(^|[^[:alnum:]_])(private|internal|qa|test)([^[:alnum:]_]|$)|(launch|catalog)[-[:space:]]?batch|not[[:space:]]+approved'
        and p.description !~* '(^|[^[:alnum:]_])(private|internal|qa|test)([^[:alnum:]_]|$)|(launch|catalog)[-[:space:]]?batch|not[[:space:]]+approved'
     ) <> 2 then
    raise exception 'The exact two approved Comfort Colors drafts no longer pass publication checks';
  end if;

  if exists (
    select 1 from public.products p
    join public.storefront_pricing_rules r on r.rule_key = p.storefront_pricing_rule_key and r.is_active
    cross join lateral jsonb_array_elements(p.size_prices) v
    where p.id in ('0e764aaf-9774-487a-addd-fe3f5ad6059c',
                   '01ce9d6d-2e28-4cc1-8c93-223d494f1553')
      and ((v->>'inventory')::numeric <= 0
        or nullif(v->>'sku', '') is null or nullif(v->>'image_url', '') is null
        or (v->>'price')::numeric < round(greatest(
          (v->>'vendor_cost')::numeric + coalesce(r.storefront_margin_buffer, 3),
          (v->>'vendor_cost')::numeric * r.cost_multiplier + r.fixed_allowance + coalesce(r.storefront_margin_buffer, 3),
          (v->>'vendor_cost')::numeric / (1 - r.minimum_margin_percent)
        ), 2)
        or (v->>'price')::numeric > r.maximum_price)
  ) then
    raise exception 'A selected variant fails inventory, image, SKU, or price guardrails';
  end if;

  update public.products p
  set visibility = 'public', is_active = true, draft_qa_status = 'approved',
      internal_notes = 'Published after explicit admin approval and private product/cart QA on 2026-09-18. Vendor cost and QA history remain admin-only.'
  where p.id in ('0e764aaf-9774-487a-addd-fe3f5ad6059c',
                 '01ce9d6d-2e28-4cc1-8c93-223d494f1553')
    and p.brand = 'Comfort Colors'
    and p.style_number in ('00108', '00908')
    and p.visibility = 'draft' and p.is_active is false
    and p.draft_qa_status = 'ready_for_admin_approval';
  get diagnostics changed_count = row_count;
  if changed_count <> 2 then
    raise exception 'Expected to publish exactly two rows, updated %', changed_count;
  end if;

  select count(*) into after_count from public.storefront_products;
  if after_count <> before_count + 2 then
    raise exception 'Expected two additional storefront rows, found %', after_count - before_count;
  end if;
  if (select count(*) from public.storefront_products where id in
    ('0e764aaf-9774-487a-addd-fe3f5ad6059c', '01ce9d6d-2e28-4cc1-8c93-223d494f1553')) <> 2 then
    raise exception 'Approved products are not both visible in the storefront projection';
  end if;
  if exists (select 1 from public.products where brand in ('Comfort Colors', 'DRI DUCK')
      and created_date::date = date '2026-09-18'
      and style_number not in ('00108', '00908')
      and (visibility <> 'draft' or is_active is true)) then
    raise exception 'Another private brand draft became public';
  end if;
end;
$$;

commit;
