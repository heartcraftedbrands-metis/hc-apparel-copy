begin;

-- This project does not auto-expose newly created tables. The Design Studio
-- edge function validates the signed-in owner/admin before using its
-- server-side client, so grant that service only the table operations it uses.
grant select, insert, update on public.design_documents to service_role;
grant select, insert, update on public.design_assets to service_role;
grant select, insert on public.design_versions to service_role;
grant select, insert on public.order_design_snapshots to service_role;

grant select, insert, update, delete on public.design_mockup_mappings to service_role;
grant select, insert, update, delete on public.design_print_areas to service_role;
grant select, insert, update, delete on public.design_pricing_config to service_role;
grant select, insert, update, delete on public.design_provider_mappings to service_role;
grant select, insert, update, delete on public.design_production_jobs to service_role;
grant select, update on public.design_studio_settings to service_role;
grant select, update on public.printify_integration_settings to service_role;

commit;
