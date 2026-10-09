begin;

alter table public.digital_mockup_versions
  add column if not exists hero_preview_storage_path text,
  add column if not exists hero_preview_url text,
  add column if not exists hero_preview_width integer check (hero_preview_width is null or hero_preview_width > 0),
  add column if not exists hero_preview_height integer check (hero_preview_height is null or hero_preview_height > 0);

alter table public.digital_mockup_settings
  add column if not exists hero_image_url text,
  add column if not exists hero_image_width integer check (hero_image_width is null or hero_image_width > 0),
  add column if not exists hero_image_height integer check (hero_image_height is null or hero_image_height > 0);

create or replace function public.digital_mockup_replace_preview(
  p_product_id text,
  p_image_url text
)
returns boolean language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if nullif(trim(p_image_url), '') is null
     or not exists (select 1 from public.digital_mockup_assets where product_id = p_product_id) then
    raise exception 'Invalid digital mockup preview update';
  end if;
  update public.products
  set image_url = p_image_url,
      mockup_images = jsonb_build_array(p_image_url)
  where id = p_product_id and product_type = 'digital' and category = 'digital_designs';
  return found;
end;
$$;

revoke all on function public.digital_mockup_replace_preview(text, text) from public, anon, authenticated;
grant execute on function public.digital_mockup_replace_preview(text, text) to service_role;

commit;
