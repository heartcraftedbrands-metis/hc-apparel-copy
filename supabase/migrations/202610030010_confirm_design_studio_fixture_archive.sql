begin;

do $$
declare
  v_design record;
  v_found integer := 0;
begin
  for v_design in
    select id from public.design_documents
    where name like 'QA - Design Studio Persistence 2026-10-03%'
      and archived_at is null
  loop
    v_found := v_found + 1;
    perform public.archive_confirmed_test_design(
      v_design.id,
      'Confirmed Design Studio browser acceptance fixture.',
      'Created by the authorized 2026-10-03 Design Studio production QA run.'
    );
  end loop;

  if exists (
    select 1 from public.design_documents
    where name like 'QA - Design Studio Persistence 2026-10-03%'
      and (status <> 'archived' or archived_at is null or purge_after is null)
  ) then
    raise exception 'Design Studio QA fixture archive verification failed';
  end if;
end;
$$;

commit;
