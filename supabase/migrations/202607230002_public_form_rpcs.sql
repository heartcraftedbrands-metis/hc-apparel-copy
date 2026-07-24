begin;

create or replace function public.submit_contact_message(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_name text := left(regexp_replace(trim(coalesce(payload->>'name', '')), '[<>]', '', 'g'), 150);
  clean_email text := lower(left(trim(coalesce(payload->>'email', '')), 254));
  clean_subject text := left(regexp_replace(trim(coalesce(payload->>'subject', '')), '[<>]', '', 'g'), 250);
  clean_message text := left(regexp_replace(trim(coalesce(payload->>'message', '')), '[<>]', '', 'g'), 5000);
  new_id text;
begin
  if clean_name = '' or clean_subject = '' or clean_message = ''
     or clean_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'All contact fields are required.' using errcode = '22023';
  end if;
  if (select count(*) from public.contact_messages
      where lower(email) = clean_email and created_date > now() - interval '1 hour') >= 5 then
    raise exception 'Too many recent submissions. Please try again later.' using errcode = 'P0001';
  end if;
  insert into public.contact_messages (name, email, subject, message, status)
  values (clean_name, clean_email, clean_subject, clean_message, 'new')
  returning id into new_id;
  return jsonb_build_object('success', true, 'contact_message_id', new_id);
end;
$$;

create or replace function public.submit_quote_request(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_name text := left(regexp_replace(trim(coalesce(payload->>'full_name', '')), '[<>]', '', 'g'), 150);
  clean_email text := lower(left(trim(coalesce(payload->>'email', '')), 254));
  quantity_value numeric;
  placement jsonb := '[]'::jsonb;
  new_id text;
begin
  if clean_name = '' or clean_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'A valid name and email are required.' using errcode = '22023';
  end if;
  if (select count(*) from public.quote_requests
      where lower(email) = clean_email and created_date > now() - interval '1 hour') >= 3 then
    raise exception 'Too many recent submissions. Please try again later.' using errcode = 'P0001';
  end if;
  if coalesce(payload->>'quantity', '') ~ '^[0-9]+([.][0-9]+)?$'
     and (payload->>'quantity')::numeric > 0 then
    quantity_value := floor((payload->>'quantity')::numeric);
  end if;
  if jsonb_typeof(payload->'print_placement') = 'array' then
    select coalesce(jsonb_agg(value), '[]'::jsonb) into placement
    from (
      select value
      from jsonb_array_elements_text(payload->'print_placement') as item(value)
      where value in ('Front', 'Back', 'Left Chest', 'Sleeve', 'Other')
      limit 5
    ) allowed;
  end if;
  insert into public.quote_requests (
    full_name, email, phone, business_name, preferred_contact, product_type,
    garment_knowledge, preferred_garment_style, garment_colors, sizes_needed,
    quantity, print_placement, print_colors, print_method, artwork_status,
    artwork_file_url, artwork_link, project_notes, date_needed, status
  ) values (
    clean_name,
    clean_email,
    left(regexp_replace(trim(coalesce(payload->>'phone', '')), '[<>]', '', 'g'), 40),
    left(regexp_replace(trim(coalesce(payload->>'business_name', '')), '[<>]', '', 'g'), 150),
    case when payload->>'preferred_contact' in ('email', 'phone', 'text') then payload->>'preferred_contact' else 'email' end,
    case when payload->>'product_type' in ('t_shirts', 'hoodies', 'sweatshirts', 'tank_tops', 'sportswear', 'youth_apparel', 'bulk_order', 'other') then payload->>'product_type' else 'other' end,
    case when payload->>'garment_knowledge' in ('picked_from_shop', 'need_help_choosing', 'have_own_garment') then payload->>'garment_knowledge' else 'need_help_choosing' end,
    left(regexp_replace(trim(coalesce(payload->>'preferred_garment_style', '')), '[<>]', '', 'g'), 250),
    left(regexp_replace(trim(coalesce(payload->>'garment_colors', '')), '[<>]', '', 'g'), 250),
    left(regexp_replace(trim(coalesce(payload->>'sizes_needed', '')), '[<>]', '', 'g'), 250),
    quantity_value,
    placement,
    case when payload->>'print_colors' in ('1_color', '2_colors', 'full_color', 'not_sure') then payload->>'print_colors' else 'not_sure' end,
    case when payload->>'print_method' in ('dtf', 'screen_print', 'vinyl', 'embroidery', 'not_sure') then payload->>'print_method' else 'not_sure' end,
    case when payload->>'artwork_status' in ('print_ready', 'have_logo_need_help', 'only_idea', 'need_design_help') then payload->>'artwork_status' else 'only_idea' end,
    left(trim(coalesce(payload->>'artwork_file_url', '')), 2000),
    left(trim(coalesce(payload->>'artwork_link', '')), 2000),
    left(regexp_replace(trim(coalesce(payload->>'project_notes', '')), '[<>]', '', 'g'), 5000),
    case when coalesce(payload->>'date_needed', '') ~ '^\d{4}-\d{2}-\d{2}$' then (payload->>'date_needed')::date else null end,
    'new'
  ) returning id into new_id;
  return jsonb_build_object('success', true, 'quote_request_id', new_id);
end;
$$;

create or replace function public.subscribe_newsletter(subscriber_email text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_email text := lower(left(trim(coalesce(subscriber_email, '')), 254));
  existed boolean;
begin
  if clean_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'A valid email address is required.' using errcode = '22023';
  end if;
  select exists(select 1 from public.newsletter_subscribers where lower(email) = clean_email) into existed;
  insert into public.newsletter_subscribers (email, is_active)
  values (clean_email, true)
  on conflict ((lower(email))) do update set is_active = true, updated_date = now();
  return jsonb_build_object('success', true, 'already_subscribed', existed);
end;
$$;

create or replace function public.track_order(order_fragment text, customer_email text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  fragment text := lower(regexp_replace(trim(coalesce(order_fragment, '')), '^#', ''));
  clean_email text := lower(trim(coalesce(customer_email, '')));
  result jsonb;
begin
  if length(fragment) < 6 or clean_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    return null;
  end if;
  select jsonb_build_object(
    'id', o.id,
    'customer_name', o.customer_name,
    'order_items', o.order_items,
    'total_amount', o.total_amount,
    'amount_paid', o.amount_paid,
    'status', o.status,
    'payment_status', o.payment_status,
    'fulfillment_status', o.fulfillment_status,
    'shipping_address', o.shipping_address,
    'tracking_number', o.tracking_number,
    'tracking_carrier', o.tracking_carrier,
    'tracking_url', o.tracking_url,
    'created_date', o.created_date
  ) into result
  from public.orders o
  where lower(o.customer_email) = clean_email
    and right(lower(o.id), length(fragment)) = fragment
  order by o.created_date desc
  limit 1;
  return result;
end;
$$;

revoke all on function public.submit_contact_message(jsonb) from public;
revoke all on function public.submit_quote_request(jsonb) from public;
revoke all on function public.subscribe_newsletter(text) from public;
revoke all on function public.track_order(text, text) from public;
grant execute on function public.submit_contact_message(jsonb) to anon, authenticated;
grant execute on function public.submit_quote_request(jsonb) to anon, authenticated;
grant execute on function public.subscribe_newsletter(text) to anon, authenticated;
grant execute on function public.track_order(text, text) to anon, authenticated;

commit;
