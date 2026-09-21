begin;

create or replace function public.get_finance_reporting_pack_v1(p_brand uuid)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
begin
  if not private.same_brand(p_brand) then
    raise exception 'Brand is outside your access';
  end if;
  return jsonb_build_object(
    'periods',coalesce((select jsonb_agg(to_jsonb(r) order by r.period_month) from public.finance_close_readiness_v1 r where r.brand_id=p_brand),'[]'::jsonb),
    'income',coalesce((select jsonb_agg(to_jsonb(i) order by i.period_month) from public.finance_income_statement_monthly_v1 i where i.brand_id=p_brand),'[]'::jsonb),
    'position',coalesce((select jsonb_agg(to_jsonb(b) order by b.period_month) from public.finance_balance_sheet_monthly_v1 b where b.brand_id=p_brand),'[]'::jsonb),
    'notes',coalesce((select jsonb_agg(to_jsonb(n) order by n.period_month) from public.finance_notes_monthly_v1 n where n.brand_id=p_brand),'[]'::jsonb)
  );
end;
$$;

create or replace function public.get_finance_period_pack_v1(p_brand uuid,p_period date)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_period date:=date_trunc('month',p_period::timestamp)::date;
  v_prev date;
begin
  if not private.same_brand(p_brand) then
    raise exception 'Brand is outside your access';
  end if;
  select max(period_start) into v_prev
  from public.accounting_periods
  where brand_id=p_brand and period_start<v_period;

  return jsonb_build_object(
    'period',v_period,
    'previous_period',v_prev,
    'income_current',(select to_jsonb(i) from public.finance_income_statement_monthly_v1 i where i.brand_id=p_brand and i.period_month=v_period),
    'income_previous',(select to_jsonb(i) from public.finance_income_statement_monthly_v1 i where i.brand_id=p_brand and i.period_month=v_prev),
    'position_current',(select to_jsonb(b) from public.finance_balance_sheet_monthly_v1 b where b.brand_id=p_brand and b.period_month=v_period),
    'position_previous',(select to_jsonb(b) from public.finance_balance_sheet_monthly_v1 b where b.brand_id=p_brand and b.period_month=v_prev),
    'position_lines_current',coalesce((select jsonb_agg(to_jsonb(x) order by x.section_order,x.account_code) from public.finance_position_lines_v1 x where x.brand_id=p_brand and x.period_month=v_period),'[]'::jsonb),
    'position_lines_previous',coalesce((select jsonb_agg(to_jsonb(x) order by x.section_order,x.account_code) from public.finance_position_lines_v1 x where x.brand_id=p_brand and x.period_month=v_prev),'[]'::jsonb),
    'trial_balance',coalesce((select jsonb_agg(to_jsonb(t) order by t.account_code) from public.finance_trial_balance_monthly_v1 t where t.brand_id=p_brand and t.period_month=v_period),'[]'::jsonb),
    'readiness',(select to_jsonb(r) from public.finance_close_readiness_v1 r where r.brand_id=p_brand and r.period_month=v_period),
    'notes',(select n.notes from public.finance_notes_monthly_v1 n where n.brand_id=p_brand and n.period_month=v_period)
  );
end;
$$;

revoke all on function public.get_finance_reporting_pack_v1(uuid) from public;
revoke all on function public.get_finance_period_pack_v1(uuid,date) from public;
grant execute on function public.get_finance_reporting_pack_v1(uuid) to authenticated;
grant execute on function public.get_finance_period_pack_v1(uuid,date) to authenticated;

commit;
