-- Compute the selected-period reporting pack from one materialized trial-balance pass.
-- This keeps the public RPC contract stable while avoiding repeated recomputation of
-- income, position, trial balance, close readiness, and notes.
create or replace function private.get_finance_period_pack_live_v1(p_brand uuid,p_period date)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_period date:=date_trunc('month',p_period::timestamp)::date;
  v_prev date;
  v_result jsonb;
begin
  if not private.same_brand(p_brand) then
    raise exception 'Brand is outside your access';
  end if;

  select max(period_start) into v_prev
  from public.accounting_periods
  where brand_id=p_brand and period_start<v_period;

  with tb as materialized (
    select *
    from public.finance_trial_balance_monthly_v1
    where brand_id=p_brand
      and period_month in (v_period,v_prev)
  ), income as (
    select brand_id,period_month,
      coalesce(sum(period_credit-period_debit) filter(where account_type='REVENUE' and account_code='4000'),0)::numeric(18,2) as revenue_sales,
      coalesce(sum(period_credit-period_debit) filter(where account_type='REVENUE' and account_code<>'4000'),0)::numeric(18,2) as other_income,
      coalesce(sum(period_debit-period_credit) filter(where account_type='COGS'),0)::numeric(18,2) as cogs,
      coalesce(sum(period_debit-period_credit) filter(where account_type='EXPENSE' and account_code not in ('6400','6500')),0)::numeric(18,2) as operating_expense,
      coalesce(sum(period_debit-period_credit) filter(where account_code='6400'),0)::numeric(18,2) as finance_expense,
      coalesce(sum(period_debit-period_credit) filter(where account_code='6500'),0)::numeric(18,2) as tax_expense,
      (coalesce(sum(period_credit-period_debit) filter(where account_type='REVENUE'),0)-coalesce(sum(period_debit-period_credit) filter(where account_type='COGS'),0))::numeric(18,2) as gross_profit,
      (coalesce(sum(period_credit-period_debit) filter(where account_type='REVENUE'),0)-coalesce(sum(period_debit-period_credit) filter(where account_type in ('COGS','EXPENSE') and account_code<>'6500'),0))::numeric(18,2) as profit_before_tax,
      (coalesce(sum(period_credit-period_debit) filter(where account_type='REVENUE'),0)-coalesce(sum(period_debit-period_credit) filter(where account_type in ('COGS','EXPENSE')),0))::numeric(18,2) as profit_after_tax,
      100::numeric(8,2) as cogs_coverage_pct,
      true as cogs_ready
    from tb
    group by brand_id,period_month
  ), bal0 as (
    select brand_id,period_month,
      coalesce(sum(ending_balance) filter(where account_type='ASSET'),0)::numeric(18,2) as total_assets,
      coalesce(sum(ending_balance) filter(where account_type='LIABILITY'),0)::numeric(18,2) as total_liabilities,
      coalesce(sum(ending_balance) filter(where account_type='EQUITY'),0)::numeric(18,2) as contributed_equity,
      (coalesce(sum(ending_balance) filter(where account_type='REVENUE'),0)
       -coalesce(sum(ending_balance) filter(where account_type='COGS'),0)
       -coalesce(sum(ending_balance) filter(where account_type='EXPENSE'),0))::numeric(18,2) as accumulated_result
    from tb
    group by brand_id,period_month
  ), balance as (
    select brand_id,period_month,total_assets,total_liabilities,contributed_equity,
      accumulated_result::numeric(18,2) as retained_earnings_derived,
      (contributed_equity+accumulated_result)::numeric(18,2) as total_equity,
      (total_liabilities+contributed_equity+accumulated_result)::numeric(18,2) as liabilities_and_equity,
      (total_assets-total_liabilities-contributed_equity-accumulated_result)::numeric(18,2) as balance_delta
    from bal0
  ), pos as (
    select brand_id,period_month,account_code,account_name,account_type,ending_balance,
      case when account_type='ASSET' then 'ASET'
           when account_type='LIABILITY' then 'LIABILITAS'
           when account_type='EQUITY' then 'EKUITAS'
           else 'HASIL_PERIODE' end as section,
      case when account_type='ASSET' then 1
           when account_type='LIABILITY' then 2
           when account_type='EQUITY' then 3
           else 4 end as section_order
    from tb
    where abs(ending_balance)>=0.01 or account_type in ('ASSET','LIABILITY','EQUITY')
  ), tender as (
    select coalesce(abs(sum(coalesce(total_amount,0))-sum(coalesce(cash_amount,0)+coalesce(qris_amount,0)+coalesce(tf_amount,0))),0)::numeric(18,2) as tender_unclassified_delta
    from public.sales
    where brand_id=p_brand and sold_at>=v_period and sold_at<(v_period+interval '1 month')
  ), prov as (
    select count(*) filter(where status='provisional')::bigint as provisional_entries
    from public.finance_journal_entries
    where brand_id=p_brand and period_month=v_period and status<>'void'
  ), purchase_review as (
    select count(*) filter(where category_status='provisional_review')::bigint as unclassified_purchase_rows,
           coalesce(sum(total_amount) filter(where category_status='provisional_review'),0)::numeric(18,2) as unclassified_purchase_amount
    from public.finance_purchase_expense_category_v1
    where brand_id=p_brand and period_month=v_period
  ), jdelta as (
    select abs(coalesce(sum(l.debit-l.credit),0))::numeric(18,2) as journal_delta
    from public.finance_journal_entries e
    join public.finance_journal_lines l on l.entry_id=e.id
    where e.brand_id=p_brand and e.period_month=v_period and e.status<>'void'
  ), p4 as (
    select *
    from public.finance_p4_period_readiness_v1
    where brand_id=p_brand and period_month=v_period
  ), readiness0 as (
    select ap.id as accounting_period_id,ap.brand_id,ap.period_start as period_month,ap.period_end,ap.status as period_status,
      100::numeric(8,2) as cogs_coverage_pct,
      coalesce(t.tender_unclassified_delta,0)::numeric(18,2) as tender_unclassified_delta,
      coalesce(pr.provisional_entries,0)::bigint as provisional_entries,
      coalesce(ur.unclassified_purchase_rows,0)::bigint as unclassified_purchase_rows,
      coalesce(ur.unclassified_purchase_amount,0)::numeric(18,2) as unclassified_purchase_amount,
      coalesce(j.journal_delta,0)::numeric(18,2) as journal_delta,
      abs(coalesce(b.balance_delta,0))::numeric(18,2) as balance_delta,
      coalesce(p4.opening_balance_mode,'unconfirmed') as opening_balance_mode,
      coalesce(p4.accruals_reviewed,false) as accruals_reviewed,
      coalesce(p4.prepaids_reviewed,false) as prepaids_reviewed,
      coalesce(p4.tax_reviewed,false) as tax_reviewed,
      coalesce(p4.draft_adjustments,0)::bigint as draft_adjustments,
      coalesce(p4.unreviewed_investment_candidates,0)::bigint as unreviewed_investment_candidates,
      coalesce(p4.draft_assets,0)::bigint as draft_assets,
      coalesce(p4.depreciation_due_assets,0)::bigint as depreciation_due_assets,
      coalesce(p4.manual_depreciation_assets,0)::bigint as manual_depreciation_assets,
      coalesce(p4.p4_ready,false) as p4_ready,
      coalesce(p4.p4_blockers,'') as p4_blockers
    from public.accounting_periods ap
    cross join tender t
    cross join prov pr
    cross join purchase_review ur
    cross join jdelta j
    left join balance b on b.brand_id=ap.brand_id and b.period_month=ap.period_start
    left join p4 on p4.accounting_period_id=ap.id
    where ap.brand_id=p_brand and ap.period_start=v_period
  ), readiness as (
    select r.*,
      (r.tender_unclassified_delta<0.01 and r.provisional_entries=0 and r.unclassified_purchase_rows=0
       and r.journal_delta<0.01 and r.balance_delta<0.01 and r.p4_ready) as ready_to_close,
      concat_ws(' · ',
        case when r.tender_unclassified_delta>=0.01 then 'Tender belum rekonsiliasi' end,
        case when r.provisional_entries>0 then r.provisional_entries::text||' jurnal provisional' end,
        case when r.unclassified_purchase_rows>0 then r.unclassified_purchase_rows::text||' pembelian perlu review' end,
        case when r.journal_delta>=0.01 then 'Jurnal tidak seimbang' end,
        case when r.balance_delta>=0.01 then 'Posisi keuangan tidak seimbang' end,
        nullif(r.p4_blockers,'')) as blockers,
      0::bigint as hpp_missing_recipe_products,
      0::bigint as hpp_recipe_unverified_products,
      0::bigint as hpp_missing_component_cost_products,
      0::bigint as hpp_unmapped_products,
      0::numeric as hpp_uncovered_units,
      0::numeric(18,2) as hpp_uncovered_sales_value
    from readiness0 r
  )
  select jsonb_build_object(
    'period',v_period,
    'previous_period',v_prev,
    'income_current',(select to_jsonb(i) from income i where i.period_month=v_period),
    'income_previous',(select to_jsonb(i) from income i where i.period_month=v_prev),
    'position_current',(select to_jsonb(b) from balance b where b.period_month=v_period),
    'position_previous',(select to_jsonb(b) from balance b where b.period_month=v_prev),
    'position_lines_current',coalesce((select jsonb_agg(to_jsonb(x) order by x.section_order,x.account_code) from pos x where x.period_month=v_period),'[]'::jsonb),
    'position_lines_previous',coalesce((select jsonb_agg(to_jsonb(x) order by x.section_order,x.account_code) from pos x where x.period_month=v_prev),'[]'::jsonb),
    'trial_balance',coalesce((select jsonb_agg(to_jsonb(t) order by t.account_code) from tb t where t.period_month=v_period),'[]'::jsonb),
    'readiness',(select to_jsonb(r) from readiness r),
    'notes',(select jsonb_build_object(
      'framework_label','Format mengacu SAK EMKM - internal, belum pernyataan kepatuhan',
      'basis','Biaya historis dan basis akrual; nilai Pembelian dibebankan sesuai kategori',
      'currency','IDR','comparative_required',true,
      'hpp_status','tidak digunakan pada model aktif','cogs_coverage_pct',100,
      'purchase_expense_basis','active','provisional_entries',r.provisional_entries,
      'unclassified_purchase_rows',r.unclassified_purchase_rows,
      'unclassified_purchase_amount',r.unclassified_purchase_amount,
      'blockers',r.blockers) from readiness r)
  ) into v_result;

  return v_result;
end;
$function$;
