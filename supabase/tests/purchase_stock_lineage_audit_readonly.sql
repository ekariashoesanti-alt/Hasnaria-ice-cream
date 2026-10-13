-- HSN-P0 — READ-ONLY integrity diagnostics. Run as a privileged auditor only.
-- No DML, DDL, helper RPCs, journal rebuilds, or stock sync calls.
-- Execute before/after any proposed corrective migration and compare results.
-- Monetary amounts stored in old inventory_purchase_log are audit metadata,
-- NOT additional Purchase expenses or financial variances.

-- 1. Receipts from non-existent Purchase IDs by source month.
select date_trunc('month',l.purchase_date)::date as source_month,
       count(*) as orphan_receipts,
       count(distinct l.inventory_item_id) as affected_skus,
       count(*) filter(where r.tracking_active) as tracked_receipt_rows,
       count(*) filter(where r.last_opname_date is not null and l.purchase_date>r.last_opname_date) as post_opname_rows
from public.inventory_purchase_log l
left join public.offline_purchase_history h
  on h.id=l.source_history_id and h.brand_id=l.brand_id
left join public.inventory_stock_reconciliation r
  on r.brand_id=l.brand_id and r.inventory_item_id=l.inventory_item_id
where l.source_history_id is not null and h.id is null
group by 1 order by 1 desc;

-- 2. Purchase canonical posting readiness; do not auto-post ready_to_stock.
select d.period_month, d.stock_status, count(*) as purchase_rows,
       sum(coalesce(d.total_amount,0)) as purchase_nominal
from public.finance_purchase_dual_posting_v1 d
group by 1,2 order by 1 desc,2;

-- 3. Purchases whose movement qty was accepted despite differing source/stock units.
-- Differences may include equivalent synonyms; only owner-approved conversion resolves them.
select date_trunc('month',l.purchase_date)::date as source_month,
       count(*) filter(where lower(trim(coalesce(l.unit,'')))<>
                             lower(trim(coalesce(i.unit,'')))) as unit_label_mismatch,
       count(*) as receipt_count
from public.inventory_purchase_log l
join public.inventory_items i on i.id=l.inventory_item_id and i.brand_id=l.brand_id
group by 1 order by 1 desc;

-- 4. Journal integrity (posted/provisional/void separate).
with t as (
  select e.id,e.source_type,e.status,
         coalesce(sum(l.debit),0) debit,coalesce(sum(l.credit),0) credit,
         count(l.id) lines
  from public.finance_journal_entries e
  left join public.finance_journal_lines l on l.entry_id=e.id
  group by e.id,e.source_type,e.status
)
select source_type,status,count(*) as entries,
       count(*) filter(where lines=0) as no_lines,
       count(*) filter(where abs(debit-credit)>0.01) as unbalanced
from t group by 1,2 order by 1,2;

-- 5. Stale canonical periods (data freshness, not automatically an ingestion bug).
select 'sales' as dataset,max(sold_at) as max_transaction_date from public.sales
union all
select 'purchases',max(purchase_date) from public.offline_purchase_history;
