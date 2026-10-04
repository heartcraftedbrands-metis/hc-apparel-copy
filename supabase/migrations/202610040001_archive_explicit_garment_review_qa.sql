begin;

do $$
declare
  v_design record;
begin
  for v_design in
    select id
    from public.design_documents
    where name = 'QA Explicit Garment Review 2026-10-04'
      and archived_at is null
  loop
    perform public.archive_confirmed_test_design(
      v_design.id,
      'Confirmed Design Studio garment eligibility, exact-color image, mobile persistence, and artwork-quality acceptance fixture.',
      'Created by the authorized 2026-10-04 production QA run; includes only isolated admin-preview data.'
    );
  end loop;
end;
$$;

commit;
