create table if not exists public.ss_catalog_workflow_status (
  id boolean primary key default true check (id),
  product_loading_paused boolean not null default true,
  pause_message text not null default 'Product loading is paused. Current catalog is stable.',
  api_read_checks_enabled boolean not null default true,
  max_batch_sequence integer not null default 3 check (max_batch_sequence >= 0),
  paused_by uuid references auth.users(id) on delete set null,
  paused_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ss_catalog_workflow_status enable row level security;

drop policy if exists admin_select_ss_catalog_workflow_status
on public.ss_catalog_workflow_status;
create policy admin_select_ss_catalog_workflow_status
on public.ss_catalog_workflow_status
for select to authenticated
using (public.is_admin());

revoke all on public.ss_catalog_workflow_status
from public, anon, authenticated;
grant select on public.ss_catalog_workflow_status
to authenticated;

insert into public.ss_catalog_workflow_status (
  id,
  product_loading_paused,
  pause_message,
  api_read_checks_enabled,
  max_batch_sequence,
  paused_by,
  paused_at,
  updated_at
)
values (
  true,
  true,
  'Product loading is paused. Current catalog is stable.',
  true,
  3,
  (
    select profile.id
    from public.profiles profile
    where profile.role = 'admin'
    order by profile.created_at
    limit 1
  ),
  now(),
  now()
)
on conflict (id) do update
set
  product_loading_paused = excluded.product_loading_paused,
  pause_message = excluded.pause_message,
  api_read_checks_enabled = excluded.api_read_checks_enabled,
  max_batch_sequence = excluded.max_batch_sequence,
  paused_by = excluded.paused_by,
  paused_at = excluded.paused_at,
  updated_at = excluded.updated_at;

comment on table public.ss_catalog_workflow_status is
  'Admin-only control plane for S&S product loading. API pricing and inventory checks remain available while batch creation is paused.';

alter function public.create_ss_next_private_launch_batch(text, integer)
rename to create_ss_next_private_launch_batch_unpaused;

revoke all
on function public.create_ss_next_private_launch_batch_unpaused(text, integer)
from public, anon, authenticated;

create function public.create_ss_next_private_launch_batch(
  p_rule_version_id text,
  p_style_limit integer default 25
)
returns table (
  batch_id text,
  batch_label text,
  batch_sequence integer,
  product_count bigint,
  variant_count bigint,
  reused_product_count bigint,
  already_created boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  if coalesce((
    select workflow.product_loading_paused
    from public.ss_catalog_workflow_status workflow
    where workflow.id
  ), true) then
    raise exception 'Product loading is paused. Current catalog is stable.'
      using errcode = '55000';
  end if;

  return query
  select
    result.batch_id,
    result.batch_label,
    result.batch_sequence,
    result.product_count,
    result.variant_count,
    result.reused_product_count,
    result.already_created
  from public.create_ss_next_private_launch_batch_unpaused(
    p_rule_version_id,
    p_style_limit
  ) result;
end;
$$;

revoke all
on function public.create_ss_next_private_launch_batch(text, integer)
from public, anon;
grant execute
on function public.create_ss_next_private_launch_batch(text, integer)
to authenticated;

alter function public.create_ss_next_hc_private_launch_batch(text, integer)
rename to create_ss_next_hc_private_launch_batch_unpaused;

revoke all
on function public.create_ss_next_hc_private_launch_batch_unpaused(text, integer)
from public, anon, authenticated;

create function public.create_ss_next_hc_private_launch_batch(
  p_rule_version_id text,
  p_style_limit integer default 25
)
returns table (
  batch_id text,
  batch_label text,
  batch_sequence integer,
  product_count bigint,
  variant_count bigint,
  reused_product_count bigint,
  already_created boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  if coalesce((
    select workflow.product_loading_paused
    from public.ss_catalog_workflow_status workflow
    where workflow.id
  ), true) then
    raise exception 'Product loading is paused. Current catalog is stable.'
      using errcode = '55000';
  end if;

  return query
  select
    result.batch_id,
    result.batch_label,
    result.batch_sequence,
    result.product_count,
    result.variant_count,
    result.reused_product_count,
    result.already_created
  from public.create_ss_next_hc_private_launch_batch_unpaused(
    p_rule_version_id,
    p_style_limit
  ) result;
end;
$$;

revoke all
on function public.create_ss_next_hc_private_launch_batch(text, integer)
from public, anon;
grant execute
on function public.create_ss_next_hc_private_launch_batch(text, integer)
to authenticated;

do $$
declare
  v_admin_id uuid;
  v_rule_id text;
  v_public_before bigint;
  v_public_after bigint;
  v_batch_four_count bigint;
  v_standard_guard_passed boolean := false;
  v_hc_guard_passed boolean := false;
begin
  select profile.id
  into v_admin_id
  from public.profiles profile
  where profile.role = 'admin'
  order by profile.created_at
  limit 1;

  if v_admin_id is null then
    raise exception 'No administrator profile is available to verify the S&S pause';
  end if;

  perform set_config('request.jwt.claim.sub', v_admin_id::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_admin_id,
      'role', 'authenticated'
    )::text,
    true
  );

  select rule.id
  into v_rule_id
  from public.ss_pricing_rule_versions rule
  where rule.status = 'approved_private'
  order by rule.approved_at desc
  limit 1;

  if v_rule_id is null then
    raise exception 'No approved private S&S pricing rule is available';
  end if;

  select count(*) into v_public_before
  from public.storefront_products;

  begin
    perform public.create_ss_next_private_launch_batch(v_rule_id, 25);
  exception
    when sqlstate '55000' then
      v_standard_guard_passed := true;
  end;

  begin
    perform public.create_ss_next_hc_private_launch_batch(v_rule_id, 25);
  exception
    when sqlstate '55000' then
      v_hc_guard_passed := true;
  end;

  select count(*) into v_public_after
  from public.storefront_products;

  select count(*)
  into v_batch_four_count
  from public.ss_launch_batches batch
  where batch.batch_sequence > 3;

  if not v_standard_guard_passed
    or not v_hc_guard_passed
    or v_batch_four_count <> 0
    or v_public_before <> v_public_after then
    raise exception 'S&S product-loading pause verification failed';
  end if;

  raise notice 'SS_PRODUCT_LOADING_PAUSED %', jsonb_build_object(
    'message', 'Product loading is paused. Current catalog is stable.',
    'batch_creation_enabled', false,
    'api_read_checks_enabled', true,
    'maximum_batch_sequence', 3,
    'batch_four_count', v_batch_four_count,
    'public_product_count_before', v_public_before,
    'public_product_count_after', v_public_after,
    'standard_batch_guard_passed', v_standard_guard_passed,
    'hc_batch_guard_passed', v_hc_guard_passed
  );
end;
$$;
