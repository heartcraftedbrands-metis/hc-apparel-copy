begin;

do $verification$
declare
  v_result jsonb;
  v_public_products bigint;
  v_batch_count bigint;
  v_loading_paused boolean;
  v_max_batch_sequence integer;
  v_live_enabled bigint;
  v_submitted bigint;
  v_placed_orders bigint;
  v_validation_function regprocedure;
begin
  begin
    perform public.submit_quote_request(
      '{"full_name":"Safety Test","email":"bulk49-safety@example.com","quantity":49}'::jsonb
    );
    raise exception 'Quantity 49 unexpectedly passed bulk quote validation';
  exception
    when sqlstate '22023' then
      if sqlerrm not like 'Bulk quotes are for orders of 50 or more.%' then
        raise;
      end if;
  end;

  v_result := public.submit_quote_request(
    '{"full_name":"Safety Test","email":"bulk50-safety@example.com","quantity":50}'::jsonb
  );
  if coalesce((v_result->>'success')::boolean, false) is not true then
    raise exception 'Quantity 50 did not pass bulk quote validation';
  end if;

  v_result := public.submit_order_help_request(
    '{
      "customer_name":"Safety Test",
      "customer_email":"small1-safety@example.com",
      "product_name":"Safety product",
      "quantity":1,
      "color":"Black",
      "size":"M",
      "shipping_address":{
        "street":"1 Test Street",
        "city":"Test City",
        "state":"OH",
        "postal_code":"43004"
      }
    }'::jsonb
  );
  if v_result->>'payment_status' <> 'unpaid'
    or coalesce((v_result->>'vendor_order_created')::boolean, true)
    or coalesce((v_result->>'live_ss_submission')::boolean, true)
  then
    raise exception 'Quantity 1 did not remain an unpaid, non-vendor order';
  end if;

  v_result := public.submit_order_help_request(
    '{
      "customer_name":"Safety Test",
      "customer_email":"small49-safety@example.com",
      "product_name":"Safety product",
      "quantity":49,
      "color":"Black",
      "size":"M",
      "shipping_address":{
        "street":"1 Test Street",
        "city":"Test City",
        "state":"OH",
        "postal_code":"43004"
      }
    }'::jsonb
  );
  if coalesce((v_result->>'success')::boolean, false) is not true then
    raise exception 'Quantity 49 did not pass Request Order Help validation';
  end if;

  begin
    perform public.submit_order_help_request(
      '{
        "customer_name":"Safety Test",
        "customer_email":"small50-safety@example.com",
        "product_name":"Safety product",
        "quantity":50,
        "color":"Black",
        "size":"M",
        "shipping_address":{
          "street":"1 Test Street",
          "city":"Test City",
          "state":"OH",
          "postal_code":"43004"
        }
      }'::jsonb
    );
    raise exception 'Quantity 50 unexpectedly passed Request Order Help validation';
  exception
    when sqlstate '22023' then
      if sqlerrm not like 'Request Order Help is for orders of 1–49 items.%' then
        raise;
      end if;
  end;

  select count(*) into v_public_products from public.storefront_products;
  select count(*) into v_batch_count from public.ss_launch_batches;
  select product_loading_paused, max_batch_sequence
  into v_loading_paused, v_max_batch_sequence
  from public.ss_catalog_workflow_status
  where id = true;
  select count(*) into v_live_enabled
  from public.vendor_order_drafts where live_submission_enabled;
  select count(*) into v_submitted
  from public.vendor_order_drafts
  where workflow_status in (
    'submitted_to_ss', 'vendor_order_confirmed', 'tracking_received', 'completed'
  );
  select count(*) into v_placed_orders
  from public.vendor_orders
  where lower(vendor_name) like '%s&s%'
    and status not in ('draft', 'canceled');

  if v_public_products <> 64 then
    raise exception 'Public products changed: expected 64, found %', v_public_products;
  end if;
  if v_batch_count <> 3 then
    raise exception 'Unexpected S&S batch count: expected 3, found %', v_batch_count;
  end if;
  if v_loading_paused is distinct from true or v_max_batch_sequence <> 3 then
    raise exception 'Product loading pause or Batch 3 limit changed';
  end if;
  if v_live_enabled <> 0 or v_submitted <> 0 or v_placed_orders <> 0 then
    raise exception 'Live or submitted S&S orders were detected';
  end if;

  select to_regprocedure('public.get_ss_vendor_order_draft_validation(text)')
  into v_validation_function;
  if v_validation_function is null
    or position(
      'customer_order.payment_status = ''paid'''
      in pg_get_functiondef(v_validation_function)
    ) = 0
  then
    raise exception 'Paid customer-order vendor-draft validation is missing';
  end if;
end;
$verification$;

rollback;

select 'PASS' as quote_order_production_safety;
