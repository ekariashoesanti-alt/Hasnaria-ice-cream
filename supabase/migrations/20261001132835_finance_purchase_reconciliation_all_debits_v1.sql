-- Reconcile Purchase to Finance using the full debit side of each purchase_expense journal.
-- This includes valid operational purchase accounts beyond the four headline management categories.

create or replace view public.finance_purchase_reconciliation_monthly_v1
with (security_invoker=true)
as
with src as (
  select x.brand_id,
         x.period_month,
         count(*) as purchase_rows,
         coalesce(sum(x.total_amount),0)::numeric(18,2) as purchase_amount,
         coalesce(sum(x.total_amount) filter(where x.expense_category='Beban Administrasi'),0)::numeric(18,2) as admin_expense,
         coalesce(sum(x.total_amount) filter(where x.expense_category='Beban Pemeliharaan'),0)::numeric(18,2) as maintenance_expense,
         coalesce(sum(x.total_amount) filter(where x.expense_category='Beban Bahan Baku'),0)::numeric(18,2) as raw_material_expense,
         coalesce(sum(x.total_amount) filter(where x.expense_category='Beban Kepegawaian'),0)::numeric(18,2) as personnel_expense,
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
select s.brand_id,
       s.period_month,
       s.purchase_rows,
       s.purchase_amount,
       s.admin_expense,
       s.maintenance_expense,
       s.raw_material_expense,
       s.personnel_expense,
       s.stock_posted_rows,
       s.stock_ready_rows,
       s.stock_review_rows,
       s.non_stock_rows,
       s.stock_qty_mismatch_rows,
       coalesce(j.journal_rows,0::bigint) as journal_rows,
       coalesce(j.provisional_journal_rows,0::bigint) as provisional_journal_rows,
       coalesce(j.journal_purchase_expense,0)::numeric(18,2) as journal_purchase_expense,
       (coalesce(j.journal_purchase_expense,0)-s.purchase_amount)::numeric(18,2) as purchase_journal_delta,
       coalesce(j.journal_balance_delta,0)::numeric(18,2) as journal_balance_delta,
       case
         when coalesce(j.journal_rows,0::bigint)=s.purchase_rows
          and abs(coalesce(j.journal_purchase_expense,0)-s.purchase_amount)<0.01
          and coalesce(j.journal_balance_delta,0)<0.01
         then 'MATCH'::text
         else 'MISMATCH'::text
       end as finance_link_status,
       case
         when s.stock_review_rows=0 and s.stock_ready_rows=0 and s.stock_qty_mismatch_rows=0
         then 'OK'::text
         else 'REVIEW'::text
       end as stock_link_status
from src s
left join j using(brand_id,period_month);
