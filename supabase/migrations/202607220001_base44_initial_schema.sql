-- Generated from base44/entities on 2026-07-22.
-- Review before deployment. Run through Supabase migrations, not the dashboard table editor.
begin;

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'customer' check (role in ('customer', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_date()
returns trigger language plpgsql as $$
begin
  new.updated_date = now();
  return new;
end;
$$;

create or replace function public.set_profile_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users for each row execute function public.handle_new_auth_user();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_profile_updated_at();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create table if not exists public."carts" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "legacy_created_by_id" text,
  "created_by_email" text,
  "owner_user_id" uuid references auth.users(id) on delete set null,
  "is_sample" boolean not null default false,
  "items" jsonb
);

drop trigger if exists "carts_set_updated_date" on public."carts";
create trigger "carts_set_updated_date" before update on public."carts"
for each row execute function public.set_updated_date();

create table if not exists public."contact_messages" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "legacy_created_by_id" text,
  "created_by_email" text,
  "owner_user_id" uuid references auth.users(id) on delete set null,
  "is_sample" boolean not null default false,
  "name" text not null,
  "email" text not null,
  "subject" text,
  "message" text not null,
  "status" text default 'new' check ("status" in ('new', 'reviewed', 'replied', 'archived'))
);

drop trigger if exists "contact_messages_set_updated_date" on public."contact_messages";
create trigger "contact_messages_set_updated_date" before update on public."contact_messages"
for each row execute function public.set_updated_date();

create table if not exists public."customer_notifications" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "legacy_created_by_id" text,
  "created_by_email" text,
  "owner_user_id" uuid references auth.users(id) on delete set null,
  "is_sample" boolean not null default false,
  "order_id" text not null,
  "order_number" text not null,
  "customer_name" text not null,
  "customer_email" text not null,
  "notification_type" text not null check ("notification_type" in ('order_received', 'awaiting_payment', 'payment_confirmed', 'preparing_order', 'sent_to_production', 'in_production', 'shipped', 'delivered', 'completed', 'custom_update')),
  "subject" text not null,
  "customer_message" text not null,
  "related_status" text,
  "sent_status" text default 'draft' check ("sent_status" in ('draft', 'ready_to_send', 'sent', 'failed')),
  "customer_visible" boolean default true,
  "admin_note" text,
  "sent_date" timestamptz,
  "auto_generated" boolean default false,
  "trigger_event" text
);

drop trigger if exists "customer_notifications_set_updated_date" on public."customer_notifications";
create trigger "customer_notifications_set_updated_date" before update on public."customer_notifications"
for each row execute function public.set_updated_date();

create table if not exists public."garment_catalog_items" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "legacy_created_by_id" text,
  "created_by_email" text,
  "owner_user_id" uuid references auth.users(id) on delete set null,
  "is_sample" boolean not null default false,
  "brand" text,
  "style_number" text,
  "product_name" text not null,
  "material" text default '' check ("material" in ('100% Cotton', 'Organic Cotton', 'Ring-Spun Cotton', 'Cotton Blend', 'CVC Cotton Blend', 'Linen', 'Wool', 'Bamboo', 'Bamboo Blend', 'Sports / Activewear', 'Other', '', 'Cotton/Poly Fleece', 'Ring Spun Cotton')),
  "product_type" text default '' check ("product_type" in ('T-Shirt', 'Hoodie', 'Sweatshirt', 'Tank Top', 'Polo', 'Shorts', 'Joggers', 'Youth', 'Sportswear', 'Other', '', 'Long Sleeve')),
  "color" text,
  "size" text,
  "sku" text,
  "blank_cost" numeric default 0,
  "customer_price" numeric default 0,
  "inventory_qty" numeric default 0,
  "image_url" text,
  "status" text default 'approved_to_sell' check ("status" in ('approved_to_sell', 'maybe_later', 'not_selling')),
  "source_file" text,
  "import_date" text,
  "draft_product_id" text,
  "draft_built_at" text
);

drop trigger if exists "garment_catalog_items_set_updated_date" on public."garment_catalog_items";
create trigger "garment_catalog_items_set_updated_date" before update on public."garment_catalog_items"
for each row execute function public.set_updated_date();

create table if not exists public."import_batches" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "legacy_created_by_id" text,
  "created_by_email" text,
  "owner_user_id" uuid references auth.users(id) on delete set null,
  "is_sample" boolean not null default false,
  "batch_id" text not null,
  "file_name" text not null,
  "uploaded_date" timestamptz,
  "rows_in_file" numeric,
  "new_skus_added" numeric default 0,
  "existing_skus_updated" numeric default 0,
  "total_catalog_rows_after" numeric,
  "rows_deleted" numeric default 0,
  "errors" jsonb,
  "import_status" text default 'success' check ("import_status" in ('success', 'partial', 'failed'))
);

drop trigger if exists "import_batches_set_updated_date" on public."import_batches";
create trigger "import_batches_set_updated_date" before update on public."import_batches"
for each row execute function public.set_updated_date();

