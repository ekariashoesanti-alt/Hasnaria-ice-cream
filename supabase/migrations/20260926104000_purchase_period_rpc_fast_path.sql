-- Selected-period fast path for Purchase → Finance + Stock.
-- Direct PostgREST reads of the security-invoker view caused RLS same_brand()
-- checks to repeat across the whole Purchase stack and hit statement_timeout.
-- This RPC checks brand access once, then returns only the requested month.

create or replace function public.get_purchase_dual_posting_period_v1(p_brand uuid,p_period date)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_period date:=date_trunc('month',p_period::timestamp)::date;
  v_rows jsonb;
begin
  if not private.same_brand(p_brand) then
    raise exception 'Brand is outside your access';
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.effective_date,x.source_history_id),'[]'::jsonb)
    into v_rows
  from public.finance_purchase_dual_posting_v1 x
  where x.brand_id=p_brand
    and x.period_month=v_period;

  return v_rows;
end;
$function$;

revoke all on function public.get_purchase_dual_posting_period_v1(uuid,date) from public;
grant execute on function public.get_purchase_dual_posting_period_v1(uuid,date) to authenticated,service_role;
