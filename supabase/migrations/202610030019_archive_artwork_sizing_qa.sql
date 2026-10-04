begin;

do $$
declare
  v_design record;
begin
  for v_design in
    select id
    from public.design_documents
    where name = 'QA Artwork Sizing 2026-10-03'
      and archived_at is null
  loop
    perform public.archive_confirmed_test_design(
      v_design.id,
      'Confirmed Design Studio artwork sizing and 300-DPI production-readiness acceptance fixture.',
      'Created by the authorized 2026-10-03 mobile and desktop sizing, save, version, preview-cart, persistence, and canvas-resize QA run.'
    );
  end loop;
end;
$$;

commit;
