alter table public.ss_launch_batches
drop constraint if exists ss_launch_batches_status_check;

alter table public.ss_launch_batches
add constraint ss_launch_batches_status_check
check (status in (
  'private_draft',
  'qa_passed',
  'approved',
  'suspended',
  'superseded',
  'published'
));

alter table public.ss_launch_batches
add column if not exists approved_by uuid references auth.users(id) on delete set null,
add column if not exists approved_at timestamptz,
add column if not exists suspended_by uuid references auth.users(id) on delete set null,
add column if not exists suspended_at timestamptz;

create table if not exists public.ss_launch_batch_approval_logs (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  batch_id text not null references public.ss_launch_batches(id) on delete restrict,
  approved_by uuid not null references auth.users(id) on delete restrict,
  approved_at timestamptz not null default now(),
  products_published_count integer not null,
  sku_variants_count integer not null,
  qa_snapshot jsonb not null
);

create index if not exists idx_ss_launch_batch_approval_logs_batch
on public.ss_launch_batch_approval_logs(batch_id, approved_at desc);

create table if not exists public.ss_launch_batch_suspension_logs (
  id text primary key default gen_random_uuid()::text,
  created_date timestamptz not null default now(),
  batch_id text not null references public.ss_launch_batches(id) on delete restrict,
  suspended_by uuid not null references auth.users(id) on delete restrict,
  suspended_at timestamptz not null default now(),
  products_suspended_count integer not null,
  sku_variants_count integer not null
);

create index if not exists idx_ss_launch_batch_suspension_logs_batch
on public.ss_launch_batch_suspension_logs(batch_id, suspended_at desc);

alter table public.ss_launch_batch_approval_logs enable row level security;
alter table public.ss_launch_batch_suspension_logs enable row level security;

drop policy if exists admin_select_ss_launch_batch_approval_logs
on public.ss_launch_batch_approval_logs;
create policy admin_select_ss_launch_batch_approval_logs
on public.ss_launch_batch_approval_logs
for select to authenticated
using (public.is_admin());

drop policy if exists admin_select_ss_launch_batch_suspension_logs
on public.ss_launch_batch_suspension_logs;
create policy admin_select_ss_launch_batch_suspension_logs
on public.ss_launch_batch_suspension_logs
for select to authenticated
using (public.is_admin());

revoke all on public.ss_launch_batch_approval_logs,
  public.ss_launch_batch_suspension_logs
from public, anon, authenticated;

grant select on public.ss_launch_batch_approval_logs,
  public.ss_launch_batch_suspension_logs
to authenticated;

