-- Preserve supplier-verified customer-facing titles when advertised S&S products
-- are refreshed. This updates the existing publication function in place and
-- leaves populated product and variant records intact.
do $$
declare
  v_definition text;
  v_anchor text := 'v_name := coalesce(nullif(v_target.supplier_title,''''),nullif(v_target.style_name,''''),v_target.advertised_style);';
  v_replacement text := $replacement$v_name := case
        when v_target.brand = 'Independent Trading Co' and v_target.advertised_style = 'SS4500'
          then 'Independent Trading Co Unisex Midweight Hooded Sweatshirt'
        when v_target.brand = 'Gildan' and v_target.advertised_style = '18810'
          then 'Gildan Unisex Heavy Blend Quarter-Zip Sweatshirt'
        when v_target.brand = 'Rabbit Skins' and v_target.advertised_style = '3317'
          then 'Rabbit Skins Toddler Fleece Crewneck Sweatshirt'
        when v_target.brand = 'Tultex' and v_target.advertised_style = '340'
          then 'Tultex Unisex Fleece Crewneck Sweatshirt'
        else coalesce(nullif(v_target.supplier_title,''),nullif(v_target.style_name,''),v_target.advertised_style)
      end;$replacement$;
begin
  select pg_get_functiondef('public.auto_publish_advertised_ss_session(text)'::regprocedure)
    into v_definition;

  if position('Gildan Unisex Heavy Blend Quarter-Zip Sweatshirt' in v_definition) > 0 then
    return;
  end if;

  if position(v_anchor in v_definition) = 0 then
    raise exception 'Could not locate advertised product title assignment';
  end if;

  execute replace(v_definition, v_anchor, v_replacement);
end;
$$;
