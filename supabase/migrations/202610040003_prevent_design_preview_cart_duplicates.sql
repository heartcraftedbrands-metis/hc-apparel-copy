begin;

with ranked as (
  select
    id,
    row_number() over (
      partition by owner_user_id, design_id
      order by updated_at desc, created_at desc, id desc
    ) as position
  from public.design_preview_cart_items
  where archived_at is null
)
update public.design_preview_cart_items as item
set archived_at = clock_timestamp(),
    purge_after = clock_timestamp() + interval '6 months',
    archive_reason = 'Duplicate isolated preview-cart entry consolidated during customer experience repair.',
    updated_at = clock_timestamp()
from ranked
where item.id = ranked.id
  and ranked.position > 1;

create unique index if not exists design_preview_cart_one_active_design_idx
  on public.design_preview_cart_items(owner_user_id, design_id)
  where archived_at is null;

commit;
