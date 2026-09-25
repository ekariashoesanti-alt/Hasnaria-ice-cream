-- Transitional Purchase-basis provisional P&L layer.
-- Superseded by the cache-backed implementation in 20260925110049.
create or replace view public.finance_income_statement_provisional_v1
with (security_invoker=true)
as
with purchase_canonical as (
  select
    u.brand_id,
    date_trunc('month',u.effective_date::timestamp)::date as period_month,
    coalesce(sum(u.total_amount) filter(
      where u.accounting_treatment='inventory'
        and u.finance_status in ('posted','provisional')
        and coalesce(u.total_amount,0)>0
    ),0)::numeric(18,2) as inventory_purchase_amount,
    coalesce(sum(u.total_amount) filter(
      where u.accounting_treatment='expense'
        and u.finance_status in ('posted','provisional')
        and coalesce(u.total_amount,0)>0
    ),0)::numeric(18,2) as canonical_purchase_expense,
    count(*) filter(where u.finance_status='review_required')::bigint as purchase_review_rows,
    coalesce(sum(u.total_amount) filter(where u.finance_status='review_required'),0)::numeric(18,2) as purchase_review_amount
  from public.ui_purchase_accounting_v1 u
  group by u.brand_id,date_trunc('month',u.effective_date::timestamp)::date
), journal_purchase_expense as (
  select
    e.brand_id,
    e.period_month,
    coalesce(sum(l.debit-l.credit) filter(
      where a.account_type='EXPENSE'
        and l.account_code not in ('6400','6500')
    ),0)::numeric(18,2) as posted_purchase_expense
  from public.finance_journal_entries e
  join public.finance_journal_lines l on l.entry_id=e.id
  join public.finance_accounts a on a.brand_id=e.brand_id and a.code=l.account_code
  where e.status<>'void' and e.source_type='purchase_expense'
  group by e.brand_id,e.period_month
), months as (
  select brand_id,period_month from public.finance_income_statement_monthly_v1
  union
  select brand_id,period_month from purchase_canonical
), combined as (
  select
    m.brand_id,m.period_month,
    coalesce(f.revenue_sales,0)::numeric(18,2) as revenue_sales,
    coalesce(f.other_income,0)::numeric(18,2) as other_income,
    coalesce(f.cogs,0)::numeric(18,2) as verified_cogs,
    coalesce(f.cogs_coverage_pct,100)::numeric(8,2) as cogs_coverage_pct,
    coalesce(p.inventory_purchase_amount,0)::numeric(18,2) as inventory_purchase_amount,
    coalesce(f.operating_expense,0)::numeric(18,2) as journal_operating_expense,
    coalesce(j.posted_purchase_expense,0)::numeric(18,2) as posted_purchase_expense,
    coalesce(p.canonical_purchase_expense,0)::numeric(18,2) as canonical_purchase_expense,
    coalesce(f.finance_expense,0)::numeric(18,2) as finance_expense,
    coalesce(f.tax_expense,0)::numeric(18,2) as tax_expense,
    coalesce(p.purchase_review_rows,0)::bigint as purchase_review_rows,
    coalesce(p.purchase_review_amount,0)::numeric(18,2) as purchase_review_amount
  from months m
  left join public.finance_income_statement_monthly_v1 f using(brand_id,period_month)
  left join purchase_canonical p using(brand_id,period_month)
  left join journal_purchase_expense j using(brand_id,period_month)
), calc as (
  select c.*,
    (c.journal_operating_expense-c.posted_purchase_expense+c.canonical_purchase_expense)::numeric(18,2) as operating_expense_adjusted,
    case when c.cogs_coverage_pct>=99.99 then c.verified_cogs else c.inventory_purchase_amount end::numeric(18,2) as cogs_display,
    case when c.cogs_coverage_pct>=99.99 then 'verified_hpp'::text else 'purchase_basis_provisional'::text end as pnl_basis
  from combined c
)
select
  brand_id,period_month,revenue_sales,other_income,
  verified_cogs,cogs_coverage_pct,inventory_purchase_amount,
  cogs_display,
  journal_operating_expense,posted_purchase_expense,canonical_purchase_expense,
  operating_expense_adjusted,finance_expense,tax_expense,
  (revenue_sales+other_income-cogs_display)::numeric(18,2) as gross_profit_display,
  (revenue_sales+other_income-cogs_display-operating_expense_adjusted-finance_expense)::numeric(18,2) as profit_before_tax_display,
  (revenue_sales+other_income-cogs_display-operating_expense_adjusted-finance_expense-tax_expense)::numeric(18,2) as profit_after_tax_display,
  purchase_review_rows,purchase_review_amount,pnl_basis,
  (pnl_basis='verified_hpp') as is_final_hpp,
  case
    when pnl_basis='verified_hpp' then 'HPP terverifikasi dari jurnal.'
    else 'HPP sementara memakai pembelian persediaan periode; otomatis diganti ketika HPP resep terverifikasi 100%.'
  end as basis_note
from calc;

grant select on public.finance_income_statement_provisional_v1 to authenticated;
