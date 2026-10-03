begin;

create table if not exists public.design_studio_settings (
  id boolean primary key default true check (id),
  admin_preview_enabled boolean not null default true,
  public_studio_enabled boolean not null default false,
  custom_checkout_enabled boolean not null default false,
  live_vendor_submission_enabled boolean not null default false,
  autosave_seconds integer not null default 8 check (autosave_seconds between 3 and 120),
  max_upload_bytes integer not null default 15728640 check (max_upload_bytes between 1048576 and 52428800),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.design_studio_settings(id) values (true) on conflict (id) do nothing;

create table if not exists public.design_print_areas (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.products(id) on delete cascade,
  product_size text not null default '*',
  production_route text not null check (production_route in ('hc_transfer_press','outside_print_vendor','printify','hc_in_house')),
  provider_key text not null default 'hc',
  print_method text not null,
  placement text not null check (placement in ('front','back','left_chest','right_chest','left_sleeve','right_sleeve')),
  width_in numeric check (width_in > 0),
  height_in numeric check (height_in > 0),
  min_dpi integer not null default 150 check (min_dpi between 72 and 1200),
  enabled boolean not null default false,
  verified boolean not null default false,
  source_note text,
  source_effective_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(product_id, product_size, production_route, provider_key, print_method, placement)
);

create table if not exists public.design_documents (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  name text not null default 'Untitled design',
  status text not null default 'draft' check (status in ('draft','saved','in_review','approved','ordered','archived')),
  product_id text references public.products(id) on delete restrict,
  variant_sku text,
  selected_color text,
  selected_size text,
  quantity integer not null default 1 check (quantity between 1 and 99999),
  production_route text not null default 'hc_transfer_press' check (production_route in ('hc_transfer_press','outside_print_vendor','printify','hc_in_house')),
  print_method text not null default 'dtf',
  document jsonb not null default '{}'::jsonb,
  validation jsonb not null default '[]'::jsonb,
  preview_paths jsonb not null default '{}'::jsonb,
  autosaved_at timestamptz,
  saved_at timestamptz,
  archived_at timestamptz,
  archive_reason text,
  purge_after date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists design_documents_owner_updated_idx on public.design_documents(owner_user_id, updated_at desc);

create table if not exists public.design_assets (
  id uuid primary key default gen_random_uuid(),
  design_id uuid references public.design_documents(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  storage_bucket text not null default 'customer-files' check (storage_bucket = 'customer-files'),
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null check (mime_type in ('image/png','image/jpeg','image/svg+xml')),
  byte_size integer not null check (byte_size > 0 and byte_size <= 52428800),
  pixel_width integer check (pixel_width > 0),
  pixel_height integer check (pixel_height > 0),
  sha256 text not null,
  svg_sanitized boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.design_versions (
  id uuid primary key default gen_random_uuid(),
  design_id uuid not null references public.design_documents(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  document_snapshot jsonb not null,
  production_spec_snapshot jsonb not null default '{}'::jsonb,
  validation_snapshot jsonb not null default '[]'::jsonb,
  checksum text not null,
  immutable boolean not null default true,
  created_at timestamptz not null default now(),
  unique(design_id, version_number)
);

create table if not exists public.order_design_snapshots (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders(id) on delete restrict,
  order_line_key text not null,
  design_id uuid not null references public.design_documents(id) on delete restrict,
  design_version_id uuid not null references public.design_versions(id) on delete restrict,
  immutable_design jsonb not null,
  production_specs jsonb not null,
  production_artwork_paths jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(order_id, order_line_key)
);

create table if not exists public.design_provider_mappings (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.products(id) on delete cascade,
  variant_sku text not null,
  provider text not null check (provider in ('printify','outside_print_vendor','hc')),
  provider_shop_id text,
  provider_blueprint_id text,
  provider_print_provider_id text,
  provider_product_id text,
  provider_variant_id text,
  provider_decoration_method text,
  provider_positions jsonb not null default '[]'::jsonb,
  compatible boolean not null default false,
  verified_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(product_id, variant_sku, provider)
);

create table if not exists public.design_pricing_config (
  id uuid primary key default gen_random_uuid(),
  production_route text not null check (production_route in ('hc_transfer_press','outside_print_vendor','printify','hc_in_house')),
  product_id text references public.products(id) on delete cascade,
  print_method text,
  placement text,
  service_price numeric check (service_price >= 0),
  transfer_cost numeric check (transfer_cost >= 0),
  pressing_labor_cost numeric check (pressing_labor_cost >= 0),
  packaging_cost numeric check (packaging_cost >= 0),
  other_fee numeric check (other_fee >= 0),
  active boolean not null default false,
  effective_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.printify_integration_settings (
  id boolean primary key default true check (id),
  connection_status text not null default 'not_connected' check (connection_status in ('not_connected','connected','error')),
  shop_id text,
  account_label text,
  catalog_read_enabled boolean not null default false,
  quotes_enabled boolean not null default false,
  order_submission_enabled boolean not null default false,
  status_sync_enabled boolean not null default false,
  last_verified_at timestamptz,
  last_safe_error text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.printify_integration_settings(id) values (true) on conflict (id) do nothing;

create table if not exists public.printify_cost_references (
  id uuid primary key default gen_random_uuid(),
  observed_on date not null,
  configuration_label text not null,
  variant_description text,
  production_cost numeric,
  shipping_cost numeric,
  supplier_tax numeric,
  total_supplier_quote numeric,
  production_cost_low numeric,
  production_cost_high numeric,
  suggested_retail_visible numeric,
  currency text not null default 'USD',
  is_live_quote boolean not null default false,
  source_note text not null,
  created_at timestamptz not null default now()
);

insert into public.printify_cost_references(
  observed_on, configuration_label, variant_description, production_cost, shipping_cost,
  supplier_tax, total_supplier_quote, production_cost_low, production_cost_high,
  suggested_retail_visible, is_live_quote, source_note
) select
  '2026-10-03', 'Printify Choice unisex garment-dyed T-shirt', 'L / White', 12.65, 3.99,
  1.33, 17.97, 12.65, 18.34, 36.99, false,
  'Dated screenshot reference supplied by Super Admin. Another screen showed economy shipping of $4.31. Not a live quote, universal rate, subscription discount, or HC selling price.'
where not exists (
  select 1 from public.printify_cost_references
  where observed_on='2026-10-03' and configuration_label='Printify Choice unisex garment-dyed T-shirt' and variant_description='L / White'
);

create table if not exists public.design_production_jobs (
  id uuid primary key default gen_random_uuid(),
  order_design_snapshot_id uuid references public.order_design_snapshots(id) on delete restrict,
  design_version_id uuid not null references public.design_versions(id) on delete restrict,
  production_route text not null,
  status text not null default 'review_required' check (status in ('review_required','approved','draft_prepared','submitted','in_production','shipped','completed','failed','cancelled')),
  artwork_approved_at timestamptz,
  artwork_approved_by uuid references auth.users(id) on delete set null,
  payment_verified_at timestamptz,
  provider_order_id text,
  provider_status text,
  provider_tracking jsonb not null default '[]'::jsonb,
  submission_idempotency_key text unique,
  explicit_submission_confirmed_at timestamptz,
  customer_revenue numeric,
  blank_cost numeric,
  transfer_cost numeric,
  pressing_labor_cost numeric,
  supplier_production_cost numeric,
  supplier_shipping numeric,
  supplier_tax numeric,
  packaging_cost numeric,
  payment_fees numeric,
  other_cost numeric,
  costs_complete boolean not null default false,
  estimated_contribution numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.design_studio_settings enable row level security;
alter table public.design_print_areas enable row level security;
alter table public.design_documents enable row level security;
alter table public.design_assets enable row level security;
alter table public.design_versions enable row level security;
alter table public.order_design_snapshots enable row level security;
alter table public.design_provider_mappings enable row level security;
alter table public.design_pricing_config enable row level security;
alter table public.printify_integration_settings enable row level security;
alter table public.printify_cost_references enable row level security;
alter table public.design_production_jobs enable row level security;

create policy design_settings_admin_all on public.design_studio_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy design_print_areas_admin_all on public.design_print_areas for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy design_documents_owner_read on public.design_documents for select to authenticated using (owner_user_id=auth.uid() or public.is_admin());
create policy design_documents_owner_insert on public.design_documents for insert to authenticated with check (owner_user_id=auth.uid() or public.is_admin());
create policy design_documents_owner_update on public.design_documents for update to authenticated using (owner_user_id=auth.uid() or public.is_admin()) with check (owner_user_id=auth.uid() or public.is_admin());
create policy design_assets_owner_read on public.design_assets for select to authenticated using (owner_user_id=auth.uid() or public.is_admin());
create policy design_assets_owner_insert on public.design_assets for insert to authenticated with check (owner_user_id=auth.uid() or public.is_admin());
create policy design_versions_owner_read on public.design_versions for select to authenticated using (owner_user_id=auth.uid() or public.is_admin());
create policy design_versions_owner_insert on public.design_versions for insert to authenticated with check (owner_user_id=auth.uid() or public.is_admin());
create policy order_design_snapshots_admin_read on public.order_design_snapshots for select to authenticated using (public.is_admin());
create policy design_provider_mappings_admin_all on public.design_provider_mappings for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy design_pricing_admin_all on public.design_pricing_config for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy printify_settings_admin_all on public.printify_integration_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy printify_cost_refs_admin_all on public.printify_cost_references for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy design_production_jobs_admin_all on public.design_production_jobs for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select, insert, update on public.design_documents to authenticated;
grant select, insert on public.design_assets to authenticated;
grant select, insert on public.design_versions to authenticated;
grant select, insert, update, delete on public.design_studio_settings, public.design_print_areas,
  public.design_provider_mappings, public.design_pricing_config, public.printify_integration_settings,
  public.printify_cost_references, public.design_production_jobs to authenticated;
grant select on public.order_design_snapshots to authenticated;

drop policy if exists design_assets_owner_insert on storage.objects;
create policy design_assets_owner_insert on storage.objects for insert to authenticated
with check (
  bucket_id='customer-files'
  and (storage.foldername(name))[1]='design-studio'
  and (storage.foldername(name))[2]=auth.uid()::text
);

drop policy if exists design_assets_owner_select on storage.objects;
create policy design_assets_owner_select on storage.objects for select to authenticated
using (
  bucket_id='customer-files'
  and (storage.foldername(name))[1]='design-studio'
  and ((storage.foldername(name))[2]=auth.uid()::text or public.is_admin())
);

create or replace function public.guard_immutable_design_version()
returns trigger language plpgsql as $$
begin
  raise exception 'Saved design versions are immutable';
end $$;

drop trigger if exists design_versions_immutable on public.design_versions;
create trigger design_versions_immutable before update or delete on public.design_versions
for each row execute function public.guard_immutable_design_version();

create or replace function public.guard_order_design_snapshot()
returns trigger language plpgsql as $$
begin
  raise exception 'Ordered design snapshots are immutable';
end $$;

drop trigger if exists order_design_snapshots_immutable on public.order_design_snapshots;
create trigger order_design_snapshots_immutable before update or delete on public.order_design_snapshots
for each row execute function public.guard_order_design_snapshot();

commit;
