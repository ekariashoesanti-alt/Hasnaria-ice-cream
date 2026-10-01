-- Align the management Finance payload with canonical Sales and Purchase totals.
-- Purchase category rows remain detailed while total_purchase_expense always equals the Purchase ledger total.

create or replace function private.get_finance_management_period_v1(p_brand uuid, p_period date)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_period date:=date_trunc('month',p_period::timestamp)::date;
  v_prev date;
  v_result jsonb;
begin
  if not private.same_brand(p_brand) then raise exception 'Brand is outside your access'; end if;

  select max(period_start) into v_prev
  from public.accounting_periods
  where brand_id=p_brand and period_start<v_period;

  with tb as materialized (
    select *
    from public.finance_trial_balance_monthly_v1
    where brand_id=p_brand and period_month in (v_period,v_prev)
  ), ledger as (
    select brand_id,period_month,
      coalesce(sum(period_credit-period_debit) filter(where account_type='REVENUE' and account_code='4000'),0)::numeric(18,2) as revenue_sales,
      coalesce(sum(period_credit-period_debit) filter(where account_type='REVENUE' and account_code<>'4000'),0)::numeric(18,2) as other_income,
      coalesce(sum(period_debit-period_credit) filter(where account_type='EXPENSE' and account_code not in ('6400','6500')),0)::numeric(18,2) as ledger_operating_expense,
      coalesce(sum(period_debit-period_credit) filter(where account_code='6400'),0)::numeric(18,2) as finance_expense,
      coalesce(sum(period_debit-period_credit) filter(where account_code='6500'),0)::numeric(18,2) as tax_expense,
      coalesce(sum(period_debit-period_credit) filter(where account_type='COGS'),0)::numeric(18,2) as legacy_cogs_ignored
    from tb
    group by brand_id,period_month
  ), purchase as (
    select brand_id,period_month,
      admin_expense,
      maintenance_expense,
      raw_material_expense,
      personnel_expense,
      total_purchase_expense,
      purchase_rows,
      review_rows,
      review_amount
    from public.finance_purchase_expense_monthly_v1
    where brand_id=p_brand and period_month in (v_period,v_prev)
  ), months as (
    select period_month from ledger
    union
    select period_month from purchase
    union
    select v_period where v_period is not null
    union
    select v_prev where v_prev is not null
  ), base as (
    select p_brand as brand_id,m.period_month,
      coalesce(l.revenue_sales,0)::numeric(18,2) as revenue_sales,
      coalesce(l.other_income,0)::numeric(18,2) as other_income,
      coalesce(p.admin_expense,0)::numeric(18,2) as admin_expense,
      coalesce(p.maintenance_expense,0)::numeric(18,2) as maintenance_expense,
      coalesce(p.raw_material_expense,0)::numeric(18,2) as raw_material_expense,
      coalesce(p.personnel_expense,0)::numeric(18,2) as personnel_expense,
      greatest(
        coalesce(p.total_purchase_expense,0)
        - coalesce(p.admin_expense,0)
        - coalesce(p.maintenance_expense,0)
        - coalesce(p.raw_material_expense,0)
        - coalesce(p.personnel_expense,0),
        0
      )::numeric(18,2) as other_purchase_expense,
      coalesce(p.total_purchase_expense,0)::numeric(18,2) as total_purchase_expense,
      greatest(coalesce(l.ledger_operating_expense,0)-coalesce(p.total_purchase_expense,0),0)::numeric(18,2) as other_operating_expense,
      coalesce(l.finance_expense,0)::numeric(18,2) as finance_expense,
      coalesce(l.tax_expense,0)::numeric(18,2) as tax_expense,
      coalesce(p.purchase_rows,0)::bigint as purchase_rows,
      coalesce(p.review_rows,0)::bigint as review_rows,
      coalesce(p.review_amount,0)::numeric(18,2) as review_amount,
      coalesce(l.legacy_cogs_ignored,0)::numeric(18,2) as legacy_cogs_ignored
    from months m
    left join ledger l on l.period_month=m.period_month
    left join purchase p on p.period_month=m.period_month
  ), calc as (
    select b.*,
      (total_purchase_expense+other_operating_expense)::numeric(18,2) as total_operating_expense,
      (revenue_sales+other_income-total_purchase_expense-other_operating_expense-finance_expense)::numeric(18,2) as profit_before_tax,
      (revenue_sales+other_income-total_purchase_expense-other_operating_expense-finance_expense-tax_expense)::numeric(18,2) as profit_after_tax,
      'purchase_journal'::text as report_basis
    from base b
  )
  select jsonb_build_object(
    'period',v_period,
    'previous_period',v_prev,
    'current',(select to_jsonb(c) from calc c where c.period_month=v_period),
    'previous',(select to_jsonb(c) from calc c where c.period_month=v_prev),
    'purchase_control_current',(select to_jsonb(r) from public.finance_purchase_reconciliation_monthly_v1 r where r.brand_id=p_brand and r.period_month=v_period),
    'purchase_control_previous',(select to_jsonb(r) from public.finance_purchase_reconciliation_monthly_v1 r where r.brand_id=p_brand and r.period_month=v_prev),
    'concept',jsonb_build_object(
      'label','Laporan Manajemen · Basis Pembelian',
      'purchase_value','expense',
      'stock_value','quantity_only',
      'hpp','retired',
      'finance_source','double_entry_journal',
      'purchase_total_source','finance_purchase_expense_monthly_v1'
    )
  ) into v_result;

  return v_result;
end;
$$;
