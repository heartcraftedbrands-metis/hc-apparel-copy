begin;

do $$
declare
  v_design record;
begin
  for v_design in
    select id, name from public.design_documents
    where name ilike '%Design Studio%Persistence%'
  loop
    if exists (
      select 1 from public.design_documents
      where id = v_design.id and (status <> 'archived' or archived_at is null or purge_after is null)
    ) then
      perform public.archive_confirmed_test_design(
        v_design.id,
        'Confirmed Design Studio browser acceptance fixture.',
        'Created by the authorized 2026-10-03 Design Studio production QA run.'
      );
    end if;
  end loop;

  if exists (
    select 1 from public.design_documents
    where name ilike '%Design Studio%Persistence%'
      and (status <> 'archived' or archived_at is null or purge_after is null)
  ) then
    raise exception 'A Design Studio persistence QA fixture is still active';
  end if;
end;
$$;

commit;
