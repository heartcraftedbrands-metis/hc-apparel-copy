begin;

alter table public.marketing_social_content
  add column if not exists original_artwork_url text;

alter table public.marketing_social_content
  drop constraint if exists marketing_social_content_schedule_status_check;
alter table public.marketing_social_content
  add constraint marketing_social_content_schedule_status_check
  check (schedule_status in ('Planned','Ready','Scheduled on Pinterest','Scheduled via Buffer','Published','Failed'));

create or replace function public.enforce_confirmed_pinterest_schedule()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.schedule_status in ('Scheduled on Pinterest','Scheduled via Buffer')
    and nullif(btrim(new.schedule_confirmation_id),'') is null then
    raise exception 'Pinterest scheduling must be confirmed by the connected publishing service before using a scheduled status.';
  end if;
  return new;
end;
$$;

-- The supplied graphics remain available at original_artwork_url. Their pictured
-- supplier styles are not in the live storefront catalog, so the scheduled Pin
-- uses an exact live product image, copy, and destination instead.
update public.marketing_social_content
set
  headline='adidas AT600 Puffer Jacket for Cold-Weather Layers',
  caption='Build a practical cooler-weather layer with the live adidas Men''s Helonic Down Puffer Hooded Jacket AT600. Review current colors, sizes, and availability on the product page. Shop this puffer jacket.',
  short_caption='A live adidas puffer jacket for cooler-weather layering. Shop the AT600.',
  product_id='3d60d812-9fb0-41f6-858c-14ef2e858635',
  product_name='adidas Men''s Helonic Down Puffer Hooded Jacket AT600',
  product_url='https://www.ilovehcapparel.net/ProductDetail?id=3d60d812-9fb0-41f6-858c-14ef2e858635',
  product_link='https://www.ilovehcapparel.net/ProductDetail?id=3d60d812-9fb0-41f6-858c-14ef2e858635',
  tracking_url='https://www.ilovehcapparel.net/ProductDetail?id=3d60d812-9fb0-41f6-858c-14ef2e858635&utm_source=pinterest&utm_medium=organic_social&utm_campaign=hc_apparel_organic_launch&utm_content=oct09_puffers_insulated',
  recommended_image_url='https://www.ssactivewear.com/Images/Color/139563_f_fm.jpg',
  image_alt_text='Authorized supplier catalog photograph of the adidas AT600 Helonic down puffer hooded jacket shown from the front.',
  hashtags='#adidasAT600 #PufferJacket #FallLayering',
  recommended_format='Pinterest product Pin',
  recommended_dimensions='Original authorized catalog image · show the full garment',
  original_artwork_url='https://www.ilovehcapparel.net/marketing/hc-apparel-organic-launch/puffers-insulated.jpg',
  image_video_concept='Use the authorized live adidas AT600 catalog photograph. The original Puffers & Insulated artwork is retained separately and is not the scheduled Pin image.',
  sale_validation_status='Replacement verified 2026-10-08: pictured adidas A572 was not present in the live public catalog. adidas AT600 is public, active, and has stocked variants. Image, copy, and destination now reference the same exact live product.',
  product_active_verified=true,
  link_verified=true,
  utm_link_verified=true,
  media_selected=true,
  destination_verified_at=now(),
  updated_at=now()
where calendar_series_key='pinterest_october_sales_2026'
  and utm_content='oct09_puffers_insulated'
  and schedule_confirmation_id is null;

