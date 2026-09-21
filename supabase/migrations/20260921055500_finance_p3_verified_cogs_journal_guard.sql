-- Guard HPP journals: only audited temporal recipe cost may post to account 5000/1300.
do $$
declare v_sql text;
begin
  select pg_get_functiondef(p.oid) into v_sql
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname='rebuild_finance_journal_v1'
    and pg_get_function_identity_arguments(p.oid)='p_brand uuid, p_from date, p_to date';
  if v_sql is null then raise exception 'finance rebuild function not found'; end if;
  if position('unit_cogs_source' in v_sql)>0 then return; end if;
  v_sql:=replace(v_sql,
    'where unit_cogs>0 group by sale_id',
    'where unit_cogs>0 and unit_cogs_source=''verified_recipe_temporal_cost'' and unit_cogs_confidence=''verified'' group by sale_id');
  if position('unit_cogs_source' in v_sql)=0 then raise exception 'COGS hardening patch did not match'; end if;
  execute v_sql;
end $$;
