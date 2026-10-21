create table if not exists public.dtf_transfer_orders (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  source text not null default 'customer' check (source in ('customer','internal')),
  status text not null default 'draft' check (status in ('draft','ready_to_submit','submitted','in_production','shipped','delivered')),
  payment_status text not null default 'unpaid',
  order_reference text not null unique,
  width_inches numeric(8,2) not null check (width_inches > 0),
  height_inches numeric(8,2) not null check (height_inches > 0),
  quantity integer not null check (quantity > 0),
  production_options jsonb not null default '{}'::jsonb,
  customer_notes text,
  artwork_storage_path text not null,
  artwork_original_name text not null,
  artwork_mime_type text,
  artwork_sha256 text not null,
  artwork_warnings jsonb not null default '[]'::jsonb,
  shipping_address jsonb,
  customer_total numeric(12,2),
  supplier_cost numeric(12,2),
  supplier_shipping numeric(12,2),
  supplier_total numeric(12,2),
  supplier_order_number text,
  supplier_tracking jsonb,
  supplier_submitted_at timestamptz,
  owner_approved_at timestamptz,
  owner_approved_by uuid references auth.users(id) on delete set null,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.dtf_transfer_submission_events (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.dtf_transfer_orders(id) on delete restrict,
 event_type text not null, confirmed boolean not null default false, provider_reference text, details jsonb not null default '{}'::jsonb,
 created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now()
);
alter table public.dtf_transfer_orders enable row level security;
alter table public.dtf_transfer_submission_events enable row level security;
create policy "dtf owners read own" on public.dtf_transfer_orders for select to authenticated using (owner_user_id=auth.uid() or public.is_admin());
create policy "dtf owners create own" on public.dtf_transfer_orders for insert to authenticated with check (owner_user_id=auth.uid());
create policy "dtf admins manage" on public.dtf_transfer_orders for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "dtf admins read events" on public.dtf_transfer_submission_events for select to authenticated using (public.is_admin());
create policy "dtf admins write events" on public.dtf_transfer_submission_events for insert to authenticated with check (public.is_admin());
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('dtf-artwork','dtf-artwork',false,104857600,array['image/png','image/jpeg','application/pdf','image/tiff','application/postscript']) on conflict (id) do nothing;
create policy "dtf artwork owner upload" on storage.objects for insert to authenticated with check (bucket_id='dtf-artwork' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "dtf artwork owner read" on storage.objects for select to authenticated using (bucket_id='dtf-artwork' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()));
