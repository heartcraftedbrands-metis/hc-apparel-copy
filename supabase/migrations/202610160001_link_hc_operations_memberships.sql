begin;
-- Link only the two explicitly authorized, existing and verified accounts.
-- Abort instead of guessing if the profile/auth identity is not unique.
do $$
declare
  king_user_id uuid;
  yho_user_id uuid;
  king_source_role text;
  yho_source_role text;
begin
  select profile.id, profile.role
    into strict king_user_id, king_source_role
  from public.profiles profile
  join auth.users auth_user on auth_user.id = profile.id
  where lower(trim(profile.email)) = 'heartfamilyco@gmail.com'
    and lower(trim(auth_user.email)) = 'heartfamilyco@gmail.com'
    and auth_user.email_confirmed_at is not null;

  if king_user_id is null then
    raise exception 'Verified existing account not found for King Terik';
  end if;

  select profile.id, profile.role
    into strict yho_user_id, yho_source_role
  from public.profiles profile
  join auth.users auth_user on auth_user.id = profile.id
  where lower(trim(profile.email)) = 'indy.j5557@gmail.com'
    and lower(trim(auth_user.email)) = 'indy.j5557@gmail.com'
    and auth_user.email_confirmed_at is not null;

  if yho_user_id is null then
    raise exception 'Verified existing account not found for YHO';
  end if;

  insert into public.ops_business_memberships (
    business_id,
    user_id,
    access_role,
    source_role,
    can_view_combined,
    can_manage_mileage,
    can_manage_finances,
    can_send_invoices,
    can_manage_orders
  )
  select business.id,
    authorized.user_id,
    authorized.access_role,
    authorized.source_role,
    true,
    true,
    true,
    true,
    true
  from public.ops_businesses business
  cross join (values
    (king_user_id, 'owner'::text, king_source_role),
    (yho_user_id, 'operations_manager'::text, yho_source_role)
  ) authorized(user_id, access_role, source_role)
  where business.id in ('hc-apparel', 'heart-command-center')
  on conflict (business_id, user_id) do update set
    access_role = excluded.access_role,
    source_role = excluded.source_role,
    can_view_combined = excluded.can_view_combined,
    can_manage_mileage = excluded.can_manage_mileage,
    can_manage_finances = excluded.can_manage_finances,
    can_send_invoices = excluded.can_send_invoices,
    can_manage_orders = excluded.can_manage_orders,
    updated_at = now();
end
$$;
commit;
