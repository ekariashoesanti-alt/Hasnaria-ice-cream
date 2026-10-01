-- Reconcile Finance only against Purchase rows that are eligible for expense posting.
-- Financing/payment candidates stay in the financing review flow to avoid double-counting them as expense.

create or replace view public.finance_purchase_reconciliation_monthly_v1
with (security_invoker=true)
as
with src_all as (
  select x.brand_id,
         x.period_month,
         count(*) filter(where x.stock_status='posted_to_stock') as stock_posted_rows,
         count(*) filter(where x.stock_status='ready_to_stock') as stock_ready_rows,
         count(*) filter(where x.stock_status='stock_review_required') as stock_review_rows,
         count(*) filter(where x.stock_status='not_stock_item') as non_stock_rows,
         count(*) filter(
           where x.stock_status='posted_to_stock'
             and abs(coalesce(x.posted_stock_qty,0)-coalesce(x.source_stock_qty,0))>=0.0001
         ) as stock_qty_mismatch_rows
  from public.finance_purchase_dual_posting_v1 x
  group by x.brand_id,x.period_month
), src_fin as (
  select x.brand_id,
         x.period_month,
         count(*) as purchase_rows,
         coalesce(sum(x.total_amount),0)::numeric(18,2) as purchase_amount,
         coalesce(sum(x.total_amount) filter(where x.expense_category='Beban Administrasi'),0)::numeric(18,2) as admin_expense,
         coalesce(sum(x.total_amount) filter(where x.expense_category='Beban Pemeliharaan'),0)::numeric(18,2) as maintenance_expense,
         coalesce(sum(x.total_amount) filter(where x.expense_category='Beban Bahan Baku'),0)::numeric(18,2) as raw_material_expense,
         coalesce(sum(x.total_amount) filter(where x.expense_category='Beban Kepegawaian'),0)::numeric(18,2) as personnel_expense
  from public.finance_purchase_dual_posting_v1 x
  where x.source_finance_status<>'review_required'
  group by x.brand_id,x.period_month
), j as (
  select e.brand_id,
         e.period_month,
         count(distinct e.id) as journal_rows,
         count(distinct e.id) filter(where e.status='provisional') as provisional_journal_rows,
         coalesce(sum(l.debit),0)::numeric(18,2) as journal_purchase_expense,
         abs(coalesce(sum(l.debit-l.credit),0))::numeric(18,2) as journal_balance_delta
  from public.finance_journal_entries e
  join public.finance_journal_lines l on l.entry_id=e.id
  where e.source_type='purchase_expense'
    and e.status<>'void'
  group by e.brand_id,e.period_month
)
select a.brand_id,
       a.period_month,
       coalesce(f.purchase_rows,0::bigint) as purchase_rows,
       coalesce(f.purchase_amount,0)::numeric(18,2) as purchase_amount,
       coalesce(f.admin_expense,0)::numeric(18,2) as admin_expense,
       coalesce(f.maintenance_expense,0)::numeric(18,2) as maintenance_expense,
       coalesce(f.raw_material_expense,0)::numeric(18,2) as raw_material_expense,
       coalesce(f.personnel_expense,0)::numeric(18,2) as personnel_expense,
       a.stock_posted_rows,
       a.stock_ready_rows,
       a.stock_review_rows,
       a.non_stock_rows,
       a.stock_qty_mismatch_rows,
       coalesce(j.journal_rows,0::bigint) as journal_rows,
       coalesce(j.provisional_journal_rows,0::bigint) as provisional_journal_rows,
       coalesce(j.journal_purchase_expense,0)::numeric(18,2) as journal_purchase_expense,
       (coalesce(j.journal_purchase_expense,0)-coalesce(f.purchase_amount,0))::numeric(18,2) as purchase_journal_delta,
       coalesce(j.journal_balance_delta,0)::numeric(18,2) as journal_balance_delta,
       case
         when coalesce(j.journal_rows,0::bigint)=coalesce(f.purchase_rows,0::bigint)
          and abs(coalesce(j.journal_purchase_expense,0)-coalesce(f.purchase_amount,0))<0.01
          and coalesce(j.journal_balance_delta,0)<0.01
         then 'MATCH'::text
         else 'MISMATCH'::text
       end as finance_link_status,
       case
         when a.stock_review_rows=0 and a.stock_ready_rows=0 and a.stock_qty_mismatch_rows=0
         then 'OK'::text
         else 'REVIEW'::text
       end as stock_link_status
from src_all a
left join src_fin f using(brand_id,period_month)
left join j using(brand_id,period_month);
