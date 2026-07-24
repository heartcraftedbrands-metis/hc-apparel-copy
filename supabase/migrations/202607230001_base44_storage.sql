begin;

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('storefront-assets', 'storefront-assets', true, 52428800),
  ('customer-files', 'customer-files', false, 52428800)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists storefront_assets_public_read on storage.objects;
create policy storefront_assets_public_read
on storage.objects for select to anon, authenticated
using (bucket_id = 'storefront-assets');

drop policy if exists managed_storage_admin_all on storage.objects;
create policy managed_storage_admin_all
on storage.objects for all to authenticated
using (
  bucket_id in ('storefront-assets', 'customer-files')
  and public.is_admin()
)
with check (
  bucket_id in ('storefront-assets', 'customer-files')
  and public.is_admin()
);

commit;