create table if not exists public."newsletter_subscribers" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "legacy_created_by_id" text,
  "created_by_email" text,
  "owner_user_id" uuid references auth.users(id) on delete set null,
  "is_sample" boolean not null default false,
  "email" text not null,
  "is_active" boolean default true
);

drop trigger if exists "newsletter_subscribers_set_updated_date" on public."newsletter_subscribers";
create trigger "newsletter_subscribers_set_updated_date" before update on public."newsletter_subscribers"
for each row execute function public.set_updated_date();

create table if not exists public."orders" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "legacy_created_by_id" text,
  "created_by_email" text,
  "owner_user_id" uuid references auth.users(id) on delete set null,
  "is_sample" boolean not null default false,
  "customer_email" text not null,
  "customer_name" text not null,
  "customer_phone" text,
  "business_name" text,
  "preferred_contact" text default 'email' check ("preferred_contact" in ('email', 'phone', 'text')),
  "order_items" jsonb,
  "total_amount" numeric not null,
  "amount_paid" numeric default 0,
  "balance_due" numeric default 0,
  "status" text default 'awaiting_payment' check ("status" in ('awaiting_payment', 'paid', 'awaiting_fulfillment', 'in_production', 'shipped', 'completed', 'canceled', 'refunded')),
  "payment_status" text default 'unpaid' check ("payment_status" in ('unpaid', 'partially_paid', 'paid', 'refunded', 'awaiting_payment', 'pay_later', 'demo')),
  "payment_method" text,
  "payment_date" timestamptz,
  "payment_notes" text,
  "stripe_session_id" text,
  "stripe_payment_intent_id" text,
  "fulfillment_status" text default 'not_started' check ("fulfillment_status" in ('not_started', 'vendor_order_needed', 'ordered_from_vendor', 'in_transit_to_me', 'ready_to_ship', 'shipped', 'delivered', 'issue_hold', 'completed', 'sent_to_vendor')),
  "has_physical_items" boolean default false,
  "shipping_address" jsonb,
  "delivery_notes" text,
  "notes" text,
  "internal_notes" text,
  "production_file_url" text,
  "quote_request_id" text,
  "vendor_order_id" text,
  "assigned_vendor_id" text,
  "assigned_vendor_name" text,
  "vendor_cost_estimate" numeric default 0,
  "estimated_profit" numeric default 0,
  "profit_margin_pct" numeric default 0,
  "garment_type" text,
  "quantity" numeric,
  "sizes_needed" text,
  "garment_colors" text,
  "print_method" text,
  "print_placement" jsonb,
  "num_print_locations" numeric default 1,
  "date_needed" text,
  "project_notes" text,
  "artwork_file_url" text,
  "mockup_file_url" text,
  "artwork_link" text,
  "needs_artwork_help" boolean default false,
  "what_to_print" text,
  "tracking_number" text,
  "tracking_carrier" text,
  "tracking_url" text,
  "shipped_date" date,
  "delivery_estimate" text,
  "fulfillment_notes" text
);

drop trigger if exists "orders_set_updated_date" on public."orders";
create trigger "orders_set_updated_date" before update on public."orders"
for each row execute function public.set_updated_date();

create table if not exists public."order_status_history" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "legacy_created_by_id" text,
  "created_by_email" text,
  "owner_user_id" uuid references auth.users(id) on delete set null,
  "is_sample" boolean not null default false,
  "order_id" text not null,
  "order_number" text not null,
  "status_title" text not null,
  "status_type" text not null check ("status_type" in ('payment', 'order', 'fulfillment', 'vendor', 'tracking', 'system', 'manual')),
  "customer_message" text,
  "admin_note" text,
  "customer_visible" boolean default true,
  "created_by" text default 'system' check ("created_by" in ('admin', 'system', 'customer')),
  "previous_value" text,
  "new_value" text
);

drop trigger if exists "order_status_history_set_updated_date" on public."order_status_history";
create trigger "order_status_history_set_updated_date" before update on public."order_status_history"
for each row execute function public.set_updated_date();

create table if not exists public."payment_fee_settings" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "legacy_created_by_id" text,
  "created_by_email" text,
  "owner_user_id" uuid references auth.users(id) on delete set null,
  "is_sample" boolean not null default false,
  "stripe_fee_buffer_percent" numeric default 3.5,
  "stripe_fixed_fee_buffer" numeric default 0.5,
  "paypal_fee_buffer_percent" numeric default 4.0,
  "paypal_fixed_fee_buffer" numeric default 0.5,
  "additional_profit_buffer_percent" numeric default 0,
  "price_rounding_mode" text default 'nearest_99' check ("price_rounding_mode" in ('none', 'nearest_99', 'nearest_49', 'whole_dollar')),
  "last_updated" timestamptz
);

drop trigger if exists "payment_fee_settings_set_updated_date" on public."payment_fee_settings";
create trigger "payment_fee_settings_set_updated_date" before update on public."payment_fee_settings"
for each row execute function public.set_updated_date();

