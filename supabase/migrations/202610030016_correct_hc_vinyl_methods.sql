begin;

alter table public.design_decoration_methods
  alter column availability_label drop not null,
  alter column availability_label drop default,
  add column if not exists draft_selectable boolean not null default true,
  add column if not exists provider_key text,
  add column if not exists backup_production_route text
    check (backup_production_route is null or backup_production_route in ('hc_transfer_press','outside_print_vendor','printify','hc_in_house')),
  add column if not exists backup_provider_key text;

comment on column public.design_decoration_methods.available is
  'Server-enforced production readiness. Draft selection is controlled separately by draft_selectable.';
comment on column public.design_decoration_methods.draft_selectable is
  'Whether a customer may select the method while designing and save an incomplete draft.';

update public.design_decoration_methods
set
  draft_selectable = true,
  available = true,
  availability_label = null,
  production_route = 'hc_transfer_press',
  provider_key = 'hc',
  backup_production_route = null,
  backup_provider_key = null,
  limits_note = case method_key
    when 'dtf' then 'HC production workflow. Transfer and pressing are included in configured printing prices.'
    when 'soft_vinyl' then 'HC production workflow. Pricing must include material, preparation or weeding where applicable, and pressing.'
    when 'puff_vinyl' then 'HC production workflow. Pricing must include material, preparation or weeding where applicable, and pressing.'
    when 'glitter_vinyl' then 'HC production workflow. Pricing must include material, preparation or weeding where applicable, and pressing.'
    when 'flock_vinyl' then 'HC production workflow. Pricing must include material, preparation or weeding where applicable, and pressing.'
  end,
  updated_at = now()
where method_key in ('dtf','soft_vinyl','puff_vinyl','glitter_vinyl','flock_vinyl');

update public.design_decoration_methods
set
  draft_selectable = true,
  available = false,
  availability_label = null,
  production_route = 'outside_print_vendor',
  provider_key = 'ss_fast',
  backup_production_route = null,
  backup_provider_key = null,
  limits_note = 'Draft design is available. Production requires approved and configured S&S FAST routing plus embroidery digitization review.',
  updated_at = now()
where method_key = 'embroidery';

update public.design_decoration_methods
set
  draft_selectable = true,
  available = false,
  availability_label = null,
  production_route = 'outside_print_vendor',
  provider_key = 'ss_fast',
  backup_production_route = 'printify',
  backup_provider_key = 'printify',
  limits_note = 'Draft design is available. Production requires approved and configured S&S FAST routing; Printify remains an optional disabled backup.',
  updated_at = now()
where method_key = 'dtg';

alter table public.design_pricing_config
  add column if not exists preparation_labor_cost numeric check (preparation_labor_cost >= 0);

comment on column public.design_pricing_config.preparation_labor_cost is
  'Internal preparation or weeding labor. This cost is separate from the customer service price.';

commit;
