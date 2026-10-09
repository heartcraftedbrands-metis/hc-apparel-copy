begin;

-- Digital mockup originals are deliberately isolated from the public storefront
-- bucket. Customers only receive short-lived signed URLs after entitlement checks.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'digital-mockup-originals',
  'digital-mockup-originals',
  false,
  62914560,
  array['image/png']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists digital_mockup_originals_admin_all on storage.objects;
create policy digital_mockup_originals_admin_all
on storage.objects for all to authenticated
using (bucket_id = 'digital-mockup-originals' and public.is_admin())
with check (bucket_id = 'digital-mockup-originals' and public.is_admin());

create table if not exists public.digital_mockup_assets (
  id uuid primary key default gen_random_uuid(),
  product_id text not null unique references public.products(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  sku text not null unique,
  garment_type text not null default 't_shirt',
  color_name text not null default 'Unspecified',
  tags text[] not null default '{}',
  publication_status text not null default 'draft'
    check (publication_status in ('draft', 'published', 'unpublished', 'archived')),
  current_version_id uuid,
  is_featured boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create table if not exists public.digital_mockup_versions (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.digital_mockup_assets(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  original_storage_path text not null unique,
  preview_storage_path text not null,
  preview_url text not null,
  original_file_name text not null,
  original_sha256 text not null unique check (original_sha256 ~ '^[a-f0-9]{64}$'),
  mime_type text not null check (mime_type = 'image/png'),
  file_extension text not null default 'png' check (file_extension = 'png'),
  pixel_width integer not null check (pixel_width > 0),
  pixel_height integer not null check (pixel_height > 0),
  file_size_bytes bigint not null check (file_size_bytes > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (asset_id, version_number)
);

alter table public.digital_mockup_assets
  drop constraint if exists digital_mockup_assets_current_version_id_fkey;
alter table public.digital_mockup_assets
  add constraint digital_mockup_assets_current_version_id_fkey
  foreign key (current_version_id) references public.digital_mockup_versions(id) on delete restrict;

create index if not exists digital_mockup_assets_public_idx
  on public.digital_mockup_assets(publication_status, published_at desc, created_at desc);
create index if not exists digital_mockup_assets_filter_idx
  on public.digital_mockup_assets(garment_type, color_name);
create index if not exists digital_mockup_versions_asset_idx
  on public.digital_mockup_versions(asset_id, version_number desc);

create table if not exists public.digital_mockup_settings (
  id boolean primary key default true check (id),
  heading text not null default 'HeartCrafted Mockups',
  description text not null default 'Bring your designs to life with downloadable apparel mockups. Get a full-resolution, watermark-free PNG for just $1.20 per image.',
  button_label text not null default 'Shop Mockups',
  supporting_text text not null default 'Instant downloads after payment • $1.20 each',
  right_headline text not null default E'Crafted with Heart.\nReady for Your Art.',
  quality_label text not null default 'Quality 2000px Images',
  launch_detail text not null default 'Launch collection: measured full-resolution PNG downloads',
  featured_asset_id uuid references public.digital_mockup_assets(id) on delete set null,
  default_price numeric(10,2) not null default 1.20 check (default_price > 0),
  raster_format text not null default 'PNG',
  license_terms text not null default 'Single-image digital mockup license (proposed): You may use the purchased image to present your own artwork in personal or commercial client previews and marketing. You may not resell, redistribute, share, sublicense, or make the original blank mockup file available as-is. No garment brand or trademark license is included. Contact support@ilovehcapparel.net for extended team licensing.',
  license_status text not null default 'proposed' check (license_status in ('proposed', 'approved')),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.digital_mockup_settings(id) values (true)
on conflict (id) do nothing;

create table if not exists public.digital_mockup_order_access (
  order_id text primary key references public.orders(id) on delete cascade,
  customer_email text not null,
  checkout_attempt_key text not null unique,
  stripe_mode text not null check (stripe_mode in ('test', 'live')),
  confirmation_email_status text not null default 'pending'
    check (confirmation_email_status in ('pending', 'sending', 'accepted', 'failed', 'not_configured')),
  confirmation_email_provider_id text,
  confirmation_email_error text,
  confirmation_email_attempts integer not null default 0,
  confirmation_email_accepted_at timestamptz,
  delivery_status text not null default 'locked'
    check (delivery_status in ('locked', 'available', 'revoked', 'refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.digital_download_entitlements (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders(id) on delete cascade,
  product_id text not null references public.products(id) on delete restrict,
  version_id uuid not null references public.digital_mockup_versions(id) on delete restrict,
  owner_user_id uuid references auth.users(id) on delete set null,
  customer_email text not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoke_reason text,
  unique (order_id, product_id, version_id)
);

create table if not exists public.digital_download_audit (
  id uuid primary key default gen_random_uuid(),
  entitlement_id uuid not null references public.digital_download_entitlements(id) on delete cascade,
  order_id text not null references public.orders(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  access_kind text not null check (access_kind in ('account', 'guest')),
  signed_url_expires_at timestamptz not null,
  requested_at timestamptz not null default now()
);

create index if not exists digital_download_entitlements_owner_idx
  on public.digital_download_entitlements(owner_user_id, granted_at desc);
create index if not exists digital_download_entitlements_email_idx
  on public.digital_download_entitlements(lower(customer_email), granted_at desc);

alter table public.digital_mockup_assets enable row level security;
alter table public.digital_mockup_versions enable row level security;
alter table public.digital_mockup_settings enable row level security;
alter table public.digital_mockup_order_access enable row level security;
alter table public.digital_download_entitlements enable row level security;
alter table public.digital_download_audit enable row level security;

drop policy if exists digital_mockup_assets_admin_all on public.digital_mockup_assets;
create policy digital_mockup_assets_admin_all on public.digital_mockup_assets
for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists digital_mockup_versions_admin_all on public.digital_mockup_versions;
create policy digital_mockup_versions_admin_all on public.digital_mockup_versions
for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists digital_mockup_settings_admin_all on public.digital_mockup_settings;
create policy digital_mockup_settings_admin_all on public.digital_mockup_settings
for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.digital_mockup_assets, public.digital_mockup_versions,
  public.digital_mockup_settings, public.digital_mockup_order_access,
  public.digital_download_entitlements, public.digital_download_audit
from public, anon, authenticated;
grant all on public.digital_mockup_assets, public.digital_mockup_versions,
  public.digital_mockup_settings to authenticated;

-- This view is the only anonymous catalog surface. It intentionally contains
-- watermarked preview data and never exposes the private original path/hash.
create or replace view public.storefront_digital_mockups
with (security_barrier = true) as
select
  asset.id,
  asset.product_id,
  asset.slug,
  asset.sku,
  product.name as title,
  product.description,
  coalesce(product.sale_price, product.price) as price,
  asset.garment_type,
  asset.color_name,
  asset.tags,
  version.preview_url,
  version.pixel_width,
  version.pixel_height,
  version.mime_type,
  version.file_extension,
  version.file_size_bytes,
  asset.is_featured,
  asset.published_at,
  asset.created_at,
  asset.updated_at
from public.digital_mockup_assets asset
join public.digital_mockup_versions version on version.id = asset.current_version_id
join public.products product on product.id = asset.product_id
where asset.publication_status = 'published'
  and product.product_type = 'digital'
  and product.visibility = 'public'
  and product.is_active is true;

revoke all on public.storefront_digital_mockups from public;
grant select on public.storefront_digital_mockups to anon, authenticated;

-- Digital and mixed orders use the same auditable order ledger without being
-- allowed to create a physical fulfillment job for a digital-only purchase.
alter table public.orders drop constraint if exists orders_checkout_source_check;
alter table public.orders add constraint orders_checkout_source_check check (
  checkout_source is null or checkout_source in (
    'customized_small_order', 'digital_mockup_order', 'mixed_storefront_order'
  )
);

create or replace function public.set_digital_mockup_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists digital_mockup_assets_set_updated_at on public.digital_mockup_assets;
create trigger digital_mockup_assets_set_updated_at
before update on public.digital_mockup_assets
for each row execute function public.set_digital_mockup_updated_at();
drop trigger if exists digital_mockup_settings_set_updated_at on public.digital_mockup_settings;
create trigger digital_mockup_settings_set_updated_at
before update on public.digital_mockup_settings
for each row execute function public.set_digital_mockup_updated_at();
drop trigger if exists digital_mockup_order_access_set_updated_at on public.digital_mockup_order_access;
create trigger digital_mockup_order_access_set_updated_at
before update on public.digital_mockup_order_access
for each row execute function public.set_digital_mockup_updated_at();

commit;
