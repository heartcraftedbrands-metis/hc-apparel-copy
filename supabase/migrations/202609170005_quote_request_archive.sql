-- Quote requests already have an Archive action in the admin UI. Permit the
-- archived status so the action persists and the inbox can separate records.
alter table public.quote_requests drop constraint if exists quote_requests_status_check;
alter table public.quote_requests add constraint quote_requests_status_check
  check (status in (
    'new', 'reviewing', 'waiting_on_customer', 'quote_sent', 'approved',
    'declined', 'completed', 'converted_to_order', 'archived'
  ));
