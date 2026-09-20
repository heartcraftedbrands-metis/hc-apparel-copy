-- Record private QA disposition without publishing any Champion product.
begin;

update public.products
set internal_notes = case
  when style_number = 'CHP180' then
    'Private QA blocked: only one stocked S&S variant/unit is currently available. Keep inactive until inventory improves and QA is rerun. Not published.'
  else
    'Ready for Admin Approval only. Authenticated S&S image, customer-safe name and copy, category, current stocked SKU variants, colors, sizes, MAP handling, guardrail pricing, private product detail, isolated QA cart, and mobile layout passed. Not published.'
end
where brand = 'Champion' and visibility = 'draft' and is_active is false
  and style_number = any(array[
    'CO100','CO126','8187','S171','CO125','P930','S800','S450','S149','S101',
    'CHP180','CHP200','CHP115','CHP160','SL650','CHP100','CHP120','CHP140','CHP130','S790'
  ]);

do $$
declare
  v_ready integer;
  v_blocked integer;
begin
  select count(*) filter (where internal_notes like 'Ready for Admin Approval only.%'),
         count(*) filter (where internal_notes like 'Private QA blocked:%')
    into v_ready, v_blocked
  from public.products
  where brand = 'Champion' and visibility = 'draft' and is_active is false
    and style_number = any(array[
      'CO100','CO126','8187','S171','CO125','P930','S800','S450','S149','S101',
      'CHP180','CHP200','CHP115','CHP160','SL650','CHP100','CHP120','CHP140','CHP130','S790'
    ])
    and (internal_notes like 'Ready for Admin Approval only.%'
      or internal_notes like 'Private QA blocked:%');
  if v_ready <> 19 or v_blocked < 1 then
    raise exception 'Champion QA disposition mismatch (ready %, blocked %)', v_ready, v_blocked;
  end if;
end $$;

commit;
