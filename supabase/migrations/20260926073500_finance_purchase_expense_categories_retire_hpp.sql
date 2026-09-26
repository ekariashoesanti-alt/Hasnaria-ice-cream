-- HSN-506: retire HPP from active management reporting and use Purchase-based expense categories.
-- Historical COGS/HPP objects are preserved for audit compatibility, but no longer block close readiness.

create or replace view public.finance_purchase_expense_category_v1
with (security_invoker=true)
as
select
  p.brand_id,
  p.source_history_id,
  p.source_period,
  p.effective_date,
  date_trunc('month',p.effective_date::timestamp)::date as period_month,
  p.item_name,
  p.total_amount::numeric(18,2) as total_amount,
  p.payment_method,
  p.analytics_group,
  p.analytics_category,
  p.accounting_treatment,
  p.finance_status,
  case
    when coalesce(p.analytics_group,'')='Karyawan'
      or coalesce(p.analytics_category,'') ilike '%Karyawan%'
      or upper(coalesce(p.item_name,'')) ~ '(GAJI|KARYAWAN|SERAGAM|JAS HUJAN|MAKAN SIANG|TUNJANGAN|BONUS|LEMBUR)'
      then 'Beban Kepegawaian'
    when upper(coalesce(p.item_name,'')) ~ '(SERVIS|SERVICE|PERBAIK|MAINTENANCE|KEBERSIH|SABUN|TISSUE|DETERGEN|PLASTIK SAMPAH|PERALATAN|ALAT KECIL|LAMPU|REPAIR|LISTRIK|TOKEN|GAS|CUCI)'
      then 'Beban Pemeliharaan'
    when coalesce(p.analytics_category,'') in ('Makanan','Minuman','Ice Cream','Kemasan & Supplies')
      then 'Beban Bahan Baku'
    else 'Beban Administrasi'
  end as expense_category,
  case
    when p.finance_status='review_required' then 'provisional_review'
    when p.finance_status='provisional' then 'provisional'
    else 'classified'
  end as category_status
from public.ui_purchase_accounting_detail_v1 p
where p.effective_date is not null
  and coalesce(p.total_amount,0)>0;

grant select on public.finance_purchase_expense_category_v1 to authenticated;

create or replace view public.finance_purchase_expense_monthly_v1
with (security_invoker=true)
as
select
  brand_id,
  period_month,
  count(*)::bigint as purchase_rows,
  coalesce(sum(total_amount),0)::numeric(18,2) as total_purchase_expense,
  coalesce(sum(total_amount) filter(where expense_category='Beban Administrasi'),0)::numeric(18,2) as admin_expense,
  coalesce(sum(total_amount) filter(where expense_category='Beban Pemeliharaan'),0)::numeric(18,2) as maintenance_expense,
  coalesce(sum(total_amount) filter(where expense_category='Beban Bahan Baku'),0)::numeric(18,2) as raw_material_expense,
  coalesce(sum(total_amount) filter(where expense_category='Beban Kepegawaian'),0)::numeric(18,2) as personnel_expense,
  count(*) filter(where category_status='provisional_review')::bigint as review_rows,
  coalesce(sum(total_amount) filter(where category_status='provisional_review'),0)::numeric(18,2) as review_amount
from public.finance_purchase_expense_category_v1
group by brand_id,period_month;

grant select on public.finance_purchase_expense_monthly_v1 to authenticated;

create or replace view public.finance_income_statement_purchase_basis_v1
with (security_invoker=true)
as
with months as (
  select brand_id,period_month from public.finance_income_statement_monthly_v1
  union
  select brand_id,period_month from public.finance_purchase_expense_monthly_v1
), x as (
  select
    m.brand_id,
    m.period_month,
    coalesce(f.revenue_sales,0)::numeric(18,2) as revenue_sales,
    coalesce(f.other_income,0)::numeric(18,2) as other_income,
    coalesce(p.admin_expense,0)::numeric(18,2) as admin_expense,
    coalesce(p.maintenance_expense,0)::numeric(18,2) as maintenance_expense,
    coalesce(p.raw_material_expense,0)::numeric(18,2) as raw_material_expense,
    coalesce(p.personnel_expense,0)::numeric(18,2) as personnel_expense,
    coalesce(p.total_purchase_expense,0)::numeric(18,2) as total_purchase_expense,
    coalesce(f.finance_expense,0)::numeric(18,2) as finance_expense,
    coalesce(f.tax_expense,0)::numeric(18,2) as tax_expense,
    coalesce(p.purchase_rows,0)::bigint as purchase_rows,
    coalesce(p.review_rows,0)::bigint as review_rows,
    coalesce(p.review_amount,0)::numeric(18,2) as review_amount
  from months m
  left join public.finance_income_statement_monthly_v1 f using(brand_id,period_month)
  left join public.finance_purchase_expense_monthly_v1 p using(brand_id,period_month)
)
select
  x.*,
  (revenue_sales+other_income-total_purchase_expense-finance_expense)::numeric(18,2) as profit_before_tax,
  (revenue_sales+other_income-total_purchase_expense-finance_expense-tax_expense)::numeric(18,2) as profit_after_tax,
  'purchase_expense_categories'::text as report_basis,
  'Laba rugi manajerial berbasis seluruh transaksi Pembelian positif; tidak menggunakan HPP.'::text as basis_note
