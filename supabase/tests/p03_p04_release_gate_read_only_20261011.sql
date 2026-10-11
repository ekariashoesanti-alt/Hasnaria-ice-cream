-- P0.3 / P0.4 Owner readiness baseline (PRODUCTION READ ONLY).
-- No stock movements, Purchase replacement, import or finance writes.
-- Monthly business date is DISTINCT from month of upload created_at.
-- September 2026 is the P0.3 mapping backlog. October is P0.4 source gap.

-- A. Canonical Purchase September by Stock disposition.
select mapping_status,ready_for_inventory,
 count(*) as source_rows,sum(total_amount) as purchase_value
from public.purchase_inventory_bridge
where source_period=date '2026-09-01'
group by 1,2 order by 1,2;

-- B. September mapped-but-not-posted receipts by physical-opname boundary.
with pending as (
 select b.id,b.total_amount,b.quantity_numeric,b.unit_text,
 case when r.last_opname_date is null then 'NO_PHYSICAL_BASELINE'
      when b.purchase_date<=r.last_opname_date then 'PRE_OR_ON_OPNAME'
      else 'POST_OPNAME' end opname_relation
 from public.purchase_inventory_bridge b
 left join public.inventory_stock_reconciliation r
 on r.brand_id=b.brand_id and r.inventory_item_id=b.inventory_item_id
 where b.source_period=date '2026-09-01'
   and b.ready_for_inventory and b.mapping_status in ('exact_name','inventory_alias')
   and not exists(select 1 from public.inventory_purchase_log l
     where l.brand_id=b.brand_id and l.source_history_id=b.id)
)
select opname_relation,count(*) unposted,
 sum(total_amount) as purchase_value,
 count(*) filter(where nullif(btrim(coalesce(unit_text,'')),'') is null) missing_unit
from pending group by 1 order by 1;

-- C. Owner classification queue before rule creation for 33 unknown/ambiguous.
select mapping_status,item_name,count(*) as rows,sum(total_amount) as nominal
from public.purchase_inventory_bridge
where source_period=date '2026-09-01'
and mapping_status in ('unmatched','ambiguous_inventory_name')
group by 1,2 order by mapping_status,item_name;

-- D. October 2026: provenance by business transaction period.
select 'sales_canonical' as source,
 count(*) as period_rows from public.sales
 where sold_at>=date '2026-10-01' and sold_at<date '2026-11-01'
union all select 'purchase_canonical',count(*) from public.offline_purchase_history
 where purchase_date>=date '2026-10-01' and purchase_date<date '2026-11-01'
union all select 'purchase_invoices',count(*) from public.purchase_import_evidence
 where purchase_date>=date '2026-10-01' and purchase_date<date '2026-11-01'
union all select 'sales_batches',count(*) from public.sales_import_batches
 where period_from<date '2026-11-01' and period_to>=date '2026-10-01'
union all select 'sales_import_jobs',count(*) from public.import_jobs
 where module='sales' and period_from<date '2026-11-01' and period_to>=date '2026-10-01'
union all select 'purchase_import_jobs',count(*) from public.import_jobs
 where module='purchasing' and period_from<date '2026-11-01' and period_to>=date '2026-10-01';

-- E. Batches CREATED in October, classified by their actual BUSINESS period.
select module,status,period_from,period_to,count(*) as jobs,
 sum(coalesce(rows_total,0)) as total_rows,sum(coalesce(rows_posted,0)) as posted_rows
from public.import_jobs
where created_at>=timestamptz '2026-10-01'
  and created_at<timestamptz '2026-11-01'
group by 1,2,3,4 order by module,period_from,status;

-- F. Historical September Sales batch status for context only (not October).
select status,period_from,period_to,count(*) batches,sum(row_count) rows
from public.sales_import_batches
where created_at>=timestamptz '2026-10-01' and
 created_at<timestamptz '2026-11-01'
group by 1,2,3 order by period_from,status;
