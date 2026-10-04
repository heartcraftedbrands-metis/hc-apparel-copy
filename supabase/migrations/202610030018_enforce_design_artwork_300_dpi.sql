begin;

update public.design_studio_settings
set default_raster_ppi = greatest(default_raster_ppi, 300),
    updated_at = now()
where id = true;

alter table public.design_studio_settings
  alter column default_raster_ppi set default 300;

alter table public.design_studio_settings
  drop constraint if exists design_studio_settings_default_raster_ppi_check;

alter table public.design_studio_settings
  add constraint design_studio_settings_default_raster_ppi_check
  check (default_raster_ppi between 300 and 1200);

update public.design_print_areas
set min_dpi = greatest(min_dpi, 300),
    updated_at = now();

alter table public.design_print_areas
  alter column min_dpi set default 300;

alter table public.design_print_areas
  drop constraint if exists design_print_areas_min_dpi_check;

alter table public.design_print_areas
  add constraint design_print_areas_min_dpi_check
  check (min_dpi between 300 and 1200);

comment on column public.design_studio_settings.default_raster_ppi is
  'Minimum effective raster resolution at the selected physical print size. Metadata alone does not satisfy this requirement.';

commit;
