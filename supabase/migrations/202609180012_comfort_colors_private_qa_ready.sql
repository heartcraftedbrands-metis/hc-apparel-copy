begin;

alter table public.products
  add column if not exists draft_qa_status text
    check (draft_qa_status in ('ready_for_admin_approval', 'approved')),
  add column if not exists draft_qa_reviewed_at timestamptz;

-- These two private products passed admin detail and isolated QA-cart checks.
-- Approval and publication remain separate future actions.
update public.products
set draft_qa_status = 'ready_for_admin_approval',
    draft_qa_reviewed_at = now(),
    internal_notes = case style_number
      when '00108' then 'Ready for Admin Approval only. Private detail, image, 8 colors/5 sizes, 40 stocked variants, Black/M SKU B00108504 at $24.15, and isolated QA cart passed. No public cart, checkout, order, or vendor submission. Do not publish before explicit admin approval.'
      when '00908' then 'Ready for Admin Approval only. Private detail, image, 11 colors/6 sizes, 64 stocked variants, Black/M SKU B00908504 at $24.19, and isolated QA cart passed. No public cart, checkout, order, or vendor submission. Do not publish before explicit admin approval.'
    end
where brand = 'Comfort Colors'
  and style_number in ('00108', '00908')
  and created_date::date = date '2026-09-18'
  and visibility = 'draft' and is_active is false;

create or replace function public.guard_qa_ready_publication()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.draft_qa_status = 'ready_for_admin_approval'
     and (new.visibility = 'public' or new.is_active is true)
     and new.draft_qa_status is distinct from 'approved' then
    raise exception 'This draft is ready for admin approval, not publication.';
  end if;
  return new;
end;
$$;

drop trigger if exists products_guard_qa_ready_publication on public.products;
create trigger products_guard_qa_ready_publication
before update of visibility, is_active, draft_qa_status on public.products
for each row execute function public.guard_qa_ready_publication();

commit;
