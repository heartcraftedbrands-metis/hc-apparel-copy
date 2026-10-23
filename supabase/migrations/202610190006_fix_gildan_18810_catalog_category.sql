begin;
do $migration$
declare
  v_definition text;
  v_old text := '(''Gildan'',''18810'',''18810'',''quarter_zips'',''quarter_zips'',''quarter_zip'',''premium_specialty'',''mens'')';
  v_new text := '(''Gildan'',''18810'',''18810'',''quarter_zips'',''other'',''quarter_zip'',''premium_specialty'',''mens'')';
begin
  select pg_get_functiondef('public.auto_publish_advertised_ss_session(text)'::regprocedure)
    into v_definition;

  if position(v_new in v_definition) > 0 then
    return;
  end if;

  if position(v_old in v_definition) = 0 then
    raise exception 'Could not locate the Gildan 18810 manifest row; refusing an unsafe function rewrite';
  end if;

  execute replace(v_definition, v_old, v_new);
end
$migration$;
commit;
