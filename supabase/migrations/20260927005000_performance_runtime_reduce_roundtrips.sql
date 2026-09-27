-- Performance hardening: aggregate Sales hourly server-side and retire heavy HPP-era Finance alerts.

create or replace function private.get_sales_hourly_month_v1(p_brand uuid, p_period date)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_period date := date_trunc('month', p_period::timestamp)::date;
  v_result jsonb;
begin
  if p_brand is null or p_period is null then
    raise exception 'Brand and period are required';
  end if;
  if not private.same_brand(p_brand) then
    raise exception 'Brand is outside your access';
  end if;

  with base as materialized (
    select sold_hour, coalesce(transaction_count,0)::numeric as transaction_count
    from public.sales
    where brand_id=p_brand
      and sold_at>=v_period
      and sold_at<(v_period + interval '1 month')
  ), agg as (
    select sold_hour::int as sold_hour,
           sum(transaction_count)::numeric as transaction_count
    from base
    where sold_hour between 0 and 23
    group by sold_hour
  )
  select jsonb_build_object(
    'period', v_period,
    'source_rows', (select count(*) from base),
    'valid_hour_rows', (select count(*) from base where sold_hour between 0 and 23),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('sold_hour',sold_hour,'transaction_count',transaction_count) order by sold_hour) from agg),'[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.get_sales_hourly_month_v1(p_brand uuid, p_period date)
returns jsonb
language sql
set search_path=''
as $$ select private.get_sales_hourly_month_v1(p_brand,p_period); $$;

grant execute on function public.get_sales_hourly_month_v1(uuid,date) to authenticated,service_role;

create index if not exists finance_journal_entries_purchase_provisional_idx
  on public.finance_journal_entries(brand_id,period_month)
  where source_type='purchase_expense' and status='provisional';

-- HPP alerts are retired from the active management model. Keep the alert surface lightweight:
-- it now surfaces only actionable accounting completeness items that are still relevant.
create or replace view public.ui_finance_alerts
with (security_invoker=true)
as
select
  10 as sort_order,
  'warning'::text as severity,
  'PURCHASE_PAYMENT_PROVISIONAL'::text as alert_code,
  'Sumber pembayaran Pembelian belum final'::text as title,
  concat(count(*),' jurnal Pembelian masih provisional dan harus direkonsiliasi sebelum tutup buku.') as message,
  'purchase_quality'::text as target_section,
  jsonb_build_object('provisional_entries',count(*)) as metadata
from public.finance_journal_entries
where source_type='purchase_expense' and status='provisional'
having count(*)>0
union all
select
  70,
  'warning'::text,
  'OPENING_BALANCE_MISSING'::text,
  'Saldo awal akuntansi belum ditetapkan'::text as title,
  'Isi saldo awal ketika data tersedia, atau konfirmasi nol hanya bila memang benar.'::text as message,
  'opening_balance'::text,
  jsonb_build_object('required',true)
where exists(select 1 from public.accounting_periods)
  and not exists(select 1 from public.finance_accounting_settings where opening_balance_mode is not null);

grant select on public.ui_finance_alerts to authenticated;
