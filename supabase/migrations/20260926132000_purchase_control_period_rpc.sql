create or replace function private.get_purchase_control_period_v1(p_brand uuid,p_period date)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_period date:=date_trunc('month',p_period::timestamp)::date;
  v_rows jsonb;
  v_control jsonb;
begin
  if not private.same_brand(p_brand) then raise exception 'Brand is outside your access'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.effective_date,x.source_history_id),'[]'::jsonb)
    into v_rows
  from public.finance_purchase_dual_posting_v1 x
  where x.brand_id=p_brand and x.period_month=v_period;
  select to_jsonb(r) into v_control
  from public.finance_purchase_reconciliation_monthly_v1 r
  where r.brand_id=p_brand and r.period_month=v_period;
  return jsonb_build_object('period',v_period,'rows',coalesce(v_rows,'[]'::jsonb),'control',coalesce(v_control,'{}'::jsonb));
end;
$$;

create or replace function public.get_purchase_control_period_v1(p_brand uuid,p_period date)
returns jsonb
language sql
set search_path=''
as $$ select private.get_purchase_control_period_v1(p_brand,p_period); $$;

grant execute on function public.get_purchase_control_period_v1(uuid,date) to authenticated,service_role;
