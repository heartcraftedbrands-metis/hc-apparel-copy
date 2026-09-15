begin;

-- Backfill the canonical QA/test flag for any legacy record that carries one
-- of the older boolean flags or launch-safety markers. No records are deleted.
update public.orders as orders
set is_sample = true
where orders.is_sample is false
  and (
    lower(coalesce(to_jsonb(orders) ->> 'is_test', 'false')) in ('true', 't', '1', 'yes')
    or lower(coalesce(to_jsonb(orders) ->> 'qa_test', 'false')) in ('true', 't', '1', 'yes')
    or lower(coalesce(to_jsonb(orders) ->> 'archived', 'false')) in ('true', 't', '1', 'yes')
    or lower(coalesce(to_jsonb(orders) ->> 'excluded_from_live_metrics', 'false')) in ('true', 't', '1', 'yes')
    or lower(concat_ws(' ',
      orders.customer_name,
      orders.customer_email,
      orders.business_name,
      orders.notes,
      orders.internal_notes,
      orders.project_notes,
      orders.delivery_notes,
      orders.payment_notes
    )) ~ '(hc apparel launch qa|stripe sandbox qa|hc apparel qa test|king atwell|stripe-sandbox|testcustomer|qa marker|do not ship|do not submit|do not email|\\mqa\\M|\\mtest\\M)'
  );

-- Analytics reads this admin-only, RLS-invoker view rather than calculating
-- from the unfiltered orders table. Dynamic JSON flag checks keep it compatible
-- with legacy schemas where optional archive/test columns may or may not exist.
create or replace view public.admin_live_orders
with (security_invoker = true)
as
select orders.*
from public.orders as orders
where coalesce(orders.is_sample, false) is false
  and lower(coalesce(to_jsonb(orders) ->> 'is_test', 'false')) not in ('true', 't', '1', 'yes')
  and lower(coalesce(to_jsonb(orders) ->> 'qa_test', 'false')) not in ('true', 't', '1', 'yes')
  and lower(coalesce(to_jsonb(orders) ->> 'archived', 'false')) not in ('true', 't', '1', 'yes')
  and lower(coalesce(to_jsonb(orders) ->> 'excluded_from_live_metrics', 'false')) not in ('true', 't', '1', 'yes')
  and lower(concat_ws(' ',
    orders.customer_name,
    orders.customer_email,
    orders.business_name,
    orders.notes,
    orders.internal_notes,
    orders.project_notes,
    orders.delivery_notes,
    orders.payment_notes
  )) !~ '(hc apparel launch qa|stripe sandbox qa|hc apparel qa test|king atwell|stripe-sandbox|testcustomer|qa marker|do not ship|do not submit|do not email|\\mqa\\M|\\mtest\\M)';

comment on view public.admin_live_orders is
  'Admin analytics source containing only live customer orders; QA/test, sandbox, archived, and legacy records are excluded.';

revoke all on public.admin_live_orders from public;
revoke all on public.admin_live_orders from anon;
grant select on public.admin_live_orders to authenticated;

commit;
