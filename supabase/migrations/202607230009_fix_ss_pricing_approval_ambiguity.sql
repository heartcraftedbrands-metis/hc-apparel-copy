do $migration$
declare
  v_definition text;
  v_patched text;
begin
  select pg_get_functiondef(
    'public.approve_ss_recommended_pricing(text,integer)'::regprocedure
  )
  into v_definition;

  v_patched := replace(
    v_definition,
    E'AS $function$\ndeclare',
    E'AS $function$\n#variable_conflict use_column\ndeclare'
  );

  if v_patched = v_definition then
    raise exception 'Could not patch approve_ss_recommended_pricing safely';
  end if;

  execute v_patched;
end;
$migration$;
