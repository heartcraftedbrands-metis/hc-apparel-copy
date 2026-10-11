begin;

-- Product-specific measurement data is cached separately from inventory and
-- sellable variants. Supplier attribution and raw source rows stay private.
create table if not exists public.product_size_guides (
  product_id text primary key references public.products(id) on delete cascade,
  supplier_style_id bigint,
  manufacturer_style text,
  brand text,
  measurement_type text not null default 'garment'
    check (measurement_type in ('garment', 'body', 'fit_range', 'unknown')),
  default_unit text not null default 'in'
    check (default_unit in ('in', 'cm', 'text')),
  sizes jsonb not null default '[]'::jsonb,
  measurements jsonb not null default '[]'::jsonb,
  measuring_instructions jsonb not null default '[]'::jsonb,
  fit_notes text,
  customer_note text,
  status text not null default 'unavailable'
    check (status in ('verified', 'unavailable', 'review_required')),
  source_provider text,
  source_endpoint text,
  source_reference text,
  source_retrieved_at timestamptz,
  source_hash text,
  raw_source jsonb not null default '[]'::jsonb,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists product_size_guides_status_idx
  on public.product_size_guides(status);
create index if not exists product_size_guides_style_idx
  on public.product_size_guides(supplier_style_id, manufacturer_style);

drop trigger if exists product_size_guides_set_updated_at on public.product_size_guides;
create trigger product_size_guides_set_updated_at
before update on public.product_size_guides
for each row execute function public.set_profile_updated_at();

alter table public.product_size_guides enable row level security;
drop policy if exists admin_all_product_size_guides on public.product_size_guides;
create policy admin_all_product_size_guides
on public.product_size_guides for all to authenticated
using (public.is_admin()) with check (public.is_admin());

revoke all on public.product_size_guides from public;

-- The customer view deliberately omits supplier names, endpoints, raw rows,
-- retrieval hashes, and admin diagnostics.
create or replace view public.storefront_product_size_guides
with (security_barrier = true) as
select
  guide.product_id,
  guide.manufacturer_style,
  guide.brand,
  guide.measurement_type,
  guide.default_unit,
  guide.sizes,
  guide.measurements,
  guide.measuring_instructions,
  guide.fit_notes,
  guide.customer_note,
  guide.status,
  guide.updated_at
from public.product_size_guides guide
join public.products product on product.id = guide.product_id
where product.product_type = 'physical'
  and product.visibility = 'public'
  and product.is_active is true;

revoke all on public.storefront_product_size_guides from public;
grant select on public.storefront_product_size_guides to anon, authenticated;

-- New or remapped physical products are queued for the next authenticated
-- catalog measurement refresh. This is intentionally independent of stock.
create table if not exists public.product_size_guide_sync_queue (
  product_id text primary key references public.products(id) on delete cascade,
  requested_at timestamptz not null default now(),
  reason text not null default 'catalog_change',
  attempts integer not null default 0,
  last_attempt_at timestamptz,
  last_error text
);

alter table public.product_size_guide_sync_queue enable row level security;
drop policy if exists admin_all_product_size_guide_sync_queue
  on public.product_size_guide_sync_queue;
create policy admin_all_product_size_guide_sync_queue
on public.product_size_guide_sync_queue for all to authenticated
using (public.is_admin()) with check (public.is_admin());
revoke all on public.product_size_guide_sync_queue from public;

create or replace function public.queue_product_size_guide_refresh()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.product_type = 'physical' then
    insert into public.product_size_guide_sync_queue(product_id, requested_at, reason)
    values (new.id, now(), case when tg_op = 'INSERT' then 'product_created' else 'catalog_mapping_changed' end)
    on conflict (product_id) do update set
      requested_at = excluded.requested_at,
      reason = excluded.reason,
      last_error = null;
  else
    delete from public.product_size_guide_sync_queue where product_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.queue_product_size_guide_refresh() from public;

drop trigger if exists products_queue_size_guide_refresh on public.products;
create trigger products_queue_size_guide_refresh
after insert or update of product_type, visibility, is_active, vendor_source,
  supplier_sku, brand, style_number
on public.products
for each row execute function public.queue_product_size_guide_refresh();

insert into public.product_size_guide_sync_queue(product_id, requested_at, reason)
select product.id, now(), 'initial_catalog_audit'
from public.products product
where product.product_type = 'physical'
  and product.visibility = 'public'
  and product.is_active is true
on conflict (product_id) do nothing;

create or replace function public.admin_product_size_guide_audit()
returns table (
  product_id text,
  product_name text,
  brand text,
  manufacturer_style text,
  guide_status text,
  measurement_type text,
  size_count integer,
  measurement_count integer,
  source_reference text,
  source_retrieved_at timestamptz,
  issue text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required';
  end if;

  return query
  select
    product.id,
    product.name,
    product.brand,
    coalesce(guide.manufacturer_style, product.style_number, product.supplier_sku),
    coalesce(guide.status, 'unavailable'),
    coalesce(guide.measurement_type, 'unknown'),
    case when jsonb_typeof(guide.sizes) = 'array' then jsonb_array_length(guide.sizes) else 0 end,
    case when jsonb_typeof(guide.measurements) = 'array' then jsonb_array_length(guide.measurements) else 0 end,
    guide.source_reference,
    guide.source_retrieved_at,
    coalesce(
      guide.admin_note,
      case when guide.product_id is null then 'Not yet retrieved' end,
      case when guide.status <> 'verified' then 'Verified measurements are unavailable' end
    )
  from public.products product
  left join public.product_size_guides guide on guide.product_id = product.id
  where product.product_type = 'physical'
    and product.visibility = 'public'
    and product.is_active is true
  order by
    case when guide.status = 'verified' then 1 else 0 end,
    product.brand nulls last,
    product.name;
end;
$$;

revoke all on function public.admin_product_size_guide_audit() from public;
grant execute on function public.admin_product_size_guide_audit() to authenticated;

commit;
