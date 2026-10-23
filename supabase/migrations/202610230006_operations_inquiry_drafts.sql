begin;

drop policy if exists contact_messages_operations_read on public.contact_messages;
create policy contact_messages_operations_read on public.contact_messages for select to authenticated
  using(public.ops_has_permission('hc-apparel','view') and is_sample=false);
grant select(id,name,email,subject,message,status,created_date,is_sample) on public.contact_messages to authenticated;

commit;
