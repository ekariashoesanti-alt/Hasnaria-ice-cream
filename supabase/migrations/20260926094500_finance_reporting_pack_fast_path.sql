-- The Finance v6 shell only needs period metadata from the reporting-pack call.
-- Selected-period financial detail is loaded separately by get_finance_period_pack_v1.
create or replace function private.get_finance_reporting_pack_v1(p_brand uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
begin
  if not private.same_brand(p_brand) then
    raise exception 'Brand is outside your access';
  end if;

  return jsonb_build_object(
    'periods',coalesce((
      select jsonb_agg(jsonb_build_object(
        'accounting_period_id',ap.id,
        'brand_id',ap.brand_id,
        'period_month',ap.period_start,
        'period_end',ap.period_end,
        'period_status',ap.status,
        'ready_to_close',false
      ) order by ap.period_start)
      from public.accounting_periods ap
      where ap.brand_id=p_brand
    ),'[]'::jsonb),
    'income','[]'::jsonb,
    'position','[]'::jsonb,
    'notes','[]'::jsonb
  );
end;
$function$;
