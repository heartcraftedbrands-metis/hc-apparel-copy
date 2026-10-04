begin;

do $$
declare
  v_design record;
begin
  for v_design in
    select id
    from public.design_documents
    where name = 'QA HC Vinyl Mobile 2026-10-03'
      and archived_at is null
  loop
    perform public.archive_confirmed_test_design(
      v_design.id,
      'Confirmed HC-operated vinyl Design Studio production acceptance fixture.',
      'Created by the authorized 2026-10-03 mobile and desktop method, persistence, pricing-blocker, and preview-cart QA run.'
    );
  end loop;
end;
$$;

commit;
