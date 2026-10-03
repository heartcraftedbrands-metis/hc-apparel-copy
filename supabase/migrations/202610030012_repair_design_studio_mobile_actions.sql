begin;

alter table public.design_studio_settings
  add column if not exists default_raster_ppi integer not null default 300
    check (default_raster_ppi between 72 and 1200);

alter table public.design_assets
  add column if not exists file_kind text check (file_kind in ('png','jpg','svg')),
  add column if not exists has_transparency boolean,
  add column if not exists resolution_x_ppi numeric,
  add column if not exists resolution_y_ppi numeric,
  add column if not exists contains_embedded_raster boolean not null default false;

create table if not exists public.design_decoration_methods (
  method_key text primary key check (method_key in ('dtf','soft_vinyl','puff_vinyl','glitter_vinyl','flock_vinyl','embroidery','dtg')),
  customer_label text not null,
  customer_visible boolean not null default true,
  available boolean not null default false,
  availability_label text not null default 'Coming soon',
  production_route text not null default 'hc_transfer_press'
    check (production_route in ('hc_transfer_press','outside_print_vendor','printify','hc_in_house')),
  compatible_garment_types jsonb not null default '["t_shirts","hoodies","crewnecks"]'::jsonb,
  compatible_placements jsonb not null default '["front","back","left_chest","right_chest","left_sleeve","right_sleeve"]'::jsonb,
  limits_note text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.design_decoration_methods(method_key, customer_label, available, availability_label, production_route, limits_note)
values
  ('dtf', 'DTF', true, 'Available', 'hc_transfer_press', 'HC production workflow. Transfer and pressing are included in configured printing prices.'),
  ('soft_vinyl', 'Soft Vinyl', false, 'Coming soon', 'hc_transfer_press', 'Requires approved method-specific prices and limits.'),
  ('puff_vinyl', 'Puff Vinyl', false, 'Coming soon', 'hc_transfer_press', 'Requires approved method-specific prices and limits.'),
  ('glitter_vinyl', 'Glitter Vinyl', false, 'Coming soon', 'hc_transfer_press', 'Requires approved method-specific prices and limits.'),
  ('flock_vinyl', 'Flock Vinyl', false, 'Coming soon', 'hc_transfer_press', 'Requires approved method-specific prices and limits.'),
  ('embroidery', 'Embroidery', false, 'Currently unavailable', 'outside_print_vendor', 'S&S FAST approval, setup, digitization rules, and pricing are not configured.'),
  ('dtg', 'DTG', false, 'Currently unavailable', 'outside_print_vendor', 'S&S FAST is not approved and Printify integration is deferred.')
on conflict (method_key) do nothing;

create table if not exists public.design_pricing_packages (
  id uuid primary key default gen_random_uuid(),
  package_key text not null unique,
  method_key text not null references public.design_decoration_methods(method_key) on delete restrict,
  label text not null,
  placements jsonb not null,
  service_price numeric not null check (service_price >= 0),
  active boolean not null default true,
  source_note text not null,
  effective_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.design_pricing_config(production_route, product_id, print_method, placement, service_price, active, effective_at, notes)
select 'hc_transfer_press', null, 'dtf', values_row.placement, values_row.service_price, true, now(), values_row.notes
from (values
  ('front', 19.99::numeric, 'Heart Command Center saved service: Full front print up to 12 x 12; transfer and pressing included.'),
  ('left_chest', 6.99::numeric, 'Heart Command Center saved service: Left chest print up to 4 x 4; transfer and pressing included.'),
  ('right_chest', 6.99::numeric, 'Heart Command Center saved service: Right chest print up to 4 x 4; transfer and pressing included.'),
  ('left_sleeve', 6.99::numeric, 'Heart Command Center saved service: Left sleeve print up to 3.5 x 3.5; transfer and pressing included.'),
  ('right_sleeve', 6.99::numeric, 'Heart Command Center saved service: Right sleeve print up to 3.5 x 3.5; transfer and pressing included.')
) as values_row(placement, service_price, notes)
where not exists (
  select 1 from public.design_pricing_config existing
  where existing.production_route='hc_transfer_press'
    and existing.product_id is null
    and existing.print_method='dtf'
    and existing.placement=values_row.placement
);

insert into public.design_pricing_packages(package_key, method_key, label, placements, service_price, source_note)
values
  ('dtf_front_back', 'dtf', 'Front and back print', '["front","back"]'::jsonb, 34.99, 'Heart Command Center saved service price; up to 12 x 12 per location, transfer and pressing included.'),
  ('dtf_both_sleeves', 'dtf', 'Both sleeves print', '["left_sleeve","right_sleeve"]'::jsonb, 12.99, 'Heart Command Center saved service price; small logos up to 3.5 x 3.5 each, transfer and pressing included.')
on conflict (package_key) do nothing;

create table if not exists public.design_preview_cart_items (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  design_id uuid not null references public.design_documents(id) on delete cascade,
  design_version_id uuid not null references public.design_versions(id) on delete cascade,
  design_checksum text not null,
  product_id text references public.products(id) on delete restrict,
  product_name text,
  variant_sku text,
  selected_color text,
  selected_size text,
  quantity integer not null default 1 check (quantity between 1 and 99999),
  decoration_method text not null default 'dtf',
  placements jsonb not null default '[]'::jsonb,
  thumbnail_url text,
  garment_unit_price numeric,
  printing_unit_price numeric,
  merchandise_total numeric,
  pricing_complete boolean not null default false,
  checkout_ready boolean not null default false,
  blockers jsonb not null default '[]'::jsonb,
  document_snapshot jsonb not null,
  admin_preview_only boolean not null default true check (admin_preview_only),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_user_id, design_version_id)
);

alter table public.design_decoration_methods enable row level security;
alter table public.design_pricing_packages enable row level security;
alter table public.design_preview_cart_items enable row level security;

drop policy if exists design_decoration_methods_admin_all on public.design_decoration_methods;
create policy design_decoration_methods_admin_all on public.design_decoration_methods
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists design_pricing_packages_admin_all on public.design_pricing_packages;
create policy design_pricing_packages_admin_all on public.design_pricing_packages
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists design_preview_cart_owner_read on public.design_preview_cart_items;
create policy design_preview_cart_owner_read on public.design_preview_cart_items
for select to authenticated using (owner_user_id=auth.uid() or public.is_admin());

grant select, insert, update, delete on public.design_decoration_methods, public.design_pricing_packages to authenticated;
grant select on public.design_preview_cart_items to authenticated;
grant select, insert, update, delete on public.design_decoration_methods, public.design_pricing_packages, public.design_preview_cart_items to service_role;

commit;