create table if not exists public."payment_settings" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "legacy_created_by_id" text,
  "created_by_email" text,
  "owner_user_id" uuid references auth.users(id) on delete set null,
  "is_sample" boolean not null default false,
  "payment_mode" text default 'manual' not null check ("payment_mode" in ('demo', 'manual', 'pay_later', 'stripe')),
  "stripe_connected" boolean default false,
  "test_mode_enabled" boolean default false,
  "invoice_instructions" text,
  "payment_notes_customer" text,
  "payment_notes_admin" text
);

drop trigger if exists "payment_settings_set_updated_date" on public."payment_settings";
create trigger "payment_settings_set_updated_date" before update on public."payment_settings"
for each row execute function public.set_updated_date();

create table if not exists public."products" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "legacy_created_by_id" text,
  "created_by_email" text,
  "owner_user_id" uuid references auth.users(id) on delete set null,
  "is_sample" boolean not null default false,
  "name" text not null,
  "description" text,
  "price" numeric not null,
  "sale_price" numeric,
  "product_type" text not null check ("product_type" in ('digital', 'physical')),
  "product_subtype" text default '' check ("product_subtype" in ('t_shirts', 'hoodies', 'sweatshirts', 'hats', 'kids_apparel', 'apparel_blanks', 'custom_printed', 'print_support', 'other', '')),
  "design_type" text default '' check ("design_type" in ('halftone', 'fulltone', 'bundle', '')),
  "visibility" text default 'public' check ("visibility" in ('public', 'draft', 'hidden', 'admin_archive')),
  "image_url" text,
  "mockup_images" jsonb,
  "file_url" text,
  "stock" numeric default 0,
  "category" text default 'other' check ("category" in ('digital_designs', 'halftone_packs', 'distressed_packs', 'design_elements', 'short_sleeve_shirts', 'mens_short_sleeve_shirts', 'womens_short_sleeve_shirts', 'youth_short_sleeve_shirts', 'long_sleeve_shirts', 'mens_long_sleeve_shirts', 'womens_long_sleeve_shirts', 'youth_long_sleeve_shirts', 'crewnecks', 'mens_crewnecks', 'womens_crewnecks', 'youth_crewnecks', 'polo_shirts', 'mens_polo_shirts', 'womens_polo_shirts', 'youth_polo_shirts', 'jackets', 'mens_jackets', 'womens_jackets', 'youth_jackets', 'sportswear', 'mens_sportswear', 'womens_sportswear', 'youth_sportswear', 'hoodies', 'hats', 'office_supplies', 'accessories', 'other', 'apparel_blanks')),
  "categories" jsonb,
  "tags" jsonb,
  "is_featured" boolean default false,
  "is_best_seller" boolean default false,
  "available_sizes" jsonb,
  "available_colors" jsonb,
  "size_prices" jsonb,
  "care_instructions" text,
  "shipping_note" text,
  "is_active" boolean default true,
  "vendor_source" text,
  "vendor_cost" numeric default 0,
  "blank_garment_cost" numeric default 0,
  "print_cost_estimate" numeric default 0,
  "profit_estimate" numeric default 0,
  "internal_notes" text,
  "supplier_sku" text,
  "vendor_pricing_id" text
);

drop trigger if exists "products_set_updated_date" on public."products";
create trigger "products_set_updated_date" before update on public."products"
for each row execute function public.set_updated_date();

create table if not exists public."quotes" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "legacy_created_by_id" text,
  "created_by_email" text,
  "owner_user_id" uuid references auth.users(id) on delete set null,
  "is_sample" boolean not null default false,
  "customer_name" text not null,
  "customer_email" text not null,
  "customer_phone" text,
  "preferred_contact" text default 'email' check ("preferred_contact" in ('email', 'phone', 'text')),
  "product_type" text,
  "garment_type" text,
  "quantity" numeric,
  "sizes" text,
  "colors" text,
  "print_method" text,
  "print_locations" numeric default 1,
  "date_needed" text,
  "budget_range" text,
  "description" text,
  "blank_garment_cost" numeric default 0,
  "print_cost" numeric default 0,
  "setup_fee" numeric default 0,
  "shipping_cost" numeric default 0,
  "other_fees" numeric default 0,
  "vendor_estimate" numeric default 0,
  "my_selling_price" numeric default 0,
  "estimated_price" numeric,
  "estimated_profit" numeric default 0,
  "profit_margin_pct" numeric default 0,
  "assigned_vendor_id" text,
  "assigned_vendor_name" text,
  "status" text default 'draft' check ("status" in ('draft', 'reviewing', 'need_more_info', 'waiting_on_vendor', 'quote_ready', 'sent', 'approved', 'declined', 'converted_to_order', 'new')),
  "admin_notes" text,
  "vendor_notes" text,
  "quote_response_message" text,
  "file_url" text,
  "shipping_street" text,
  "shipping_city" text,
  "shipping_state" text,
  "shipping_zip" text,
  "local_pickup" boolean default false,
  "converted_order_id" text
);

drop trigger if exists "quotes_set_updated_date" on public."quotes";
create trigger "quotes_set_updated_date" before update on public."quotes"
for each row execute function public.set_updated_date();

