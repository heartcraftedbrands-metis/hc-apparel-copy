begin;

-- The calendar Edge Function uses service_role to build private schedule
-- suggestions. Grant only the operational columns it actually reads.
-- Do not change browser-role grants or RLS policies.
grant select (id, vendor_status, customer_order_id, created_date, is_sample)
  on public.vendor_order_drafts to service_role;

grant select (id, status, product_type, quantity, date_needed, artwork_status, created_date, is_sample)
  on public.quote_requests to service_role;

grant select (id, status, created_date, is_sample)
  on public.contact_messages to service_role;

commit;
