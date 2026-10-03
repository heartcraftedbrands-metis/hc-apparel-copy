begin;

alter table public.design_preview_cart_items
  add column if not exists variant_id text;

commit;
