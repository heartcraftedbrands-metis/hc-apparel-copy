begin;

-- Preserve every pre-launch order for audit while removing test, sandbox, and
-- legacy records from live admin metrics and fulfillment queues. The cutoff is
-- fixed so this migration can never classify future customer orders.
update public.orders orders
set is_sample = true
where orders.is_sample is false
  and (
    orders.created_date < timestamptz '2026-09-15 00:00:00+00'
    or lower(concat_ws(' ',
      orders.customer_name, orders.customer_email, orders.business_name,
      orders.notes, orders.internal_notes, orders.project_notes,
      orders.delivery_notes, orders.payment_notes
    )) ~ '(stripe sandbox qa|hc apparel launch qa|hc apparel qa test|stripe-sandbox|testcustomer|qa marker|do not ship|do not submit|do not email|king atwell)'
  );

update public.vendor_order_drafts draft
set
  is_sample = true,
  live_submission_enabled = false,
  vendor_status = 'cancelled',
  workflow_status = 'vendor_order_draft_created',
  validation_passed = false,
  ss_api_connected = false,
  ss_submission_state = 'not_submitted',
  safety_mode_message = 'QA/Test — Do Not Fulfill',
  admin_notes = concat_ws(E'\n', nullif(draft.admin_notes, ''),
    '[Launch cleanup] QA/Test — Do Not Fulfill. Previous vendor/workflow status: '
    || draft.vendor_status || '/' || draft.workflow_status || '.')
where draft.is_sample is false
  and (
    draft.created_date < timestamptz '2026-09-15 00:00:00+00'
    or exists (
      select 1
      from public.orders customer_order
      where customer_order.id = draft.customer_order_id
        and customer_order.is_sample is true
    )
    or lower(concat_ws(' ',
      draft.customer_name, draft.customer_email, draft.notes,
      draft.admin_notes, draft.customer_notes
    )) ~ '(stripe sandbox qa|hc apparel launch qa|hc apparel qa test|stripe-sandbox|testcustomer|qa marker|do not ship|do not submit|do not email|king atwell)'
  );

update public.vendor_orders vendor_order
set is_sample = true
where vendor_order.is_sample is false
  and (
    vendor_order.created_date < timestamptz '2026-09-15 00:00:00+00'
    or exists (
      select 1
      from public.orders customer_order
      where customer_order.id = vendor_order.customer_order_id
        and customer_order.is_sample is true
    )
    or lower(concat_ws(' ',
      vendor_order.vendor_name, vendor_order.internal_notes,
      vendor_order.production_notes, vendor_order.shipping_notes
    )) ~ '(test print vendor|qa marker|do not ship|do not submit|do not email)'
  );

update public.customer_notifications notification
set is_sample = true
where notification.is_sample is false
  and exists (
    select 1
    from public.orders customer_order
    where customer_order.id = notification.order_id
      and customer_order.is_sample is true
  );

update public.order_status_history history
set is_sample = true
where history.is_sample is false
  and exists (
    select 1
    from public.orders customer_order
    where customer_order.id = history.order_id
      and customer_order.is_sample is true
  );

commit;
