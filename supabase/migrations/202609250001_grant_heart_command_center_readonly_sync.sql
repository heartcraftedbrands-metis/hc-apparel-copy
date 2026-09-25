-- Heart Command Center is a one-way, server-side reporting integration.
-- Grant only the columns used by its explicit read allowlist. No write privileges.

grant select (
  id,
  email,
  full_name,
  created_at,
  updated_at
) on table public.profiles to service_role;

grant select (
  id,
  created_date,
  updated_date,
  is_sample,
  full_name,
  email,
  phone,
  business_name,
  quantity,
  status,
  workflow_status,
  customer_quote_price,
  vendor_estimate_total,
  estimated_profit,
  converted_order_id
) on table public.quote_requests to service_role;

grant select (
  id,
  created_date,
  updated_date,
  is_sample,
  customer_order_id,
  customer_order_number,
  customer_name,
  customer_email,
  order_date,
  vendor_status,
  workflow_status,
  ss_submission_state,
  ss_order_status,
  ss_order_number,
  tracking_number,
  total_quantity,
  item_count,
  garment_cost,
  vendor_shipping_estimate,
  vendor_other_fees,
  sale_price,
  estimated_profit,
  payment_status
) on table public.vendor_order_drafts to service_role;

grant select (
  id,
  created_date,
  updated_date,
  is_sample,
  name,
  email,
  subject,
  message,
  status
) on table public.contact_messages to service_role;
