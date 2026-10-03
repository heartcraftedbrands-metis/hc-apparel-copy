begin;

create or replace function public.archive_confirmed_test_design(
  p_design_id uuid,
  p_reason text,
  p_provenance text
)
returns jsonb
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_design public.design_documents%rowtype;
  v_archived_at timestamptz := clock_timestamp();
  v_purge_after timestamptz;
  v_archive_id uuid;
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Server-side test archiving only' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null or nullif(btrim(p_provenance), '') is null then
    raise exception 'Archive reason and provenance are required' using errcode = '23514';
  end if;

  select * into v_design from public.design_documents where id = p_design_id for update;
  if not found then raise exception 'Design not found' using errcode = 'P0002'; end if;
  if v_design.archived_at is not null then
    return jsonb_build_object('archived', true, 'already_archived', true,
      'design_id', v_design.id, 'archived_at', v_design.archived_at,
      'purge_after', v_design.purge_after);
  end if;

  v_purge_after := v_archived_at + interval '6 months';
  insert into public.test_data_archives(
    record_type, record_id, record_environment, confirmed_test, archived_at,
    purge_after, archive_reason, archive_provenance, original_snapshot, related_records
  ) values (
    'design_document', v_design.id::text, 'qa', true, v_archived_at,
    v_purge_after, btrim(p_reason), btrim(p_provenance), to_jsonb(v_design),
    jsonb_build_object(
      'design_versions', (select count(*) from public.design_versions where design_id = v_design.id),
      'design_assets', (select count(*) from public.design_assets where design_id = v_design.id)
    )
  )
  on conflict(record_type, record_id) do update set
    confirmed_test = true,
    archived_at = excluded.archived_at,
    purge_after = excluded.purge_after,
    archive_reason = excluded.archive_reason,
    archive_provenance = excluded.archive_provenance,
    original_snapshot = excluded.original_snapshot,
    related_records = excluded.related_records,
    purged_at = null,
    purge_result = null,
    updated_at = now()
  returning id into v_archive_id;

  insert into public.test_archive_files(archive_id, bucket_id, object_path, exclusive_test_only)
  select v_archive_id, asset.storage_bucket, asset.storage_path, true
  from public.design_assets asset
  where asset.design_id = v_design.id
  on conflict(bucket_id, object_path) do update set
    archive_id = excluded.archive_id,
    exclusive_test_only = excluded.exclusive_test_only,
    deleted_at = null;

  update public.design_documents set
    status = 'archived',
    archived_at = v_archived_at,
    purge_after = v_purge_after::date,
    archive_reason = btrim(p_reason),
    updated_at = now()
  where id = v_design.id;

  return jsonb_build_object('archived', true, 'already_archived', false,
    'design_id', v_design.id, 'archive_id', v_archive_id,
    'archived_at', v_archived_at, 'purge_after', v_purge_after);
end;
$$;

revoke all on function public.archive_confirmed_test_design(uuid,text,text) from public, anon, authenticated;
grant execute on function public.archive_confirmed_test_design(uuid,text,text) to service_role;

create or replace function public.purge_expired_design_studio_test_archives()
returns jsonb
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_archive public.test_data_archives%rowtype;
  v_file public.test_archive_files%rowtype;
  v_files integer;
  v_dependents integer;
  v_total integer := 0;
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Server-side cleanup only' using errcode = '42501';
  end if;

  for v_archive in
    select * from public.test_data_archives
    where record_type = 'design_document'
      and confirmed_test is true
      and purged_at is null
      and purge_after <= clock_timestamp()
    order by purge_after for update skip locked
  loop
    if not exists (
      select 1 from public.design_documents design
      where design.id = v_archive.record_id::uuid
        and design.status = 'archived'
        and design.archived_at is not null
        and design.purge_after <= current_date
    ) then continue; end if;

    v_files := 0;
    for v_file in
      select * from public.test_archive_files
      where archive_id = v_archive.id and deleted_at is null and exclusive_test_only is true
    loop
      if not exists (
        select 1 from public.design_assets asset
        where asset.storage_path = v_file.object_path
          and asset.design_id <> v_archive.record_id::uuid
      ) then
        delete from storage.objects where bucket_id = v_file.bucket_id and name = v_file.object_path;
        update public.test_archive_files set deleted_at = now() where id = v_file.id;
        v_files := v_files + 1;
      end if;
    end loop;

    delete from public.design_documents
    where id = v_archive.record_id::uuid and status = 'archived' and archived_at is not null;
    get diagnostics v_dependents = row_count;

    update public.test_data_archives set
      purged_at = now(),
      original_snapshot = jsonb_build_object('purged', true),
      related_records = '{}'::jsonb,
      purge_result = jsonb_build_object(
        'stored_files_deleted', v_files,
        'design_document_deleted', v_dependents = 1,
        'external_provider_records_deleted', false
      ),
      updated_at = now()
    where id = v_archive.id;

    insert into public.test_data_purge_log(
      record_type, record_id, archive_id, dependent_rows_deleted, stored_files_deleted
    ) values (
      v_archive.record_type, v_archive.record_id, v_archive.id, v_dependents, v_files
    );
    v_total := v_total + 1;
  end loop;

  return jsonb_build_object('archives_purged', v_total, 'ran_at', now());
end;
$$;

revoke all on function public.purge_expired_design_studio_test_archives() from public, anon, authenticated;
grant execute on function public.purge_expired_design_studio_test_archives() to service_role;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'purge-expired-design-studio-tests';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  perform cron.schedule(
    'purge-expired-design-studio-tests',
    '25 4 * * *',
    'select public.purge_expired_design_studio_test_archives();'
  );
end;
$$;

do $$
declare
  v_design record;
begin
  for v_design in
    select id from public.design_documents
    where name = 'QA - Design Studio Persistence 2026-10-03'
      and archived_at is null
  loop
    perform public.archive_confirmed_test_design(
      v_design.id,
      'Confirmed Design Studio browser acceptance fixture.',
      'Created by the authorized 2026-10-03 Design Studio production QA run.'
    );
  end loop;
end;
$$;

commit;
