-- User-authorized archival of records confirmed by QA content and verification history.
update public.quote_requests
set archived_previous_status = case when status = 'archived' then archived_previous_status else status end,
    archived_previous_workflow_status = case when status = 'archived' then archived_previous_workflow_status else workflow_status end,
    status = 'archived',
    archived_at = coalesce(archived_at, now()),
    archive_reason = case id
      when '7258b44b-19a4-4c1b-ac08-947486b096e8' then 'Controlled iPhone quote receipt QA; user authorized archival.'
      when '6a3f20c9ed1087a5cadecf6d' then 'Final catalog QA request; explicit QA name, address, phone, and project note.'
    end,
    updated_date = now()
where id in ('7258b44b-19a4-4c1b-ac08-947486b096e8', '6a3f20c9ed1087a5cadecf6d')
  and status <> 'archived';