update public.marketing_social_content
set
  headline='adidas A268 Wind-Resistant Jacket for Changing Weather',
  caption='Be ready for changing weather with the live adidas Women''s Wind Resistant Full-Zip Jacket A268. Its product specifications include a durable water-repellent finish. Review current colors, sizes, and availability on the product page. Shop this jacket.',
  short_caption='A live wind-resistant adidas jacket with a durable water-repellent finish. Shop the A268.',
  product_id='51a107db-19d6-491e-9e24-c732885e1a75',
  product_name='adidas Women''s Wind Resistant Full-Zip Jacket A268',
  product_url='https://www.ilovehcapparel.net/ProductDetail?id=51a107db-19d6-491e-9e24-c732885e1a75',
  product_link='https://www.ilovehcapparel.net/ProductDetail?id=51a107db-19d6-491e-9e24-c732885e1a75',
  tracking_url='https://www.ilovehcapparel.net/ProductDetail?id=51a107db-19d6-491e-9e24-c732885e1a75&utm_source=pinterest&utm_medium=organic_social&utm_campaign=hc_apparel_organic_launch&utm_content=oct16_rain_jackets',
  recommended_image_url='https://www.ssactivewear.com/Images/ModelColor/96135_omf_fm.jpg',
  image_alt_text='Authorized supplier catalog photograph of a model wearing the adidas A268 women''s wind-resistant full-zip jacket.',
  hashtags='#adidasA268 #WindResistantJacket #WeatherReadyLayers',
  recommended_format='Pinterest product Pin',
  recommended_dimensions='Original authorized catalog image · preserve the complete photograph',
  original_artwork_url='https://www.ilovehcapparel.net/marketing/hc-apparel-organic-launch/rain-jackets.jpg',
  image_video_concept='Use the authorized live adidas A268 catalog photograph. The original Rain Jackets artwork is retained separately and is not the scheduled Pin image.',
  sale_validation_status='Replacement verified 2026-10-08: pictured Columbia 212481 was not present in the live public catalog. adidas A268 is public, active, has stocked variants, and its authenticated product description states a durable water-repellent finish. Image, copy, and destination now reference the same exact live product.',
  product_active_verified=true,
  link_verified=true,
  utm_link_verified=true,
  media_selected=true,
  destination_verified_at=now(),
  updated_at=now()
where calendar_series_key='pinterest_october_sales_2026'
  and utm_content='oct16_rain_jackets'
  and schedule_confirmation_id is null;

update public.marketing_social_content
set
  headline='DRI DUCK 5020 Workwear Jacket for Cooler Days',
  caption='Choose a work-ready cooler-weather layer with the live DRI DUCK 5020 Men''s Cheyenne Boulder Cloth Hooded Jacket. Review current colors, sizes, and availability on the product page. Shop this workwear jacket.',
  short_caption='A live DRI DUCK workwear jacket for cooler days. Shop the 5020.',
  product_id='bef05148-962a-4e6b-b00d-906569121f60',
  product_name='DRI DUCK 5020 Men''s Cheyenne Boulder Cloth Hooded Jacket',
  product_url='https://www.ilovehcapparel.net/ProductDetail?id=bef05148-962a-4e6b-b00d-906569121f60',
  product_link='https://www.ilovehcapparel.net/ProductDetail?id=bef05148-962a-4e6b-b00d-906569121f60',
  tracking_url='https://www.ilovehcapparel.net/ProductDetail?id=bef05148-962a-4e6b-b00d-906569121f60&utm_source=pinterest&utm_medium=organic_social&utm_campaign=hc_apparel_organic_launch&utm_content=oct20_workwear_outerwear',
  recommended_image_url='https://www.ssactivewear.com/Images/ModelColor/41681_omf_fm.jpg',
  image_alt_text='Authorized supplier catalog photograph of a model wearing the DRI DUCK 5020 Cheyenne Boulder Cloth hooded work jacket.',
  hashtags='#DRIDUCK5020 #WorkwearJacket #CoolWeatherWorkwear',
  recommended_format='Pinterest product Pin',
  recommended_dimensions='Original authorized catalog image · preserve the complete photograph',
  original_artwork_url='https://www.ilovehcapparel.net/marketing/hc-apparel-organic-launch/outerwear-overview.jpg',
  image_video_concept='Use the authorized live DRI DUCK 5020 catalog photograph. The original outerwear overview artwork is retained separately and is not the scheduled Pin image.',
  sale_validation_status='Replacement verified 2026-10-08: pictured DRI DUCK 5028 was not present in the live public catalog. DRI DUCK 5020 is public, active, and has stocked variants. Image, copy, and destination now reference the same exact live product.',
  product_active_verified=true,
  link_verified=true,
  utm_link_verified=true,
  media_selected=true,
  destination_verified_at=now(),
  updated_at=now()
where calendar_series_key='pinterest_october_sales_2026'
  and utm_content='oct20_workwear_outerwear'
  and schedule_confirmation_id is null;

update public.marketing_social_accounts
set publishing_connection_status='Connected to Buffer; October Pins require confirmed Buffer post IDs before they are marked scheduled.',
    notes='Pinterest channel heartfamilyco and the Apparel Blanks board are the authorized destinations. Buffer daily posting limits and duplicate schedule checks are verified immediately before each submission.',
    updated_at=now()
where platform='Pinterest';

commit;