from x;

grant select on public.finance_income_statement_purchase_basis_v1 to authenticated;

-- HPP is retired as a closing requirement. Keep legacy compatibility columns so old clients do not break.
create or replace view public.finance_close_readiness_v1 as
with prov as (
  select brand_id,period_month,count(*) filter(where status='provisional') as provisional_entries
  from public.finance_journal_entries
  where status<>'void'
  group by brand_id,period_month
), unclassified_purchase as (
  select brand_id,
         date_trunc('month',effective_date)::date as period_month,
         count(*) filter(where finance_status='review_required') as unclassified_purchase_rows,
         coalesce(sum(total_amount) filter(where finance_status='review_required'),0) as unclassified_purchase_amount
  from public.ui_purchase_accounting_v1
  where effective_date is not null
  group by brand_id,date_trunc('month',effective_date)::date
), jdelta as (
  select e.brand_id,e.period_month,abs(coalesce(sum(l.debit-l.credit),0)) as journal_delta
  from public.finance_journal_entries e
  join public.finance_journal_lines l on l.entry_id=e.id
  where e.status<>'void'
  group by e.brand_id,e.period_month
)
select
  ap.id as accounting_period_id,ap.brand_id,ap.period_start as period_month,ap.period_end,ap.status as period_status,
  100::numeric(8,2) as cogs_coverage_pct,
  abs(coalesce(fr.tender_unclassified_delta,0))::numeric(18,2) as tender_unclassified_delta,
  coalesce(p.provisional_entries,0)::bigint as provisional_entries,
  coalesce(u.unclassified_purchase_rows,0)::bigint as unclassified_purchase_rows,
  coalesce(u.unclassified_purchase_amount,0)::numeric(18,2) as unclassified_purchase_amount,
  coalesce(j.journal_delta,0)::numeric(18,2) as journal_delta,
  abs(coalesce(bs.balance_delta,0))::numeric(18,2) as balance_delta,
  (
    abs(coalesce(fr.tender_unclassified_delta,0))<0.01
    and coalesce(p.provisional_entries,0)=0
    and coalesce(u.unclassified_purchase_rows,0)=0
    and coalesce(j.journal_delta,0)<0.01
    and abs(coalesce(bs.balance_delta,0))<0.01
    and coalesce(p4.p4_ready,false)
  ) as ready_to_close,
  concat_ws(' · ',
    case when abs(coalesce(fr.tender_unclassified_delta,0))>=0.01 then 'Tender belum rekonsiliasi' else null end,
    case when coalesce(p.provisional_entries,0)>0 then coalesce(p.provisional_entries,0)::text||' jurnal provisional' else null end,
    case when coalesce(u.unclassified_purchase_rows,0)>0 then coalesce(u.unclassified_purchase_rows,0)::text||' pembelian perlu review' else null end,
    case when coalesce(j.journal_delta,0)>=0.01 then 'Jurnal tidak seimbang' else null end,
    case when abs(coalesce(bs.balance_delta,0))>=0.01 then 'Posisi keuangan tidak seimbang' else null end,
    nullif(p4.p4_blockers,'')
  ) as blockers,
  0::bigint as hpp_missing_recipe_products,
  0::bigint as hpp_recipe_unverified_products,
  0::bigint as hpp_missing_component_cost_products,
  0::bigint as hpp_unmapped_products,
  0::numeric as hpp_uncovered_units,
  0::numeric(18,2) as hpp_uncovered_sales_value,
  coalesce(p4.opening_balance_mode,'unconfirmed') as opening_balance_mode,
  coalesce(p4.accruals_reviewed,false) as accruals_reviewed,
  coalesce(p4.prepaids_reviewed,false) as prepaids_reviewed,
  coalesce(p4.tax_reviewed,false) as tax_reviewed,
  coalesce(p4.draft_adjustments,0)::bigint as draft_adjustments,
  coalesce(p4.unreviewed_investment_candidates,0)::bigint as unreviewed_investment_candidates,
  coalesce(p4.draft_assets,0)::bigint as draft_assets,
  coalesce(p4.depreciation_due_assets,0)::bigint as depreciation_due_assets,
  coalesce(p4.manual_depreciation_assets,0)::bigint as manual_depreciation_assets,
  coalesce(p4.p4_ready,false) as p4_ready
from public.accounting_periods ap
left join public.finance_monthly_reconciliation_v1 fr on fr.brand_id=ap.brand_id and fr.period_month=ap.period_start
left join prov p on p.brand_id=ap.brand_id and p.period_month=ap.period_start
left join unclassified_purchase u on u.brand_id=ap.brand_id and u.period_month=ap.period_start
left join jdelta j on j.brand_id=ap.brand_id and j.period_month=ap.period_start
left join public.finance_balance_sheet_monthly_v1 bs on bs.brand_id=ap.brand_id and bs.period_month=ap.period_start
left join public.finance_p4_period_readiness_v1 p4 on p4.accounting_period_id=ap.id;
alter view public.finance_close_readiness_v1 set (security_invoker=true);
