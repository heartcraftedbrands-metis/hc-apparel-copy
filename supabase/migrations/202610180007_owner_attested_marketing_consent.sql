begin;

alter table public.newsletter_subscribers
  add column if not exists consent_source text,
  add column if not exists consent_evidence text;

alter table public.marketing_settings
  add column if not exists marketing_website text,
  add column if not exists marketing_support_email text,
  add column if not exists marketing_postal_address text;

update public.marketing_settings
set marketing_website='https://www.ilovehcapparel.net',
    marketing_support_email='support@ilovehcapparel.net',
    updated_at=now()
where id=true;

with supplied(email) as (values
  ('fatwellemail@gmail.com'),('peakamber@gmail.com'),('pastorscott504@me.com'),
  ('vincentwashington1@gmail.com'),('jayates@xiiiunited.com'),
  ('danielle.alexis24689@gmail.com'),('jackiejenkinsjr@gmail.com'),
  ('chandre.sorrells@yahoo.com'),('meagancotter@hotmail.com'),
  ('aliciaboyd2012@gmail.com'),('starlister808@yahoo.com'),
  ('lbierria@gmail.com'),('enjidaggs@gmail.com'),('eandadesignz@gmail.com')
)
update public.newsletter_subscribers n set
  consent_status='consented',
  consent_at=now(),
  consent_source='owner_attested_codex_conversation',
  consent_evidence='Owner confirmed all 14 supplied contacts agreed to receive HC Apparel marketing emails in Codex conversation 01a140b9-0df4-71f1-b38e-14d13cdd5d81.',
  is_active=true,
  brevo_sync_status='not_synced',
  brevo_last_error=null,
  updated_date=now()
from supplied s
where lower(n.email)=lower(s.email)
  and n.consent_status not in ('unsubscribed','suppressed')
  and n.brevo_sync_status <> 'suppressed';

update public.ops_marketing_contacts o set
  consent_status=n.consent_status,
  provider_sync_status=n.brevo_sync_status,
  updated_at=now()
from public.newsletter_subscribers n
where n.id=o.subscriber_id;

update public.marketing_email_campaigns
set eligible_recipient_count=(
      select count(*) from public.newsletter_subscribers
      where is_sample=false and is_active=true and consent_status='consented'
        and brevo_sync_status not in ('suppressed','inactive_local')
    ),
    html_body=coalesce(html_body,'') ||
      E'\n<!-- Required footer; postal address remains intentionally blank until owner supplies a verified address. -->\n' ||
      E'<p><a href="https://www.ilovehcapparel.net">ilovehcapparel.net</a><br>' ||
      E'<a href="mailto:support@ilovehcapparel.net">support@ilovehcapparel.net</a><br>' ||
      E'{{ business_postal_address }}<br><a href="{{ unsubscribe }}">Unsubscribe</a></p>',
    text_body=coalesce(text_body,'') ||
      E'\n\nHC Apparel\nhttps://www.ilovehcapparel.net\nsupport@ilovehcapparel.net\n' ||
      E'{{ business_postal_address }}\nUnsubscribe: {{ unsubscribe }}',
    updated_at=now()
where status='Draft'
  and idempotency_key like 'email:%'
  and coalesce(html_body,'') not like '%support@ilovehcapparel.net%'
  and coalesce(text_body,'') not like '%support@ilovehcapparel.net%';

commit;
