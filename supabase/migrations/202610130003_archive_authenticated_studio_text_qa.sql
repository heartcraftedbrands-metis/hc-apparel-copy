begin;

do $$
declare
  v_design_id uuid;
  v_match_count integer;
begin
  select count(*), min(id::text)::uuid
  into v_match_count, v_design_id
  from public.design_documents
  where name = 'AUTH QA Text Persistence 2026-10-13'
    and status <> 'ordered'
    and archived_at is null;

  if v_match_count <> 1 then
    raise exception 'Expected exactly one active authenticated Studio QA design, found %', v_match_count;
  end if;

  perform public.archive_confirmed_test_design(
    v_design_id,
    'Confirmed authenticated Design Studio text-editor acceptance fixture.',
    'Created and verified by the authorized 2026-10-13 authenticated Design Studio acceptance run.'
  );
end;
$$;

commit;
