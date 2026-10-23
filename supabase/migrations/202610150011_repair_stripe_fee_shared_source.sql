begin;
-- Shared records identify the application that owns synchronization. Stripe is
-- retained inside the record payload as the financial evidence provider.
do $repair$
declare
  definition text;
begin
  definition:=pg_get_functiondef('public.ops_import_stripe_balance_export(jsonb,text,text,uuid)'::regprocedure);
  definition:=replace(definition,'''hc-apparel'',''expense'',''stripe'',''txn_1UNm8s77O18gAiWR0a4K9ETU''','''hc-apparel'',''expense'',''heart_command_center'',''txn_1UNm8s77O18gAiWR0a4K9ETU''');
  definition:=replace(definition,'''hc-apparel'',''expense'',''stripe'',''txn_1UO9Z977O18gAiWRn126UGAr''','''hc-apparel'',''expense'',''heart_command_center'',''txn_1UO9Z977O18gAiWRn126UGAr''');
  if position('''hc-apparel'',''expense'',''stripe'',''txn_1U' in definition)>0 then
    raise exception 'Stripe fee shared-record source repair did not complete.';
  end if;
  execute definition;
end;
$repair$;
commit;
