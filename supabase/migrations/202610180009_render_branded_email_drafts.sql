begin;

update public.marketing_email_campaigns
set html_body =
  '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">' ||
  '<title>' || subject || '</title></head>' ||
  '<body style="margin:0;background:#f4efe4;color:#26351f;font-family:Arial,sans-serif;">' ||
  '<div style="display:none;max-height:0;overflow:hidden;opacity:0;">' || preview_text || '</div>' ||
  '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4efe4;">' ||
  '<tr><td align="center" style="padding:20px 12px;">' ||
  '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fffdf5;border-radius:18px;overflow:hidden;border:1px solid #ded5c4;">' ||
  '<tr><td style="background:#263518;padding:18px 24px;text-align:center;">' ||
  '<a href="https://www.ilovehcapparel.net" style="color:#fffdf5;text-decoration:none;font-size:28px;font-weight:800;">HC Apparel</a>' ||
  '</td></tr>' ||
  '<tr><td><img src="' || image_url || '" alt="' || image_alt_text || '" width="620" style="display:block;width:100%;height:auto;border:0;"></td></tr>' ||
  '<tr><td style="padding:28px 24px 12px;">' ||
  '<h1 style="margin:0 0 14px;font-size:28px;line-height:1.15;color:#26351f;">' || heading || '</h1>' ||
  '<p style="margin:0;font-size:17px;line-height:1.6;color:#4b5544;">' || body || '</p>' ||
  '</td></tr>' ||
  '<tr><td style="padding:14px 24px 30px;text-align:center;">' ||
  '<a href="' || destination_url || '" style="display:inline-block;background:#d89a00;color:#182312;text-decoration:none;font-size:16px;font-weight:800;padding:14px 22px;border-radius:12px;">' || cta_button_copy || '</a>' ||
  '<p style="margin:18px 0 0;font-size:13px;line-height:1.5;color:#6a735c;">Blank garments are purchased separately. DTF or DTG printing is quoted separately after artwork and placement review.</p>' ||
  '</td></tr>' ||
  '<tr><td style="background:#263518;padding:22px 24px;text-align:center;color:#f8e9c8;font-size:12px;line-height:1.6;">' ||
  '<a href="https://www.ilovehcapparel.net" style="color:#ffd973;">ilovehcapparel.net</a><br>' ||
  '<a href="mailto:support@ilovehcapparel.net" style="color:#ffd973;">support@ilovehcapparel.net</a><br>' ||
  'HC Apparel<br>2281 Dunwoody Crossing<br>Atlanta, GA 30338<br>' ||
  '<a href="{{ unsubscribe }}" style="color:#ffd973;">Unsubscribe</a>' ||
  '</td></tr></table></td></tr></table></body></html>',
  text_body = heading || E'\n\n' || body || E'\n\n' || cta_button_copy || ': ' || destination_url ||
    E'\n\nBlank garments are purchased separately. DTF or DTG printing is quoted separately after artwork and placement review.' ||
    E'\n\nHC Apparel\nhttps://www.ilovehcapparel.net\nsupport@ilovehcapparel.net\nHC Apparel\n2281 Dunwoody Crossing\nAtlanta, GA 30338\nUnsubscribe: {{ unsubscribe }}',
  updated_at = now()
where status = 'Draft'
  and idempotency_key in (
    'email:champion-s149:2026-10-27',
    'email:youth-hoodies:2026-11-10',
    'email:heavyweight-hoodies:2026-11-24',
    'email:garment-dyed:2026-12-08'
  );

commit;
