-- HSN-P0 / DRY RUN. Read-only. Safe for review against Hasnaria live data.
-- Replace the one '2026-09-01' literal to audit a different period.
-- IMPORTANT: only names and monetary values backed by the same stable provenance
-- can be candidates for manual source rebind; matching row_no alone is prohibited.
-- This file intentionally contains NO INSERT, UPDATE, DELETE, or mutation RPC.

-- A. Ledger source lineage with latest physical opname — keep all historical records.
with old_source as (
  select l.brand_id,l.inventory_item_id,l.id,l.source_history_id,l.purchase_date,
         l.source_row_no,l.source_file,l.qty,l.unit,l.total_amount,
         i.item_name,i.unit as stock_unit,
         r.tracking_active,r.last_opname_date,r.system_qty
  from public.inventory_purchase_log l
  join public.inventory_items i on i.id=l.inventory_item_id and i.brand_id=l.brand_id
  left join public.offline_purchase_history h on h.id=l.source_history_id and h.brand_id=l.brand_id
  left join public.inventory_stock_reconciliation r on r.brand_id=l.brand_id and r.inventory_item_id=l.inventory_item_id
  where l.source_history_id is not null and h.id is null
    and l.purchase_date >= date '2026-09-01'
    and l.purchase_date < date '2026-09-01' + interval '1 month'
)
select item_name,stock_unit,
       count(*) as unlinked_receipts,
       sum(qty) as legacy_source_qty_unverified,
       count(*) filter(where lower(btrim(coalesce(unit,'')))<>lower(btrim(coalesce(stock_unit,'')))) as source_unit_disagreements,
       max(system_qty) as current_system_qty,
       max(last_opname_date) as last_opname_date,
       case
         when bool_and(not tracking_active) then 'UNTRACKED_NO_AUTO_REBIND'
         when bool_and(last_opname_date is not null and purchase_date<=last_opname_date)
           then 'BEFORE_LAST_OPNAME_HISTORICAL_REVIEW'
         else 'MIXED_OR_POST_OPNAME_MANUAL_REVIEW'
       end as disposition
from old_source
group by brand_id,inventory_item_id,item_name,stock_unit
order by unlinked_receipts desc,item_name;

-- B. Canonical Purchase Stock posting readiness: no financial posting is changed here.
-- NULL unit in canonical source is a stop sign, including when UI says ready_to_stock.
with canonical as (
  select d.period_month,d.brand_id,d.source_history_id,d.item_name,
         d.total_amount,d.stock_status,d.stock_mapping_status,
         d.inventory_item_id,d.source_stock_unit,d.source_stock_qty,
         i.unit as stock_unit,
         case
           when d.stock_status='not_stock_item' then 'NOT_INVENTORY'
           when d.stock_status='stock_review_required' then 'MANUAL_SKU_REVIEW'
           when d.inventory_item_id is null then 'BLOCK_SKU'
           when d.source_stock_qty is null or d.source_stock_qty<=0 then 'BLOCK_QUANTITY'
           when nullif(btrim(d.source_stock_unit),'') is null then 'BLOCK_SOURCE_UNIT_MISSING'
           when lower(btrim(d.source_stock_unit))=lower(btrim(i.unit)) then 'UNIT_IDENTICAL_CHECK_PACKAGING'
           when exists(
             select 1 from public.inventory_unit_conversions c
              where c.brand_id=d.brand_id
                and c.inventory_item_id=d.inventory_item_id
                and c.status='verified'
                and c.units_per_purchase_unit>0
                and lower(btrim(c.purchase_unit))=lower(btrim(d.source_stock_unit))
                and lower(btrim(c.sale_unit))=lower(btrim(i.unit))
           ) then 'VERIFIED_UNIT_CONVERSION_REVIEW'
           else 'BLOCK_UNIT_CONVERSION_UNVERIFIED'
         end as unit_gate
  from public.finance_purchase_dual_posting_v1 d
  left join public.inventory_items i on i.id=d.inventory_item_id and i.brand_id=d.brand_id
  where d.period_month = date '2026-09-01'
)
select stock_status,unit_gate,count(*) as purchase_rows,sum(total_amount) as purchase_value,
       count(distinct inventory_item_id) as distinct_stock_skus
from canonical group by 1,2 order by 1,2;

-- C. Preview Stock balances using *posted* SALE_CONSUMPTION only,
-- exactly as the new proposed stock-reconciliation view does.
with base as (
  select r.brand_id,r.inventory_item_id,r.item_name,r.unit,
         r.baseline_date,r.baseline_qty,r.purchase_qty,r.system_qty as old_screen_qty,
         l.ledger_qty
  from public.inventory_stock_reconciliation r
  join public.inventory_ledger_balance l on l.brand_id=r.brand_id
                                       and l.inventory_item_id=r.inventory_item_id
  where r.tracking_active
), posted_sales as (
  select b.brand_id,b.inventory_item_id,
         coalesce(sum(-m.qty_delta),0) as verified_sales_usage_qty
  from base b
  left join public.inventory_movements m on m.brand_id=b.brand_id
       and m.inventory_item_id=b.inventory_item_id
       and m.movement_type='SALE_CONSUMPTION'
       and m.movement_date>b.baseline_date
       and m.movement_date<=current_date
  group by b.brand_id,b.inventory_item_id
), before_after as (
  select b.item_name,b.unit,b.old_screen_qty,b.ledger_qty,
         b.baseline_qty+b.purchase_qty-coalesce(p.verified_sales_usage_qty,0) as proposed_qty
  from base b
  left join posted_sales p using(brand_id,inventory_item_id)
)
select item_name,unit,old_screen_qty,proposed_qty,ledger_qty,
       case when old_screen_qty<0 and proposed_qty>=0 then 'NEGATIVE_IS_VIRTUAL_RECIPE_USAGE'
            when proposed_qty<0 then 'NEGATIVE_STILL_NEEDS_RECONCILIATION'
            when abs(old_screen_qty-proposed_qty)>0.000001 then 'BALANCE_CORRECTED_BY_VIEW'
            else 'UNCHANGED' end as outcome
from before_after where abs(old_screen_qty-proposed_qty)>0.000001
                        or old_screen_qty<0
order by outcome,item_name;

-- D. Financial guardrail: totals continue to be sourced from canonical journals.
select month_start,source_rows,source_amount,journal_rows,journal_revenue,sync_required
from (
 select f.period_month as month_start,f.source_rows,f.source_amount,f.journal_rows,
        f.journal_revenue,f.sync_required
 from public.finance_sales_sync_status_v1 f
 where f.period_month=date '2026-09-01'
) x;