create table if not exists public."quote_requests" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "legacy_created_by_id" text,
  "created_by_email" text,
  "owner_user_id" uuid references auth.users(id) on delete set null,
  "is_sample" boolean not null default false,
  "full_name" text not null,
  "email" text not null,
  "phone" text,
  "business_name" text,
  "preferred_contact" text default 'email' check ("preferred_contact" in ('email', 'phone', 'text')),
  "product_type" text default 't_shirts' check ("product_type" in ('t_shirts', 'hoodies', 'sweatshirts', 'tank_tops', 'sportswear', 'youth_apparel', 'bulk_order', 'other')),
  "garment_knowledge" text default 'need_help_choosing' check ("garment_knowledge" in ('picked_from_shop', 'need_help_choosing', 'have_own_garment')),
  "preferred_garment_style" text,
  "quantity" numeric,
  "sizes_needed" text,
  "garment_colors" text,
  "print_placement" jsonb,
  "print_colors" text default 'not_sure' check ("print_colors" in ('1_color', '2_colors', 'full_color', 'not_sure')),
  "print_method" text default 'not_sure' check ("print_method" in ('dtf', 'screen_print', 'vinyl', 'embroidery', 'not_sure')),
  "artwork_status" text default 'only_idea' check ("artwork_status" in ('print_ready', 'have_logo_need_help', 'only_idea', 'need_design_help')),
  "artwork_file_url" text,
  "artwork_link" text,
  "needs_artwork_help" boolean default false,
  "date_needed" date,
  "project_notes" text,
  "status" text default 'new' check ("status" in ('new', 'reviewing', 'waiting_on_customer', 'quote_sent', 'approved', 'declined', 'completed', 'converted_to_order')),
  "admin_notes" text,
  "admin_mockup_url" text,
  "quote_response_sent" boolean default false,
  "converted_order_id" text,
  "assigned_vendor_id" text,
  "assigned_vendor_name" text,
  "blank_garment_cost" numeric default 0,
  "print_cost" numeric default 0,
  "shipping_cost_vendor" numeric default 0,
  "setup_fee" numeric default 0,
  "other_fees" numeric default 0,
  "vendor_estimate_total" numeric default 0,
  "customer_quote_price" numeric default 0,
  "estimated_profit" numeric default 0,
  "profit_margin_pct" numeric default 0,
  "mockup_file_url" text,
  "what_to_print" text,
  "num_print_locations" numeric default 1,
  "budget_range" text,
  "shipping_street" text,
  "shipping_city" text,
  "shipping_state" text,
  "shipping_zip" text,
  "local_pickup" boolean default false,
  "delivery_notes" text
);

drop trigger if exists "quote_requests_set_updated_date" on public."quote_requests";
create trigger "quote_requests_set_updated_date" before update on public."quote_requests"
for each row execute function public.set_updated_date();

create table if not exists public."reviews" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "legacy_created_by_id" text,
  "created_by_email" text,
  "owner_user_id" uuid references auth.users(id) on delete set null,
  "is_sample" boolean not null default false,
  "reviewer_name" text not null,
  "rating" numeric not null,
  "review_text" text not null,
  "product_name" text,
  "is_active" boolean default true
);

drop trigger if exists "reviews_set_updated_date" on public."reviews";
create trigger "reviews_set_updated_date" before update on public."reviews"
for each row execute function public.set_updated_date();

create table if not exists public."ss_catalog_items" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "legacy_created_by_id" text,
  "created_by_email" text,
  "owner_user_id" uuid references auth.users(id) on delete set null,
  "is_sample" boolean not null default false,
  "vendor" text default 'S&S Activewear',
  "brand" text,
  "style_number" text,
  "product_name" text not null,
  "product_category" text,
  "description" text,
  "color" text,
  "size" text,
  "sku" text,
  "image_url" text,
  "blank_cost" numeric default 0,
  "msrp" numeric default 0,
  "inventory_qty" numeric default 0,
  "warehouse_location" text,
  "weight" text,
  "case_quantity" numeric,
  "item_status" text default 'active',
  "catalog_status" text default 'vendor_catalog_only' check ("catalog_status" in ('vendor_catalog_only', 'added_to_shop', 'archived', 'hidden')),
  "linked_product_id" text,
  "linked_vendor_pricing_id" text,
  "import_batch" text,
  "import_batch_id" text,
  "source_file_name" text,
  "parent_group_id" text,
  "public_price" numeric default 0,
  "measurements" text,
  "fabric_details" text,
  "fit" text,
  "material" text,
  "care_notes" text,
  "days_in_transit" numeric,
  "curated_status" text default 'pending_review' check ("curated_status" in ('pending_review', 'approved_to_sell', 'not_selling', 'maybe_later')),
  "product_lane" text default '' check ("product_lane" in ('Cotton', 'Organic Cotton', 'Ring-Spun Cotton', 'Cotton Blend', 'CVC', 'Linen', 'Wool', 'Bamboo', 'Bamboo Blend', 'Sports / Activewear', 'Hoodie / Fleece', 'Youth', 'Other', '')),
  "suggested_lane" text default '',
  "review_notes" text,
  "customer_price" numeric default 0,
  "profit_estimate" numeric default 0,
  "needs_price_review" boolean default false
);

