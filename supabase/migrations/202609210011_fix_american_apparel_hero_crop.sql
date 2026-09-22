begin;

alter table public.brand_pages
  add column if not exists hero_mobile_object_position text,
  add column if not exists hero_image_fit text not null default 'cover';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'brand_pages_hero_mobile_object_position_check'
      and conrelid = 'public.brand_pages'::regclass
  ) then
    alter table public.brand_pages
      add constraint brand_pages_hero_mobile_object_position_check
      check (
        hero_mobile_object_position is null or hero_mobile_object_position in (
          'center center', 'center top', 'center bottom', 'left center', 'right center'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'brand_pages_hero_image_fit_check'
      and conrelid = 'public.brand_pages'::regclass
  ) then
    alter table public.brand_pages
      add constraint brand_pages_hero_image_fit_check
      check (hero_image_fit in ('cover', 'contain'));
  end if;
end $$;

update public.brand_pages
set hero_object_position = 'center center',
    hero_mobile_object_position = 'center top',
    hero_image_fit = 'contain',
    updated_at = now()
where slug = 'american-apparel';

commit;
