create table if not exists public."ss_sku_sync_runs" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "started_at" timestamptz not null default now(),
  "completed_at" timestamptz,
  "owner_user_id" uuid references auth.users(id) on delete set null,
  "created_by_email" text,
  "style_session_id" text not null,
  "brand" text not null,
  "status" text not null default 'running'
    check ("status" in ('running', 'completed', 'failed')),
  "total_styles" integer not null default 0,
  "total_skus" integer not null default 0,
  "skipped_rows" integer not null default 0,
  "api_requests" integer not null default 0,
  "rate_limit_remaining" integer,
  "error_message" text,
  unique ("style_session_id", "brand")
);

drop trigger if exists "ss_sku_sync_runs_set_updated_date" on public."ss_sku_sync_runs";
create trigger "ss_sku_sync_runs_set_updated_date"
before update on public."ss_sku_sync_runs"
for each row execute function public.set_updated_date();

create table if not exists public."ss_sku_staging" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "fetched_at" timestamptz not null default now(),
  "owner_user_id" uuid references auth.users(id) on delete set null,
  "created_by_email" text,
  "style_session_id" text not null,
  "sync_run_id" text references public."ss_sku_sync_runs"("id") on delete cascade,
  "brand" text not null,
  "style_id" bigint not null,
  "part_number" text,
  "style_name" text,
  "sku_id" bigint,
  "sku" text not null,
  "gtin" text,
  "your_sku" text,
  "color_name" text,
  "color_code" text,
  "color_price_code_name" text,
  "color_group" text,
  "color_group_name" text,
  "color_family_id" bigint,
  "color_family" text,
  "color_swatch_image" text,
  "color_swatch_text_color" text,
  "color_front_image" text,
  "color_side_image" text,
  "color_back_image" text,
  "color_direct_side_image" text,
  "color_on_model_front_image" text,
  "color_on_model_side_image" text,
  "color_on_model_back_image" text,
  "color_1" text,
  "color_2" text,
  "size_name" text,
  "size_code" text,
  "size_order" text,
  "size_price_code_name" text,
  "case_qty" integer,
  "unit_weight" numeric,
  "map_price" numeric,
  "retail_price" numeric,
  "piece_price" numeric,
  "dozen_price" numeric,
  "case_price" numeric,
  "sale_price" numeric,
  "customer_price" numeric,
  "sale_expiration" text,
  "noe_retailing" boolean not null default false,
  "poly_pack_qty" integer,
  "inventory_qty" integer not null default 0,
  "country_of_origin" text,
  "warehouses" jsonb not null default '[]'::jsonb,
  "raw_product" jsonb not null default '{}'::jsonb,
  "review_status" text not null default 'pending'
    check ("review_status" in ('pending', 'approved', 'rejected')),
  "review_notes" text,
  unique ("style_session_id", "sku")
);

drop trigger if exists "ss_sku_staging_set_updated_date" on public."ss_sku_staging";
create trigger "ss_sku_staging_set_updated_date"
before update on public."ss_sku_staging"
for each row execute function public.set_updated_date();

create index if not exists "idx_ss_sku_sync_runs_session"
on public."ss_sku_sync_runs" ("style_session_id", "status");
create index if not exists "idx_ss_sku_staging_session_brand"
on public."ss_sku_staging" ("style_session_id", "brand");
create index if not exists "idx_ss_sku_staging_style_id"
on public."ss_sku_staging" ("style_id");
create index if not exists "idx_ss_sku_staging_review_status"
on public."ss_sku_staging" ("review_status");

alter table public."ss_sku_sync_runs" enable row level security;
alter table public."ss_sku_staging" enable row level security;

drop policy if exists "admin_all_ss_sku_sync_runs" on public."ss_sku_sync_runs";
create policy "admin_all_ss_sku_sync_runs"
on public."ss_sku_sync_runs"
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admin_all_ss_sku_staging" on public."ss_sku_staging";
create policy "admin_all_ss_sku_staging"
on public."ss_sku_staging"
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

revoke all on public."ss_sku_sync_runs", public."ss_sku_staging" from public, anon, authenticated;
grant select, insert, update, delete
on public."ss_sku_sync_runs", public."ss_sku_staging"
to authenticated;
