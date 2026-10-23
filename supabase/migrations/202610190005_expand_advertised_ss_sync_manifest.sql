begin;
do $migration$
declare
  v_definition text;
  v_anchor text := '(''Independent Trading Co'',''IND420XD'',''IND420XD'',''hoodies'',''hoodies'',''hoodies'',''hoodie'',''mens'')';
  v_replacement text := v_anchor || E',\n        (''Independent Trading Co'',''SS4500'',''SS4500'',''hoodies'',''hoodies'',''hoodies'',''hoodie'',''mens''),\n        (''Gildan'',''18810'',''18810'',''quarter_zips'',''quarter_zips'',''quarter_zip'',''premium_specialty'',''mens''),\n        (''Rabbit Skins'',''3317'',''3317'',''crewnecks'',''youth_crewnecks'',''sweatshirts'',''crewneck'',''kids''),\n        (''Tultex'',''340'',''340'',''crewnecks'',''crewnecks'',''sweatshirts'',''crewneck'',''mens'')';
begin
  select pg_get_functiondef('public.auto_publish_advertised_ss_session(text)'::regprocedure)
    into v_definition;

  if position('(''Gildan'', ''18810''' in v_definition) > 0 then
    return;
  end if;

  if position(v_anchor in v_definition) = 0 then
    raise exception 'Could not locate the advertised S&S manifest anchor; refusing an unsafe function rewrite';
  end if;

  v_definition := replace(v_definition, v_anchor, v_replacement);
  execute v_definition;
end
$migration$;
commit;
