begin;

create or replace function public.archive_design_preview_cart_with_design()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.archived_at is not null and old.archived_at is distinct from new.archived_at then
    update public.design_preview_cart_items
    set archived_at = new.archived_at,
        purge_after = new.archived_at + interval '6 months',
        archive_reason = coalesce(new.archive_reason, 'The related confirmed test design was archived.'),
        updated_at = now()
    where design_id = new.id and archived_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists design_preview_cart_follow_design_archive on public.design_documents;
create trigger design_preview_cart_follow_design_archive
after update of archived_at on public.design_documents
for each row execute function public.archive_design_preview_cart_with_design();

do $$
declare
  v_design_id uuid;
begin
  foreach v_design_id in array array[
    'a2a889fb-6ee8-41fa-8c41-2c9e245c89ca'::uuid,
    '931cba66-9789-4c4d-a685-600c3fe68b9a'::uuid
  ]
  loop
    if exists (
      select 1 from public.design_documents
      where id = v_design_id and archived_at is null
    ) then
      perform public.archive_confirmed_test_design(
        v_design_id,
        'Confirmed Design Studio mobile production acceptance fixture.',
        'Created by the authorized 2026-10-03 Design Studio mobile persistence and catalog QA run.'
      );
    end if;
  end loop;
end;
$$;

commit;
