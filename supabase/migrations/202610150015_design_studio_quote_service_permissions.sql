begin;

-- Design Studio quote actions execute only inside the authenticated Edge
-- Function with its server-held service credential. Preserve the existing
-- Heart Command Center read-only boundary by granting only the columns used by
-- the quote workflow rather than table-wide privileges.
grant insert (
  owner_user_id, created_by_email, source, design_id, design_version_id,
  design_checksum, request_key, design_snapshot, garment_selections,
  decoration_methods, placements, preview_url, full_name, email, phone,
  preferred_contact, product_type, quantity, sizes_needed, garment_colors,
  print_placement, print_method, artwork_status, artwork_file_url,
  project_notes, what_to_print, status, workflow_status, customer_quote_price
) on table public.quote_requests to service_role;

grant select (
  id, owner_user_id, source, request_key, design_id, design_version_id,
  design_checksum, design_snapshot, garment_selections, decoration_methods,
  placements, preview_url, full_name, email, phone, product_type, quantity,
  garment_colors, sizes_needed, print_method, created_date, updated_date,
  status, workflow_status, quote_sent_at, quote_accepted_at, quote_version,
  quote_terms, customer_quote_price, invoice_id, invoice_status,
  resulting_order_id, notification_status, notification_operation_key,
  notification_provider_message_id, notification_error
) on table public.quote_requests to service_role;

grant update (
  customer_quote_price, quote_terms, quote_version, quote_sent_at, status,
  workflow_status, quote_response_sent, notification_operation_key,
  notification_status, notification_provider_message_id, notification_error
) on table public.quote_requests to service_role;

commit;