drop trigger if exists "ss_catalog_items_set_updated_date" on public."ss_catalog_items";
create trigger "ss_catalog_items_set_updated_date" before update on public."ss_catalog_items"
for each row execute function public.set_updated_date();

create table if not exists public."ss_import_staging" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "legacy_created_by_id" text,
  "created_by_email" text,
  "owner_user_id" uuid references auth.users(id) on delete set null,
  "is_sample" boolean not null default false,
  "import_session_id" text not null,
  "file_name" text not null,
  "total_staged_rows" numeric,
  "row_number" numeric not null,
  "raw_row_data" text,
  "sku" text,
  "brand" text,
  "style_number" text,
  "product_name" text,
  "product_category" text,
  "color" text,
  "size" text,
  "blank_cost" numeric default 0,
  "inventory_qty" numeric default 0,
  "image_url" text,
  "row_status" text default 'pending' check ("row_status" in ('pending', 'imported', 'updated', 'skipped', 'error')),
  "error_message" text
);

drop trigger if exists "ss_import_staging_set_updated_date" on public."ss_import_staging";
create trigger "ss_import_staging_set_updated_date" before update on public."ss_import_staging"
for each row execute function public.set_updated_date();

create table if not exists public."ss_pricing_rules" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "legacy_created_by_id" text,
  "created_by_email" text,
  "owner_user_id" uuid references auth.users(id) on delete set null,
  "is_sample" boolean not null default false,
  "flat_markup_amount" numeric default 2.0,
  "rounding_mode" text default 'none' check ("rounding_mode" in ('none', 'nearest_tenth', 'nearest_half', 'round_up')),
  "minimum_price" numeric default 0,
  "category_overrides" jsonb,
  "brand_overrides" jsonb,
  "last_updated" timestamptz
);

drop trigger if exists "ss_pricing_rules_set_updated_date" on public."ss_pricing_rules";
create trigger "ss_pricing_rules_set_updated_date" before update on public."ss_pricing_rules"
for each row execute function public.set_updated_date();

create table if not exists public."vendors" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "legacy_created_by_id" text,
  "created_by_email" text,
  "owner_user_id" uuid references auth.users(id) on delete set null,
  "is_sample" boolean not null default false,
  "name" text not null,
  "vendor_type" text default 'other' check ("vendor_type" in ('apparel_blank_supplier', 'dtf_printer', 'screen_printer', 'embroidery', 'dtg_printer', 'dtf_supplier', 'sublimation', 'packaging', 'shipping', 'other')),
  "contact_person" text,
  "email" text,
  "phone" text,
  "website" text,
  "address" text,
  "notes" text,
  "is_active" boolean default true,
  "print_methods_offered" jsonb,
  "garment_types_offered" jsonb,
  "minimum_order_quantity" numeric,
  "turnaround_time" text,
  "rush_order_available" boolean default false,
  "rush_fee_notes" text,
  "shipping_options" text,
  "local_pickup_available" boolean default false,
  "quality_rating" numeric,
  "reliability_rating" numeric,
  "default_setup_fee" numeric default 0,
  "default_shipping_estimate" numeric default 0,
  "payment_terms" text,
  "tax_charged" boolean default false,
  "pricing_notes" text,
  "shipping_cost_notes" text
);

drop trigger if exists "vendors_set_updated_date" on public."vendors";
create trigger "vendors_set_updated_date" before update on public."vendors"
for each row execute function public.set_updated_date();

create table if not exists public."vendor_orders" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "legacy_created_by_id" text,
  "created_by_email" text,
  "owner_user_id" uuid references auth.users(id) on delete set null,
  "is_sample" boolean not null default false,
  "customer_order_id" text,
  "quote_request_id" text,
  "vendor_id" text not null,
  "vendor_name" text not null,
  "status" text default 'draft' check ("status" in ('draft', 'ready_to_place', 'sent_to_vendor', 'accepted', 'in_production', 'shipped', 'delivered', 'issue_hold', 'canceled')),
  "items" jsonb,
  "artwork_file_url" text,
  "artwork_link" text,
  "admin_mockup_url" text,
  "blank_garment_cost" numeric default 0,
  "print_cost" numeric default 0,
  "setup_fee" numeric default 0,
  "shipping_cost" numeric default 0,
  "other_fees" numeric default 0,
  "customer_sell_price" numeric default 0,
  "estimated_profit" numeric default 0,
  "profit_margin_pct" numeric default 0,
  "shipping_notes" text,
  "production_notes" text,
  "tracking_number" text,
  "tracking_carrier" text,
  "tracking_url" text,
  "ship_date" date,
  "estimated_delivery_date" date,
  "fulfillment_checklist" jsonb,
  "internal_notes" text,
  "customer_paid_total" numeric
);

drop trigger if exists "vendor_orders_set_updated_date" on public."vendor_orders";
create trigger "vendor_orders_set_updated_date" before update on public."vendor_orders"
for each row execute function public.set_updated_date();

