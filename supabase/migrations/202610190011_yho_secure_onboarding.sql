begin;
create table if not exists public.ops_auth_onboarding (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  status text not null check (status in ('pending','completed','expired','cancelled')),
  expires_at timestamptz,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  onboarding_message_id text,
  onboarding_delivery_status text,
  confirmation_message_id text,
  confirmation_delivery_status text,
  operation_key text not null unique,
  last_error text,
  updated_at timestamptz not null default now()
);
alter table public.ops_auth_onboarding enable row level security;
drop policy if exists ops_auth_onboarding_admin_read on public.ops_auth_onboarding;
create policy ops_auth_onboarding_admin_read on public.ops_auth_onboarding for select to authenticated
using (public.is_admin() or user_id = auth.uid());
revoke all on public.ops_auth_onboarding from anon, authenticated;
grant select on public.ops_auth_onboarding to authenticated;
grant all on public.ops_auth_onboarding to service_role;
create table if not exists public.ops_email_delivery_ledger (
  operation_key text primary key,
  recipient text not null,
  subject text not null,
  provider text not null default 'brevo',
  provider_message_id text,
  delivery_status text not null check (delivery_status in ('sending','accepted','delivered','failed','unknown')),
  accepted_at timestamptz,
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ops_email_delivery_ledger enable row level security;
drop policy if exists ops_email_delivery_ledger_admin_read on public.ops_email_delivery_ledger;
create policy ops_email_delivery_ledger_admin_read on public.ops_email_delivery_ledger for select to authenticated using (public.is_admin());
revoke all on public.ops_email_delivery_ledger from anon, authenticated;
grant select on public.ops_email_delivery_ledger to authenticated;
grant all on public.ops_email_delivery_ledger to service_role;
create or replace function public.ops_has_permission(target_business text, capability text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select not exists (
    select 1 from public.ops_auth_onboarding onboarding
    where onboarding.user_id = auth.uid() and onboarding.status = 'pending'
  ) and exists (
    select 1 from public.ops_business_memberships membership
    where membership.business_id = target_business
      and membership.user_id = auth.uid()
      and case capability
        when 'view' then true
        when 'combined' then membership.can_view_combined
        when 'mileage' then membership.can_manage_mileage
        when 'finances' then membership.can_manage_finances
        when 'send_invoices' then membership.can_send_invoices
        when 'orders' then membership.can_manage_orders
        else false
      end
  );
$$;
drop policy if exists ops_memberships_read on public.ops_business_memberships;
create policy ops_memberships_read on public.ops_business_memberships for select to authenticated
using (
  public.is_admin() or (
    user_id = auth.uid() and not exists (
      select 1 from public.ops_auth_onboarding onboarding
      where onboarding.user_id = auth.uid() and onboarding.status = 'pending'
    )
  )
);
commit;
