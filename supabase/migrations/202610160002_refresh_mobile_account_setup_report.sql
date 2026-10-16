begin;

create or replace view public.ops_mobile_account_setup_report
with (security_invoker = true)
as
select
  expected.display_name,
  expected.accepted_names,
  count(distinct profile.id)::integer as matching_profile_count,
  min(profile.id::text) as matched_user_id,
  min(profile.email) as matched_email,
  min(profile.role) as existing_profile_role,
  case
    when count(distinct profile.id) = 0 then 'missing_existing_account'
    when count(distinct profile.id) > 1 then 'ambiguous_existing_accounts'
    when count(distinct membership.business_id) = 2
      and coalesce(bool_and(membership.access_role = expected.access_role), false)
      then 'ready'
    else 'membership_missing'
  end as setup_status
from (values
  ('King Terik', array['king terik']::text[], 'heartfamilyco@gmail.com', 'owner'),
  ('YHO', array['yho','yho / mario','mario']::text[], 'indy.j5557@gmail.com', 'operations_manager')
) expected(display_name, accepted_names, login_email, access_role)
left join public.profiles profile
  on lower(trim(profile.email)) = expected.login_email
left join public.ops_business_memberships membership
  on membership.user_id = profile.id
  and membership.business_id in ('hc-apparel', 'heart-command-center')
group by expected.display_name, expected.accepted_names, expected.login_email, expected.access_role;

commit;