create table if not exists public."vendor_order_drafts" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "legacy_created_by_id" text,
  "created_by_email" text,
  "owner_user_id" uuid references auth.users(id) on delete set null,
  "is_sample" boolean not null default false,
  "vendor_order_number" text,
  "customer_order_id" text not null,
  "customer_order_number" text,
  "customer_name" text not null,
  "customer_email" text,
  "order_date" timestamptz,
  "vendor_status" text default 'draft' check ("vendor_status" in ('draft', 'ready_to_order', 'ordered_from_vendor', 'in_transit_to_me', 'received', 'partially_received', 'cancelled')),
  "vendor_name" text,
  "external_vendor_order_number" text,
  "vendor_order_date" date,
  "expected_arrival_date" date,
  "items" jsonb,
  "tracking_number" text,
  "tracking_carrier" text,
  "tracking_url" text,
  "notes" text,
  "has_sku_warnings" boolean default false,
  "has_image_warnings" boolean default false,
  "has_missing_warnings" boolean default false,
  "total_quantity" numeric default 0,
  "item_count" numeric default 0
);

drop trigger if exists "vendor_order_drafts_set_updated_date" on public."vendor_order_drafts";
create trigger "vendor_order_drafts_set_updated_date" before update on public."vendor_order_drafts"
for each row execute function public.set_updated_date();

create table if not exists public."vendor_pricing" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "legacy_created_by_id" text,
  "created_by_email" text,
  "owner_user_id" uuid references auth.users(id) on delete set null,
  "is_sample" boolean not null default false,
  "vendor_id" text not null,
  "vendor_name" text not null,
  "product_name" text,
  "garment_brand" text,
  "garment_style_number" text,
  "product_category" text,
  "blank_garment_cost" numeric default 0,
  "print_method" text default 'dtf' check ("print_method" in ('dtf', 'screen_print', 'embroidery', 'dtg', 'sublimation', 'vinyl', 'heat_transfer', 'other')),
  "print_cost" numeric default 0,
  "setup_fee" numeric default 0,
  "shipping_cost" numeric default 0,
  "minimum_order_quantity" numeric,
  "turnaround_time" text,
  "size_upcharge_notes" text,
  "color_upcharge_notes" text,
  "notes" text,
  "is_active" boolean default true
);

drop trigger if exists "vendor_pricing_set_updated_date" on public."vendor_pricing";
create trigger "vendor_pricing_set_updated_date" before update on public."vendor_pricing"
for each row execute function public.set_updated_date();

create table if not exists public."wishlists" (
  "id" text primary key default gen_random_uuid()::text,
  "created_date" timestamptz not null default now(),
  "updated_date" timestamptz not null default now(),
  "legacy_created_by_id" text,
  "created_by_email" text,
  "owner_user_id" uuid references auth.users(id) on delete set null,
  "is_sample" boolean not null default false,
  "product_id" text not null
);

drop trigger if exists "wishlists_set_updated_date" on public."wishlists";
create trigger "wishlists_set_updated_date" before update on public."wishlists"
for each row execute function public.set_updated_date();

create index if not exists "idx_products_visibility" on public."products" ("visibility");
create index if not exists "idx_products_is_active" on public."products" ("is_active");
create index if not exists "idx_products_category" on public."products" ("category");
create index if not exists "idx_products_supplier_sku" on public."products" ("supplier_sku");
create index if not exists "idx_products_created_date" on public."products" ("created_date");
create index if not exists "idx_orders_customer_email" on public."orders" ("customer_email");
create index if not exists "idx_orders_status" on public."orders" ("status");
create index if not exists "idx_orders_payment_status" on public."orders" ("payment_status");
create index if not exists "idx_orders_stripe_session_id" on public."orders" ("stripe_session_id");
create index if not exists "idx_orders_created_date" on public."orders" ("created_date");
create index if not exists "idx_quote_requests_email" on public."quote_requests" ("email");
create index if not exists "idx_quote_requests_status" on public."quote_requests" ("status");
create index if not exists "idx_quote_requests_created_date" on public."quote_requests" ("created_date");
create index if not exists "idx_contact_messages_email" on public."contact_messages" ("email");
create index if not exists "idx_contact_messages_status" on public."contact_messages" ("status");
create index if not exists "idx_contact_messages_created_date" on public."contact_messages" ("created_date");
create index if not exists "idx_newsletter_subscribers_email" on public."newsletter_subscribers" ("email");
create index if not exists "idx_newsletter_subscribers_is_active" on public."newsletter_subscribers" ("is_active");
create index if not exists "idx_garment_catalog_items_sku" on public."garment_catalog_items" ("sku");
create index if not exists "idx_garment_catalog_items_brand" on public."garment_catalog_items" ("brand");
create index if not exists "idx_garment_catalog_items_style_number" on public."garment_catalog_items" ("style_number");
create index if not exists "idx_garment_catalog_items_status" on public."garment_catalog_items" ("status");
create index if not exists "idx_ss_catalog_items_sku" on public."ss_catalog_items" ("sku");
create index if not exists "idx_ss_catalog_items_brand" on public."ss_catalog_items" ("brand");
create index if not exists "idx_ss_catalog_items_style_number" on public."ss_catalog_items" ("style_number");
create index if not exists "idx_ss_catalog_items_catalog_status" on public."ss_catalog_items" ("catalog_status");
create index if not exists "idx_ss_catalog_items_curated_status" on public."ss_catalog_items" ("curated_status");
create index if not exists "idx_ss_import_staging_import_session_id" on public."ss_import_staging" ("import_session_id");
create index if not exists "idx_ss_import_staging_row_status" on public."ss_import_staging" ("row_status");
create index if not exists "idx_ss_import_staging_sku" on public."ss_import_staging" ("sku");
create index if not exists "idx_vendors_name" on public."vendors" ("name");
create index if not exists "idx_vendors_is_active" on public."vendors" ("is_active");
create index if not exists "idx_vendor_orders_customer_order_id" on public."vendor_orders" ("customer_order_id");
create index if not exists "idx_vendor_orders_vendor_id" on public."vendor_orders" ("vendor_id");
create index if not exists "idx_vendor_orders_status" on public."vendor_orders" ("status");
create index if not exists "idx_vendor_order_drafts_customer_order_id" on public."vendor_order_drafts" ("customer_order_id");
create index if not exists "idx_vendor_order_drafts_vendor_status" on public."vendor_order_drafts" ("vendor_status");
create index if not exists "idx_vendor_pricing_vendor_id" on public."vendor_pricing" ("vendor_id");
create index if not exists "idx_vendor_pricing_is_active" on public."vendor_pricing" ("is_active");
create index if not exists "idx_customer_notifications_order_id" on public."customer_notifications" ("order_id");
create index if not exists "idx_customer_notifications_customer_email" on public."customer_notifications" ("customer_email");
create index if not exists "idx_customer_notifications_sent_status" on public."customer_notifications" ("sent_status");
create unique index if not exists idx_newsletter_subscribers_email_lower
on public.newsletter_subscribers (lower(email));

