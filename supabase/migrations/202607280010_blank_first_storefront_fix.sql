begin;

-- Blank garments may be purchased without artwork. Decoration requirements apply
-- only when the customer explicitly chooses customization.
create or replace function public.small_order_required_data_errors(
  p_items jsonb,
  p_shipping_address jsonb,
  p_owner_user_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_errors jsonb := '[]'::jsonb;
  v_total_quantity integer := 0;
  v_item jsonb;
  v_artwork text;
  v_is_customized boolean;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    return jsonb_build_array('At least one garment item is required');
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if nullif(btrim(coalesce(v_item ->> 'product_id', '')), '') is null
      or nullif(btrim(coalesce(v_item ->> 'product_name', '')), '') is null then
      v_errors := v_errors || jsonb_build_array('Every item requires a product');
    end if;
    if nullif(btrim(coalesce(v_item ->> 'color', '')), '') is null then
      v_errors := v_errors || jsonb_build_array('Every item requires a color');
    end if;
    if nullif(btrim(coalesce(v_item ->> 'size', '')), '') is null then
      v_errors := v_errors || jsonb_build_array('Every item requires a size');
    end if;
    if coalesce(v_item ->> 'quantity', '') !~ '^\d+$'
      or coalesce((v_item ->> 'quantity')::integer, 0) <= 0 then
      v_errors := v_errors || jsonb_build_array(
        'Every item requires a positive whole-number quantity'
      );
    else
      v_total_quantity := v_total_quantity + (v_item ->> 'quantity')::integer;
    end if;

    v_is_customized :=
      lower(coalesce(v_item ->> 'purchase_mode', '')) = 'customized'
      or lower(coalesce(v_item ->> 'is_customized', 'false')) = 'true'
      or nullif(btrim(coalesce(v_item ->> 'artwork_file_url', '')), '') is not null
      or nullif(btrim(coalesce(v_item ->> 'decoration_method', '')), '') is not null
      or nullif(btrim(coalesce(v_item ->> 'print_placement', '')), '') is not null
      or nullif(btrim(coalesce(v_item ->> 'print_size_option', '')), '') is not null;

    if v_is_customized then
      v_artwork := nullif(btrim(coalesce(v_item ->> 'artwork_file_url', '')), '');
      if v_artwork is null then
        v_errors := v_errors || jsonb_build_array(
          'Customized items require private artwork'
        );
      elsif v_artwork not like 'supabase://customer-files/uploads/%' then
        v_errors := v_errors || jsonb_build_array(
          'Artwork must use a private customer-files reference'
        );
      elsif p_owner_user_id is not null
        and v_artwork not like
          'supabase://customer-files/uploads/' || p_owner_user_id::text || '/%' then
        v_errors := v_errors || jsonb_build_array(
          'Artwork does not belong to the signed-in customer'
        );
      end if;

      if nullif(btrim(coalesce(v_item ->> 'decoration_method', '')), '') is null then
        v_errors := v_errors || jsonb_build_array(
          'Customized items require a decoration method'
        );
      end if;
      if nullif(btrim(coalesce(v_item ->> 'print_placement', '')), '') is null then
        v_errors := v_errors || jsonb_build_array(
          'Customized items require a print placement'
        );
      end if;
      if nullif(btrim(coalesce(v_item ->> 'print_size_option', '')), '') is null then
        v_errors := v_errors || jsonb_build_array(
          'Customized items require a print size option'
        );
      end if;
    end if;
  end loop;

  if v_total_quantity >= 50 then
    v_errors := v_errors || jsonb_build_array(
      'Orders of 50 or more require a Bulk Quote 50+'
    );
  end if;

  if nullif(btrim(coalesce(
    p_shipping_address ->> 'street',
    p_shipping_address ->> 'line1',
    p_shipping_address ->> 'address1'
  )), '') is null
    or nullif(btrim(coalesce(p_shipping_address ->> 'city', '')), '') is null
    or nullif(btrim(coalesce(p_shipping_address ->> 'state', '')), '') is null
    or nullif(btrim(coalesce(
      p_shipping_address ->> 'zip',
      p_shipping_address ->> 'postal_code'
    )), '') is null then
    v_errors := v_errors || jsonb_build_array(
      'Complete shipping address is required'
    );
  end if;

  return (
    select coalesce(jsonb_agg(distinct value), '[]'::jsonb)
    from jsonb_array_elements(v_errors)
  );
end;
$$;

revoke all on function public.small_order_required_data_errors(jsonb, jsonb, uuid)
from public, anon, authenticated;

-- The trusted checkout RPC must always use the storefront product price. Variant
-- metadata still selects SKU/inventory, but it cannot bypass storefront pricing.
do $$
declare
  v_definition text;
  v_original text;
begin
  v_definition := pg_get_functiondef(
    'public.create_small_order_checkout(jsonb)'::regprocedure
  );
  v_original := v_definition;

  v_definition := replace(
    v_definition,
    $old$    v_price := case
      when coalesce(v_variant ->> 'price', '') ~ '^\d+(\.\d+)?$'
        then (v_variant ->> 'price')::numeric
      else coalesce(v_product.sale_price, v_product.price)
    end;$old$,
    $new$    v_price := coalesce(v_product.sale_price, v_product.price);$new$
  );

  v_definition := replace(
    v_definition,
    $old$      'product_type', 'physical',
      'artwork_file_url', v_input ->> 'artwork_file_url',$old$,
    $new$      'product_type', 'physical',
      'purchase_mode', case
        when lower(coalesce(v_input ->> 'purchase_mode', '')) = 'customized'
          or lower(coalesce(v_input ->> 'is_customized', 'false')) = 'true'
          then 'customized'
        else 'blank'
      end,
      'is_customized', (
        lower(coalesce(v_input ->> 'purchase_mode', '')) = 'customized'
        or lower(coalesce(v_input ->> 'is_customized', 'false')) = 'true'
      ),
      'artwork_file_url', coalesce(v_input ->> 'artwork_file_url', ''),$new$
  );

  if v_definition = v_original then
    raise exception 'Blank-first checkout patch did not match the installed checkout function';
  end if;
  if v_definition not like '%v_price := coalesce(v_product.sale_price, v_product.price);%'
    or v_definition not like '%' || quote_literal('purchase_mode') || '%' then
    raise exception 'Blank-first checkout patch is incomplete';
  end if;

  execute v_definition;
end;
$$;

do $$
begin
  if exists (
    select 1
    from public.vendor_order_drafts
    where live_submission_enabled is true
  ) then
    raise exception 'Live S&S submission must remain disabled';
  end if;
  if exists (
    select 1
    from public.ss_catalog_workflow_status
    where id is true
      and (product_loading_paused is not true or max_batch_sequence <> 3)
  ) then
    raise exception 'Product loading pause or no-Batch-4 invariant failed';
  end if;
end;
$$;

commit;
