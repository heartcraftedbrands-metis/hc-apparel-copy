begin;

create table if not exists public.design_mockup_mappings (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.products(id) on delete cascade,
  color_key text not null default '*',
  view text not null check (view in ('front','back','left_sleeve','right_sleeve')),
  image_url text,
  storage_bucket text check (storage_bucket is null or storage_bucket = 'customer-files'),
  storage_path text,
  preview_area jsonb,
  source_note text not null,
  verified boolean not null default false,
  verified_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (nullif(btrim(coalesce(image_url,'')), '') is not null or nullif(btrim(coalesce(storage_path,'')), '') is not null),
  check (preview_area is null or (
    jsonb_typeof(preview_area) = 'object'
    and (preview_area->>'x')::numeric between 0 and 100
    and (preview_area->>'y')::numeric between 0 and 120
    and (preview_area->>'width')::numeric > 0
    and (preview_area->>'height')::numeric > 0
  )),
  unique(product_id, color_key, view)
);

alter table public.design_mockup_mappings enable row level security;
create policy design_mockup_mappings_admin_all on public.design_mockup_mappings
for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.design_mockup_mappings to authenticated;

create index if not exists design_mockup_product_color_idx
on public.design_mockup_mappings(product_id, color_key, view);

create unique index if not exists design_pricing_config_scope_unique
on public.design_pricing_config (
  production_route,
  coalesce(product_id, '*'),
  coalesce(print_method, '*'),
  coalesce(placement, '*')
);

commit;
