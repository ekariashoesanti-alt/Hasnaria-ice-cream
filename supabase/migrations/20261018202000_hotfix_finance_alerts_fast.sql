-- HSN-FIN-P0: remove deep, repeated full-period reconciliation views from
-- the high-frequency Finance alert endpoint. All checks remain SELECT-only.
-- Maintain the existing six-column view ABI and existing actionable alert codes.
-- Security: invoker view scoped to the signed-in user's brand (not a definer RPC).
-- Purchase 'canonical_rows' is a DISTINCT source-row count (not the sum of
-- inventory + expense + review buckets, which overlap).
-- Rollback: supabase/rollback/20261018202000_restore_pre_hotfix_finance_alerts.sql
create or replace view public.ui_finance_alerts
with (security_invoker = true)
as
with scope as materialized (
  select private.my_brand_id() as brand_id
), bridge as materialized (
  select b.brand_id,b.period_month,b.source_history_id,b.total_amount,
         b.journal_status,b.expense_account_code
  from public.finance_purchase_expense_bridge_v1 b
  where b.brand_id=(select brand_id from scope)
), latest_purchase as (
  select max(period_month) as period_month from (
    select period_month from bridge
    union all
    select e.period_month
    from public.finance_journal_entries e
    where e.brand_id=(select brand_id from scope) and e.source_type='purchase_expense' and e.status<>'void'
  ) x
), purchase_check as (
  select count(*) as canonical_rows,
    count(*) filter(where b.expense_account_code='6120') as inventory_rows,
    count(*) filter(where b.expense_account_code not in ('6120','1990')) as expense_rows,
    count(*) filter(where b.expense_account_code='1990' or b.journal_status='provisional') as review_rows,
    coalesce(sum(b.total_amount),0::numeric) as canonical_amount,
    count(*) filter(where e.id is null or e.status is distinct from b.journal_status
      or abs(coalesce(l.debit,0::numeric)-b.total_amount)>=0.01) as divergent_rows
  from bridge b cross join latest_purchase p
  left join public.finance_journal_entries e
    on e.brand_id=b.brand_id and e.source_type='purchase_expense'
   and e.source_id=b.source_history_id and e.status<>'void'
  left join public.finance_journal_lines l
    on l.entry_id=e.id and l.line_no=1
  where b.period_month=p.period_month
), purchase_journals as (
  select count(*) as journal_rows,
    count(*) filter(where e.status='provisional') as provisional_entries,
    coalesce(sum(coalesce(l.debit,0::numeric)),0::numeric) as journal_amount
  from public.finance_journal_entries e
  cross join latest_purchase p
  left join public.finance_journal_lines l on l.entry_id=e.id and l.line_no=1
  where e.brand_id=(select brand_id from scope)
    and e.source_type='purchase_expense' and e.status<>'void'
    and e.period_month=p.period_month
), sales_latest as (
  select s.brand_id,s.period_month,s.source_rows,s.source_amount,
         s.journal_rows,s.journal_revenue,s.sync_required
  from public.finance_sales_sync_status_v1 s
  where s.brand_id=(select brand_id from scope)
  order by s.period_month desc limit 1
), admin_source as materialized (
  select a.brand_id,date_trunc('month',a.purchase_date::timestamp)::date as period_month,
         a.purchase_id,a.total_amount
  from public.ui_administration_purchase_v1 a
  where a.brand_id=(select brand_id from scope) and a.purchase_date is not null
), admin_status as (
  select a.period_month,count(*) as source_rows,
         coalesce(sum(a.total_amount),0::numeric) as source_amount,
         count(distinct e.id) as journal_rows,
         coalesce(sum(l.debit),0::numeric) as journal_amount
  from admin_source a
  left join public.finance_journal_entries e
    on e.brand_id=a.brand_id and e.source_type='purchase_expense'
   and e.source_id=a.purchase_id and e.status<>'void'
  left join public.finance_journal_lines l on l.entry_id=e.id and l.line_no=1
  group by a.period_month
  order by a.period_month desc limit 1
)
select 10 as sort_order,'warning'::text as severity,
 'PURCHASE_SYNC_MISMATCH'::text as alert_code,
 'Sinkronisasi Pembelian belum sesuai'::text as title,
 'Data Pembelian canonical dan jurnal Keuangan periode terbaru belum identik.'::text as message,
 'purchase_quality'::text as target_section,
 jsonb_build_object('period_month',p.period_month,'canonical_rows',c.canonical_rows,
                    'journal_rows',j.journal_rows,'inventory_rows',c.inventory_rows,
                    'expense_rows',c.expense_rows,'review_rows',c.review_rows) as metadata
from latest_purchase p cross join purchase_check c cross join purchase_journals j
where p.period_month is not null and
  (c.canonical_rows<>j.journal_rows or c.divergent_rows>0
   or abs(c.canonical_amount-j.journal_amount)>=0.01)
union all
select 20,'warning'::text,'SALES_SYNC_MISMATCH'::text,
 'Sinkronisasi Penjualan belum sesuai'::text,
 'Omzet Penjualan dan jurnal pendapatan Keuangan periode terbaru belum identik.'::text,
 'sales_quality'::text,
 jsonb_build_object('period_month',s.period_month,'source_rows',s.source_rows,
 'journal_rows',s.journal_rows,'source_amount',s.source_amount,'journal_revenue',s.journal_revenue)
from sales_latest s where s.sync_required
union all
select 30,'warning'::text,'ADMIN_SYNC_MISMATCH'::text,
 'Sinkronisasi Administrasi belum sesuai'::text,
 'Transaksi Administrasi dan jurnal Keuangan periode terbaru belum identik.'::text,
 'administration_quality'::text,
 jsonb_build_object('period_month',a.period_month,'source_rows',a.source_rows,
 'journal_rows',a.journal_rows)
from admin_status a
where a.source_rows<>a.journal_rows or abs(a.source_amount-a.journal_amount)>=0.01
union all
select 40,'warning'::text,'PURCHASE_PAYMENT_PROVISIONAL'::text,
 'Sumber pembayaran Pembelian belum final'::text,
 concat(j.provisional_entries,' jurnal Pembelian periode terbaru masih provisional dan perlu pemetaan sumber pembayaran.')::text,
 'purchase_quality'::text,
 jsonb_build_object('period_month',p.period_month,'provisional_entries',j.provisional_entries)
from latest_purchase p cross join purchase_journals j
where j.provisional_entries>0;

grant select on public.ui_finance_alerts to authenticated;
comment on view public.ui_finance_alerts is
 'Lean current-brand, current-period reconciliation alerts. Full historical line-level checks stay in Finance quality reports.';
