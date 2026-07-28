begin;

drop function if exists public.diagnose_latest_columbia_stage();
drop function if exists public.complete_guarded_columbia_stage(
  text,
  text,
  integer,
  integer,
  integer
);
drop function if exists public.append_guarded_columbia_skus(text, text, jsonb);
drop function if exists public.start_guarded_columbia_stage(text, jsonb);
drop function if exists public.publish_eligible_columbia_session(text);

commit;
