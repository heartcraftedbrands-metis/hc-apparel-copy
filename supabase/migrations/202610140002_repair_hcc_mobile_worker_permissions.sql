-- Reuse the existing Heart Command Center service connection for the private
-- mobile operations bridge. RLS bypass alone does not grant table privileges,
-- so keep the worker's access explicit and limited to its reconciliation and
-- reporting responsibilities.

begin;

grant usage on schema public to service_role;

grant select on public.ops_businesses,
  public.ops_business_memberships,
  public.ops_vehicles,
  public.ops_vehicle_year_odometer,
  public.ops_mileage_rates,
  public.ops_mileage_trips,
  public.ops_mileage_points,
  public.ops_mileage_segments,
  public.ops_mileage_trip_audit,
  public.ops_mobile_account_setup_report to service_role;

grant select, insert, update on public.ops_shared_records to service_role;
grant select, insert, update on public.ops_invoice_number_registry to service_role;
grant select, update on public.ops_invoice_number_state to service_role;
grant select, update on public.ops_action_queue to service_role;
grant select, insert, update on public.ops_notifications to service_role;

commit;
