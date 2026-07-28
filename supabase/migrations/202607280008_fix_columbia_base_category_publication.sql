begin;

do $$
declare
  v_definition text;
  v_prior text := 'lower(v_name) ~';
  v_fixed text := 'lower(concat_ws('' '', v_name, v_style.base_category)) ~';
begin
  select pg_get_functiondef('public.publish_eligible_columbia_session(text)'::regprocedure)
  into v_definition;
  if strpos(v_definition, v_prior) = 0 then
    raise exception 'Expected Columbia category classifier was not found';
  end if;
  v_definition := replace(v_definition, v_prior, v_fixed);
  execute v_definition;
end;
$$;

comment on function public.publish_eligible_columbia_session(text) is
'Temporary service-only Columbia publication check using title and S&S baseCategory; restricted and incomplete products remain hidden.';

commit;
