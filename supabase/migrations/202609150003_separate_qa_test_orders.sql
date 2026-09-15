begin;

-- Preserve QA records for audit while keeping them out of live fulfillment views.
update public.orders
set is_sample = true
where is_sample is false
  and lower(concat_ws(' ',
    customer_name, customer_email, business_name, notes, internal_notes,
    project_notes, delivery_notes, payment_notes
  )) ~ '(hc apparel launch qa|stripe sandbox qa|hc apparel qa test|stripe-sandbox-qa-20260914@example\.com|\mtestcustomer\M|\mqa marker\M|\mdo not ship\M|\mdo not submit\M|\mdo not email\M)';

update public.vendor_order_drafts draft
set is_sample = true,
    live_submission_enabled = false
where draft.is_sample is false
  and (
    exists (
      select 1 from public.orders customer_order
      where customer_order.id = draft.customer_order_id
        and customer_order.is_sample is true
    )
    or lower(concat_ws(' ',
      draft.customer_name, draft.customer_email, draft.notes,
      draft.admin_notes, draft.customer_notes
    )) ~ '(hc apparel launch qa|stripe sandbox qa|hc apparel qa test|stripe-sandbox-qa-20260914@example\.com|\mtestcustomer\M|\mqa marker\M|\mdo not ship\M|\mdo not submit\M|\mdo not email\M)'
  );

create or replace function public.block_qa_test_vendor_submission()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_sample is true
    and (new.ss_submission_state = 'submitting' or new.live_submission_enabled is true) then
    raise exception 'QA/Test vendor drafts cannot be submitted to S&S';
  end if;
  return new;
end;
$$;

drop trigger if exists vendor_order_drafts_block_qa_submission on public.vendor_order_drafts;
create trigger vendor_order_drafts_block_qa_submission
before insert or update of is_sample, ss_submission_state, live_submission_enabled
on public.vendor_order_drafts
for each row execute function public.block_qa_test_vendor_submission();

revoke all on function public.block_qa_test_vendor_submission() from public, anon, authenticated;

commit;