create or replace function public.approve_ss_private_launch_batch(
  p_batch_id text
)
returns table (
  batch_id text,
  batch_status text,
  approved_by uuid,
  approved_at timestamptz,
  products_published_count bigint,
  sku_variants_count bigint,
  already_approved boolean
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_batch public.ss_launch_batches%rowtype;
  v_qa jsonb;
  v_products bigint;
  v_variants bigint;
  v_storefront_products bigint;
  v_approved_at timestamptz;
  v_existing_log public.ss_launch_batch_approval_logs%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  select b.*
  into v_batch
  from public.ss_launch_batches b
  where b.id = p_batch_id
  for update;

  if not found then
    raise exception 'Private S&S launch batch not found'
      using errcode = 'P0002';
  end if;

  if v_batch.status = 'approved' then
    select log.*
    into v_existing_log
    from public.ss_launch_batch_approval_logs log
    where log.batch_id = v_batch.id
    order by log.approved_at desc
    limit 1;

    return query
    select
      v_batch.id,
      v_batch.status,
      v_existing_log.approved_by,
      v_existing_log.approved_at,
      v_existing_log.products_published_count::bigint,
      v_existing_log.sku_variants_count::bigint,
      true;
    return;
  end if;

  if v_batch.status not in ('private_draft', 'qa_passed', 'suspended') then
    raise exception 'Batch status % cannot be approved', v_batch.status
      using errcode = 'P0001';
  end if;

  v_qa := public.get_ss_private_launch_qa(v_batch.id);

  if coalesce((v_qa ->> 'all_passed')::boolean, false) is false then
    raise exception 'The live private batch QA report no longer passes. Nothing was published.'
      using errcode = 'P0001';
  end if;

  if coalesce((v_qa #>> '{summary,restricted_variant_count}')::bigint, 0) <> 0
    or coalesce((v_qa #>> '{summary,not_publish_eligible_variant_count}')::bigint, 0) <> 0 then
    raise exception 'Restricted or non-eligible SKUs are present. Nothing was published.'
      using errcode = 'P0001';
  end if;

  if coalesce((v_qa #>> '{summary,missing_image_count}')::bigint, 0) <> 0 then
    raise exception 'One or more batch products are missing images. Nothing was published.'
      using errcode = 'P0001';
  end if;

  if coalesce((v_qa #>> '{summary,storefront_exposed_count}')::bigint, 0) <> 0 then
    raise exception 'One or more batch products were already public before approval. Nothing was published.'
      using errcode = 'P0001';
  end if;

  v_products := coalesce((v_qa #>> '{summary,product_count}')::bigint, 0);
  v_variants := coalesce((v_qa #>> '{summary,variant_count}')::bigint, 0);

  if v_products <> v_batch.product_count or v_products <= 0 then
    raise exception 'Batch product count changed. Nothing was published.'
      using errcode = 'P0001';
  end if;

  if v_variants <> v_batch.variant_count or v_variants <= 0 then
    raise exception 'Batch SKU variant count changed. Nothing was published.'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.ss_launch_batch_items item
    where item.batch_id = v_batch.id
      and item.qa_status = 'failed'
  ) then
    raise exception 'One or more batch products are marked as failed QA. Nothing was published.'
      using errcode = 'P0001';
  end if;

  update public.ss_launch_batch_items item
  set qa_status = 'passed'
  where item.batch_id = v_batch.id
    and item.qa_status <> 'failed';

  update public.products product
  set
    visibility = 'public',
    is_active = true,
    is_sample = false,
    internal_notes = coalesce(product.internal_notes, '')
      || case when nullif(product.internal_notes, '') is null then '' else E'\n' end
      || 'Approved for public shop through private batch '
      || v_batch.batch_label || '.'
  from public.ss_launch_batch_items item
  where item.batch_id = v_batch.id
    and item.product_id = product.id
    and item.qa_status = 'passed';

  get diagnostics v_storefront_products = row_count;

  if v_storefront_products <> v_products then
    raise exception 'Published product count did not match the QA-passed batch. Nothing was published.'
      using errcode = 'P0001';
  end if;

  select count(*)::bigint
  into v_storefront_products
  from public.storefront_products storefront
  join public.ss_launch_batch_items item
    on item.product_id = storefront.id
  where item.batch_id = v_batch.id;

  if v_storefront_products <> v_products then
    raise exception 'Public storefront verification failed. Nothing was published.'
      using errcode = 'P0001';
  end if;

  v_approved_at := now();

  update public.ss_launch_batches batch
  set
    status = 'approved',
    approved_by = auth.uid(),
    approved_at = v_approved_at,
    suspended_by = null,
    suspended_at = null
  where batch.id = v_batch.id;

  insert into public.ss_launch_batch_approval_logs (
    batch_id,
    approved_by,
    approved_at,
    products_published_count,
    sku_variants_count,
    qa_snapshot
  )
  values (
    v_batch.id,
    auth.uid(),
    v_approved_at,
    v_products,
    v_variants,
    v_qa
  );

  return query
  select
    v_batch.id,
    'approved'::text,
    auth.uid(),
    v_approved_at,
    v_products,
    v_variants,
    false;
end;
$$;

revoke all on function public.approve_ss_private_launch_batch(text)
from public, anon;
grant execute
on function public.approve_ss_private_launch_batch(text)
to authenticated;

create or replace function public.suspend_ss_public_launch_batch(
  p_batch_id text
)
returns table (
  batch_id text,
  batch_status text,
  suspended_by uuid,
  suspended_at timestamptz,
  products_suspended_count bigint,
  sku_variants_count bigint,
  already_suspended boolean
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_batch public.ss_launch_batches%rowtype;
  v_products bigint;
  v_variants bigint;
  v_storefront_products bigint;
  v_suspended_at timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  select b.*
  into v_batch
  from public.ss_launch_batches b
  where b.id = p_batch_id
  for update;

  if not found then
    raise exception 'S&S launch batch not found'
      using errcode = 'P0002';
  end if;

  if v_batch.status = 'suspended' then
    return query
    select
      v_batch.id,
      v_batch.status,
      v_batch.suspended_by,
      v_batch.suspended_at,
      v_batch.product_count::bigint,
      v_batch.variant_count::bigint,
      true;
    return;
  end if;

  if v_batch.status <> 'approved' then
    raise exception 'Only an approved public batch can be suspended'
      using errcode = 'P0001';
  end if;

  select
    count(*)::bigint,
    coalesce(sum(item.variant_count), 0)::bigint
  into v_products, v_variants
  from public.ss_launch_batch_items item
  where item.batch_id = v_batch.id;

  update public.products product
  set
    visibility = 'draft',
    is_active = false,
    is_sample = true,
    internal_notes = coalesce(product.internal_notes, '')
      || case when nullif(product.internal_notes, '') is null then '' else E'\n' end
      || 'Suspended from public shop for batch '
      || v_batch.batch_label || '.'
  from public.ss_launch_batch_items item
  where item.batch_id = v_batch.id
    and item.product_id = product.id;

  get diagnostics v_storefront_products = row_count;

  if v_storefront_products <> v_products then
    raise exception 'Suspended product count did not match the approved batch. Nothing was changed.'
      using errcode = 'P0001';
  end if;

  select count(*)::bigint
  into v_storefront_products
  from public.storefront_products storefront
  join public.ss_launch_batch_items item
    on item.product_id = storefront.id
  where item.batch_id = v_batch.id;

  if v_storefront_products <> 0 then
    raise exception 'One or more batch products remain public. Suspension was rolled back.'
      using errcode = 'P0001';
  end if;

  v_suspended_at := now();

  update public.ss_launch_batches batch
  set
    status = 'suspended',
    suspended_by = auth.uid(),
    suspended_at = v_suspended_at
  where batch.id = v_batch.id;

  insert into public.ss_launch_batch_suspension_logs (
    batch_id,
    suspended_by,
    suspended_at,
    products_suspended_count,
    sku_variants_count
  )
  values (
    v_batch.id,
    auth.uid(),
    v_suspended_at,
    v_products,
    v_variants
  );

  return query
  select
    v_batch.id,
    'suspended'::text,
    auth.uid(),
    v_suspended_at,
    v_products,
    v_variants,
    false;
end;
$$;

revoke all on function public.suspend_ss_public_launch_batch(text)
from public, anon;
grant execute
on function public.suspend_ss_public_launch_batch(text)
to authenticated;
