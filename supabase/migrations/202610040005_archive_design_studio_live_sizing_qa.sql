begin;

do $$
declare
  v_design record;
begin
  for v_design in
    select id
    from public.design_documents
    where name = 'QA Live Sizing 2026-10-04'
      and archived_at is null
  loop
    perform public.archive_confirmed_test_design(
      v_design.id,
      'Confirmed private Design Studio live-sizing acceptance fixture.',
      'Created by the authorized 2026-10-04 mobile inch-to-canvas, canvas-to-inch, quality, history, save, reopen, and preview-cart QA run.'
    );
  end loop;
end;
$$;

commit;
