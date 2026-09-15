begin;

-- Classify standalone legacy notification fixtures that are not linked to an
-- order row. Records remain intact and no delivery action is performed.
update public.customer_notifications notification
set is_sample = true
where notification.is_sample is false
  and (
    notification.created_date < timestamptz '2026-09-15 00:00:00+00'
    or lower(concat_ws(' ',
      notification.order_id, notification.order_number,
      notification.customer_name, notification.customer_email,
      notification.subject, notification.admin_note
    )) ~ '(stripe sandbox qa|hc apparel launch qa|hc apparel qa test|stripe-sandbox|testcustomer|test user|test@example\.com|qr-test|qa marker|do not ship|do not submit|do not email)'
  );

commit;

