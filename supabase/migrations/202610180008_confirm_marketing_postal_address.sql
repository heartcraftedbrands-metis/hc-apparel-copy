begin;

update public.marketing_settings
set marketing_postal_address = E'HC Apparel\n2281 Dunwoody Crossing\nAtlanta, GA 30338',
    updated_at = now()
where id = true;

update public.marketing_email_campaigns
set html_body = replace(
      coalesce(html_body, ''),
      '{{ business_postal_address }}',
      'HC Apparel<br>2281 Dunwoody Crossing<br>Atlanta, GA 30338'
    ),
    text_body = replace(
      coalesce(text_body, ''),
      '{{ business_postal_address }}',
      E'HC Apparel\n2281 Dunwoody Crossing\nAtlanta, GA 30338'
    ),
    updated_at = now()
where status = 'Draft'
  and idempotency_key like 'email:%'
  and (
    coalesce(html_body, '') like '%{{ business_postal_address }}%'
    or coalesce(text_body, '') like '%{{ business_postal_address }}%'
  );

commit;
