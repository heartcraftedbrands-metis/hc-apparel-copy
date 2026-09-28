begin;

alter table public.marketing_social_content
  add column if not exists product_active_verified boolean not null default false,
  add column if not exists price_verified boolean not null default false,
  add column if not exists link_verified boolean not null default false,
  add column if not exists utm_link_verified boolean not null default false,
  add column if not exists media_selected boolean not null default false,
  add column if not exists caption_reviewed boolean not null default false,
  add column if not exists cta_reviewed boolean not null default false,
  add column if not exists sale_status_verified boolean not null default false,
  add column if not exists platform_views integer,
  add column if not exists platform_likes integer,
  add column if not exists platform_comments integer,
  add column if not exists platform_shares integer,
  add column if not exists platform_saves integer,
  add column if not exists generation_week_start date,
  add column if not exists generated_from_review boolean not null default false;

alter table public.marketing_social_content
  drop constraint if exists marketing_social_content_platform_metrics_check;
alter table public.marketing_social_content
  add constraint marketing_social_content_platform_metrics_check check (
    coalesce(platform_views,0) >= 0 and coalesce(platform_likes,0) >= 0
    and coalesce(platform_comments,0) >= 0 and coalesce(platform_shares,0) >= 0
    and coalesce(platform_saves,0) >= 0
  );

create or replace function public.enforce_marketing_content_readiness()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.status in ('Ready to Publish','Published') then
    if not (new.product_active_verified and new.price_verified and new.link_verified
      and new.utm_link_verified and new.media_selected and new.caption_reviewed and new.cta_reviewed) then
      raise exception 'Complete every content approval checklist item before marking this content Ready to Publish.';
    end if;
    if (lower(coalesce(new.content_type,'')) like '%sale%'
      or lower(coalesce(new.headline,'')) like '%sale pick%') and not new.sale_status_verified then
      raise exception 'Verify the current S&S sale status before marking this Sale Pick Ready to Publish.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists marketing_content_readiness_guard on public.marketing_social_content;
create trigger marketing_content_readiness_guard
before insert or update of status,product_active_verified,price_verified,link_verified,
  utm_link_verified,media_selected,caption_reviewed,cta_reviewed,sale_status_verified
on public.marketing_social_content for each row execute function public.enforce_marketing_content_readiness();

-- Existing complete packs remain Draft and start with only machine-verifiable checks.
update public.marketing_social_content content set
  product_active_verified = case when content.product_id is null then true else exists (
    select 1 from public.products product where product.id=content.product_id
      and product.visibility='public' and product.is_active is true and product.stock > 0
  ) end,
  price_verified = case when content.product_id is null then true else exists (
    select 1 from public.products product where product.id=content.product_id
      and coalesce(product.sale_price,product.price) > 0
  ) end,
  link_verified = nullif(btrim(content.product_url),'') is not null,
  utm_link_verified = content.tracking_url like '%utm_campaign=hc_apparel_organic_launch%',
  media_selected = nullif(btrim(content.recommended_image_url),'') is not null,
  sale_status_verified = case when lower(coalesce(content.content_type,'')) like '%sale%'
    or lower(coalesce(content.headline,'')) like '%sale pick%' then exists (
      select 1 from public.storefront_homepage_specials special where special.product_id=content.product_id
    ) else true end,
  status='Draft'
where content.campaign_id=(select id from public.marketing_campaigns where campaign_key='hc_apparel_organic_launch');

-- Context is intentionally restricted to product IDs and cart quantity.
create or replace function public.log_marketing_event_v3(
  p_event_name text,
  p_product_id text default null,
  p_product_name text default null,
  p_source text default null,
  p_path text default null,
  p_attribution jsonb default '{}'::jsonb,
  p_dedupe_key text default null,
  p_context jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path=public as $$
declare v_metadata jsonb;
begin
  if p_event_name not in ('page_view','product_view','brand_view','category_view','account_signup','login','add_to_cart','remove_from_cart','checkout_started','shipping_quote_success','payment_method_selected','quote_request_submitted','contact_submitted','email_subscribed','sale_promo_clicked','search_used','track_order_used') then
    return;
  end if;
  v_metadata := jsonb_strip_nulls(jsonb_build_object(
    'utm_source', nullif(left(p_attribution ->> 'utm_source',80),''),
    'utm_medium', nullif(left(p_attribution ->> 'utm_medium',80),''),
    'utm_campaign', nullif(left(p_attribution ->> 'utm_campaign',120),''),
    'utm_content', nullif(left(p_attribution ->> 'utm_content',120),''),
    'product_ids', case when jsonb_typeof(p_context -> 'product_ids')='array' then (
      select coalesce(jsonb_agg(left(value,100)),'[]'::jsonb)
      from (select value from jsonb_array_elements_text(p_context -> 'product_ids') value limit 25) ids
    ) else null end,
    'cart_quantity', case when (p_context ->> 'cart_quantity') ~ '^\d{1,4}$' then (p_context ->> 'cart_quantity')::integer else null end
  ));
  insert into public.marketing_events(event_name,product_id,product_name,source,path,metadata,dedupe_key)
  values (p_event_name,left(p_product_id,100),left(p_product_name,180),left(p_source,80),left(p_path,500),v_metadata,nullif(left(p_dedupe_key,200),''))
  on conflict (dedupe_key) do update set metadata=excluded.metadata,path=excluded.path;
end;
$$;
revoke all on function public.log_marketing_event_v3(text,text,text,text,text,jsonb,text,jsonb) from public;
grant execute on function public.log_marketing_event_v3(text,text,text,text,text,jsonb,text,jsonb) to anon,authenticated;

create or replace function public.attribute_marketing_purchase(p_order_id text,p_attribution jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare v_attribution jsonb; v_revenue numeric; v_product_ids jsonb;
begin
  select coalesce(product_subtotal,total_amount-shipping_amount-sales_tax_amount,0),
    coalesce((select jsonb_agg(distinct coalesce(item ->> 'product_id',item ->> 'id'))
      from jsonb_array_elements(coalesce(order_record.order_items,'[]'::jsonb)) item
      where coalesce(item ->> 'product_id',item ->> 'id') is not null),'[]'::jsonb)
  into v_revenue,v_product_ids
  from public.orders order_record
  where order_record.id=p_order_id and order_record.owner_user_id=auth.uid()
    and order_record.payment_status='paid' and order_record.is_sample=false;
  if not found then return; end if;
  v_attribution := jsonb_strip_nulls(jsonb_build_object(
    'utm_source',nullif(left(p_attribution ->> 'utm_source',80),''),
    'utm_medium',nullif(left(p_attribution ->> 'utm_medium',80),''),
    'utm_campaign',nullif(left(p_attribution ->> 'utm_campaign',120),''),
    'utm_content',nullif(left(p_attribution ->> 'utm_content',120),''),
    'order_id',p_order_id,'revenue',greatest(v_revenue,0),'product_ids',v_product_ids
  ));
  insert into public.marketing_events(event_name,source,metadata,dedupe_key)
  values ('purchase_completed','orders',v_attribution,'purchase_completed:' || p_order_id)
  on conflict (dedupe_key) do update set metadata=excluded.metadata;
end;
$$;
revoke all on function public.attribute_marketing_purchase(text,jsonb) from public;
grant execute on function public.attribute_marketing_purchase(text,jsonb) to authenticated;

commit;