alter table public.profiles enable row level security;
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated
using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles for all to authenticated
using (public.is_admin()) with check (public.is_admin());

alter table public."carts" enable row level security;
drop policy if exists "owner_select_carts" on public."carts";
create policy "owner_select_carts" on public."carts"
for select to authenticated using (owner_user_id = auth.uid());
drop policy if exists "owner_insert_carts" on public."carts";
create policy "owner_insert_carts" on public."carts"
for insert to authenticated with check (owner_user_id = auth.uid());
drop policy if exists "owner_update_carts" on public."carts";
create policy "owner_update_carts" on public."carts"
for update to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
drop policy if exists "owner_delete_carts" on public."carts";
create policy "owner_delete_carts" on public."carts"
for delete to authenticated using (owner_user_id = auth.uid());
drop policy if exists "admin_all_carts" on public."carts";
create policy "admin_all_carts" on public."carts"
for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public."contact_messages" enable row level security;
drop policy if exists "admin_all_contact_messages" on public."contact_messages";
create policy "admin_all_contact_messages" on public."contact_messages"
for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public."customer_notifications" enable row level security;
drop policy if exists "admin_all_customer_notifications" on public."customer_notifications";
create policy "admin_all_customer_notifications" on public."customer_notifications"
for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public."garment_catalog_items" enable row level security;
drop policy if exists "admin_all_garment_catalog_items" on public."garment_catalog_items";
create policy "admin_all_garment_catalog_items" on public."garment_catalog_items"
for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public."import_batches" enable row level security;
drop policy if exists "admin_all_import_batches" on public."import_batches";
create policy "admin_all_import_batches" on public."import_batches"
for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public."newsletter_subscribers" enable row level security;
drop policy if exists "admin_all_newsletter_subscribers" on public."newsletter_subscribers";
create policy "admin_all_newsletter_subscribers" on public."newsletter_subscribers"
for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public."orders" enable row level security;
drop policy if exists "admin_all_orders" on public."orders";
create policy "admin_all_orders" on public."orders"
for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public."order_status_history" enable row level security;
drop policy if exists "admin_all_order_status_history" on public."order_status_history";
create policy "admin_all_order_status_history" on public."order_status_history"
for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public."payment_fee_settings" enable row level security;
drop policy if exists "admin_all_payment_fee_settings" on public."payment_fee_settings";
create policy "admin_all_payment_fee_settings" on public."payment_fee_settings"
for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public."payment_settings" enable row level security;
drop policy if exists "admin_all_payment_settings" on public."payment_settings";
create policy "admin_all_payment_settings" on public."payment_settings"
for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public."products" enable row level security;
drop policy if exists "admin_all_products" on public."products";
create policy "admin_all_products" on public."products"
for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public."quotes" enable row level security;
drop policy if exists "admin_all_quotes" on public."quotes";
create policy "admin_all_quotes" on public."quotes"
for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public."quote_requests" enable row level security;
drop policy if exists "admin_all_quote_requests" on public."quote_requests";
create policy "admin_all_quote_requests" on public."quote_requests"
for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public."reviews" enable row level security;
drop policy if exists "admin_all_reviews" on public."reviews";
create policy "admin_all_reviews" on public."reviews"
for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public."ss_catalog_items" enable row level security;
drop policy if exists "admin_all_ss_catalog_items" on public."ss_catalog_items";
create policy "admin_all_ss_catalog_items" on public."ss_catalog_items"
for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public."ss_import_staging" enable row level security;
drop policy if exists "admin_all_ss_import_staging" on public."ss_import_staging";
create policy "admin_all_ss_import_staging" on public."ss_import_staging"
for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public."ss_pricing_rules" enable row level security;
drop policy if exists "admin_all_ss_pricing_rules" on public."ss_pricing_rules";
create policy "admin_all_ss_pricing_rules" on public."ss_pricing_rules"
for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public."vendors" enable row level security;
drop policy if exists "admin_all_vendors" on public."vendors";
create policy "admin_all_vendors" on public."vendors"
for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public."vendor_orders" enable row level security;
drop policy if exists "admin_all_vendor_orders" on public."vendor_orders";
create policy "admin_all_vendor_orders" on public."vendor_orders"
for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public."vendor_order_drafts" enable row level security;
drop policy if exists "admin_all_vendor_order_drafts" on public."vendor_order_drafts";
create policy "admin_all_vendor_order_drafts" on public."vendor_order_drafts"
for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public."vendor_pricing" enable row level security;
drop policy if exists "admin_all_vendor_pricing" on public."vendor_pricing";
create policy "admin_all_vendor_pricing" on public."vendor_pricing"
for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public."wishlists" enable row level security;
drop policy if exists "owner_select_wishlists" on public."wishlists";
create policy "owner_select_wishlists" on public."wishlists"
for select to authenticated using (owner_user_id = auth.uid());
drop policy if exists "owner_insert_wishlists" on public."wishlists";
create policy "owner_insert_wishlists" on public."wishlists"
for insert to authenticated with check (owner_user_id = auth.uid());
drop policy if exists "owner_update_wishlists" on public."wishlists";
create policy "owner_update_wishlists" on public."wishlists"
for update to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
drop policy if exists "owner_delete_wishlists" on public."wishlists";
create policy "owner_delete_wishlists" on public."wishlists"
for delete to authenticated using (owner_user_id = auth.uid());
drop policy if exists "admin_all_wishlists" on public."wishlists";
create policy "admin_all_wishlists" on public."wishlists"
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace view public.storefront_products
with (security_barrier = true) as
select id, name, description, price, sale_price, product_type, product_subtype,
       design_type, visibility, image_url, mockup_images, stock, category, categories,
       tags, is_featured, is_best_seller, available_sizes, available_colors, size_prices,
       care_instructions, shipping_note, is_active, created_date, updated_date
