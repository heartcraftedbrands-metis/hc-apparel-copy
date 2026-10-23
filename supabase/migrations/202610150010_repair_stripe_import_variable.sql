begin;
-- The initial importer used a local variable named transaction_kind. In an
-- ON CONFLICT target PostgreSQL could not distinguish that variable from the
-- ledger column. Recompile the function with an unambiguous local name while
-- preserving the already-reviewed import implementation byte-for-byte.
do $repair$
declare
  definition text;
begin
  definition:=pg_get_functiondef('public.ops_import_stripe_balance_export(jsonb,text,text,uuid)'::regprocedure);
  definition:=replace(definition,'  transaction_kind text;','  transaction_kind_value text;');
  definition:=replace(definition,'    transaction_kind:=case','    transaction_kind_value:=case');
  definition:=replace(definition,'if transaction_kind is null','if transaction_kind_value is null');
  definition:=replace(definition,'''hc-apparel'',transaction_kind,direction_value','''hc-apparel'',transaction_kind_value,direction_value');
  definition:=replace(definition,'when transaction_kind in (''transfer'',''payment_settlement'')','when transaction_kind_value in (''transfer'',''payment_settlement'')');
  definition:=replace(definition,'when transaction_kind=''account_fee''','when transaction_kind_value=''account_fee''');
  if position('transaction_kind text;' in definition)>0 or position('transaction_kind:=case' in definition)>0 then
    raise exception 'Stripe importer repair did not replace the ambiguous variable.';
  end if;
  execute definition;
end;
$repair$;
commit;
