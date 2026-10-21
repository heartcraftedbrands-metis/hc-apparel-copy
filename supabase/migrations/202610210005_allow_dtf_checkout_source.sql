begin;
alter table public.orders drop constraint if exists orders_checkout_source_check;
alter table public.orders add constraint orders_checkout_source_check check (
  checkout_source is null or checkout_source in (
    'customized_small_order','digital_mockup_order','mixed_storefront_order','dtf_transfer_order'
  )
);
commit;