from public.products
where visibility = 'public' and is_active is true;

create or replace view public.storefront_reviews
with (security_barrier = true) as
select id, reviewer_name, rating, review_text, product_name, created_date
from public.reviews
where is_active is true;

create or replace view public.customer_orders
with (security_barrier = true) as
select id, customer_email, customer_name, customer_phone, business_name, preferred_contact,
       order_items, total_amount, amount_paid, balance_due, status, payment_status,
       payment_method, payment_date, fulfillment_status, has_physical_items,
       shipping_address, delivery_notes, notes, tracking_number, tracking_carrier,
       tracking_url, shipped_date, delivery_estimate, created_date, updated_date
from public.orders
where owner_user_id = auth.uid()
   or lower(customer_email) = lower(auth.jwt() ->> 'email');

create or replace view public.customer_visible_notifications
with (security_barrier = true) as
select id, order_id, order_number, notification_type, customer_name, customer_email,
       subject, customer_message, related_status, sent_status, sent_date, created_date
from public.customer_notifications
where customer_visible is true
  and lower(customer_email) = lower(auth.jwt() ->> 'email');

revoke all on table public."carts", public."contact_messages", public."customer_notifications", public."garment_catalog_items", public."import_batches", public."newsletter_subscribers", public."orders", public."order_status_history", public."payment_fee_settings", public."payment_settings", public."products", public."quotes", public."quote_requests", public."reviews", public."ss_catalog_items", public."ss_import_staging", public."ss_pricing_rules", public."vendors", public."vendor_orders", public."vendor_order_drafts", public."vendor_pricing", public."wishlists" from anon, authenticated;
grant all on table public."carts", public."contact_messages", public."customer_notifications", public."garment_catalog_items", public."import_batches", public."newsletter_subscribers", public."orders", public."order_status_history", public."payment_fee_settings", public."payment_settings", public."products", public."quotes", public."quote_requests", public."reviews", public."ss_catalog_items", public."ss_import_staging", public."ss_pricing_rules", public."vendors", public."vendor_orders", public."vendor_order_drafts", public."vendor_pricing", public."wishlists" to authenticated;
grant all on public.profiles to authenticated;
revoke all on public.storefront_products, public.storefront_reviews, public.customer_orders, public.customer_visible_notifications from public;
grant select on public.storefront_products, public.storefront_reviews to anon, authenticated;
grant select on public.customer_orders, public.customer_visible_notifications to authenticated;

commit;
