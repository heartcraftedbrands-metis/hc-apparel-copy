begin;

do $$
declare
  v_design record;
begin
  for v_design in
    select id
    from public.design_documents
    where name = 'QA Customer Journey 2026-10-04 1110'
      and archived_at is null
  loop
    perform public.archive_confirmed_test_design(
      v_design.id,
      'Confirmed private Design Studio customer-experience acceptance fixture.',
      'Created by the authorized 2026-10-04 mobile garment, upload, artwork-quality, layer, save, reopen, and preview-cart QA run.'
    );
  end loop;
end;
$$;

commit;
