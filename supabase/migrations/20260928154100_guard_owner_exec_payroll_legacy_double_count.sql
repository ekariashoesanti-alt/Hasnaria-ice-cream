do $$
declare
  v_oid oid;
  v_def text;
  v_old text;
  v_new text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='owner_executive_tab_v1'
    and pg_get_function_identity_arguments(p.oid)='p_tab text, p_period date';

  if v_oid is null then raise exception 'owner_executive_tab_v1 not found'; end if;
  select pg_get_functiondef(v_oid) into v_def;

  v_old := 'from public.finance_purchase_dual_posting_v1 x
  where x.brand_id=v_brand and x.period_month=v_month;';
  v_new := 'from public.finance_purchase_dual_posting_v1 x
  where x.brand_id=v_brand and x.period_month=v_month
    and not (x.expense_account_code=''6200'' and exists (
      select 1 from public.payroll_periods pp
      where pp.brand_id=v_brand and pp.period_month=v_month and pp.status=''posted''
    ));';
  if position(v_old in v_def)=0 then raise exception 'current purchase aggregation marker not found'; end if;
  v_def := replace(v_def,v_old,v_new);

  v_old := 'where brand_id=v_brand and period_month>=(v_month-interval ''5 months'')::date and period_month<=v_month
      group by period_month';
  v_new := 'where brand_id=v_brand and period_month>=(v_month-interval ''5 months'')::date and period_month<=v_month
        and not (expense_account_code=''6200'' and exists (
          select 1 from public.payroll_periods pp
          where pp.brand_id=v_brand and pp.period_month=finance_purchase_dual_posting_v1.period_month and pp.status=''posted''
        ))
      group by period_month';
  if position(v_old in v_def)=0 then raise exception 'trend purchase aggregation marker not found'; end if;
  v_def := replace(v_def,v_old,v_new);

  execute v_def;
end $$;
