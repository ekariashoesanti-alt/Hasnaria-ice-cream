-- HASNARIA stock recovery - Stage 0/1: READ-ONLY reconciliation.
-- Target: Supabase production Hasnaria Project bnnhmtkpdjlgehsvgoda.
-- IMPORTANT: Never auto-post imported purchases or approve draft BOM based on this report.
-- Run in a trusted SQL editor, archive results securely OUTSIDE this repository.
-- Set brand_id and the window dates consistently across queries before reuse.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY;

-- A. Immutable-point-in-time counters from the existing source/ledger views.
WITH scope AS (
 SELECT 'a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'::uuid brand_id
)
SELECT clock_timestamp() AS audited_at,
 (SELECT count(*) FROM public.inventory_items i WHERE i.brand_id=scope.brand_id) AS sku_total,
 (SELECT count(*) FROM public.inventory_stock_reconciliation r WHERE r.brand_id=scope.brand_id AND r.tracking_active) AS sku_tracked,
 (SELECT count(*) FROM public.inventory_stock_reconciliation r WHERE r.brand_id=scope.brand_id AND NOT r.tracking_active) AS sku_untracked,
 (SELECT count(*) FROM public.inventory_stock_reconciliation r WHERE r.brand_id=scope.brand_id AND r.system_qty<0) AS sku_negative,
 (SELECT count(*) FROM public.inventory_movements m WHERE m.brand_id=scope.brand_id) AS ledger_events,
 (SELECT count(*) FROM public.product_recipe_verifications rv WHERE rv.brand_id=scope.brand_id AND rv.status='draft') AS recipe_draft,
 (SELECT count(*) FROM public.product_recipe_verifications rv WHERE rv.brand_id=scope.brand_id AND rv.status='verified') AS recipe_verified
FROM scope;

-- B. Age and coverage: source record dates are not transaction-posting dates.
WITH scope AS (
 SELECT 'a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'::uuid brand_id
)
SELECT 'sales' AS source,count(*) AS rows,max(s.sold_at)::date AS latest_source_date FROM public.sales s,scope WHERE s.brand_id=scope.brand_id
UNION ALL
SELECT 'purchase_import',count(*),max(p.purchase_date)::date FROM public.purchase_inventory_bridge p,scope WHERE p.brand_id=scope.brand_id
UNION ALL
SELECT 'purchase_log',count(*),max(l.purchase_date)::date FROM public.inventory_purchase_log l,scope WHERE l.brand_id=scope.brand_id
UNION ALL
SELECT 'ledger',count(*),max(m.movement_date)::date FROM public.inventory_movements m,scope WHERE m.brand_id=scope.brand_id
UNION ALL
SELECT 'opname',count(*),max(o.opname_date)::date FROM public.inventory_stock_opname o,scope WHERE o.brand_id=scope.brand_id
ORDER BY source;

-- C. Sales: claims of coverage must come from the audit view, not raw sale totals.
SELECT period_month,sale_item_rows,linked_sale_item_rows,unlinked_sale_item_rows,
       no_recipe_rows,unverified_components_rows,eligible_verified_rows,
       awaiting_recipe_approval_rows,sale_consumption_movements
FROM public.ui_stock_sales_link_audit_v1
WHERE brand_id='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'::uuid
  AND period_month>='2026-09-01'::date
ORDER BY period_month DESC;

-- D. Purchases: mutually exclusive statuses, cannot add imported and bridged sources together.
-- READY_NOT_POSTED is NOT proof of physical receipt.
SELECT source_period,backfill_status,count(*) AS source_rows,
       count(*) FILTER(WHERE inventory_item_id IS NOT NULL) AS mapped_sku_rows
FROM public.inventory_purchase_backfill_audit_p5_v1
WHERE brand_id='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'::uuid
  AND source_period>='2026-09-01'::date
GROUP BY source_period,backfill_status
ORDER BY source_period DESC,backfill_status;

-- E. Blocker detail for Owner: keep identity, quantity and UOM separate for review.
-- Source file + row is evidence lineage, not a second stock receipt.
SELECT source_period,purchase_source_id,source_file,row_no,item_name,
       quantity_text,unit_text,inventory_item_id,inventory_qty,
       mapping_status,backfill_status
FROM public.inventory_purchase_backfill_audit_p5_v1
WHERE brand_id='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'::uuid
  AND source_period>='2026-09-01'::date
  AND backfill_status IN ('READY_NOT_POSTED','REVIEW')
ORDER BY source_period DESC,backfill_status,item_name,source_file,row_no
LIMIT 500;

-- F. Detect duplicate ledger event source keys; replays must not post duplicates.
SELECT brand_id,source_key,count(*) AS duplicate_events
FROM public.inventory_movements
WHERE brand_id='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'::uuid
  AND source_key IS NOT NULL
GROUP BY brand_id,source_key HAVING count(*)>1
ORDER BY duplicate_events DESC LIMIT 100;

-- G. Matched receipt log with movement: a healthy purchase trigger only proves
-- agreement AFTER inventory_purchase_log, not completeness of Excel imports.
WITH scope AS (
 SELECT 'a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'::uuid brand_id
)
SELECT count(*) AS purchase_log_rows,
       count(*) FILTER(WHERE m.id IS NULL) AS log_without_receipt_movement
FROM public.inventory_purchase_log l
CROSS JOIN scope
LEFT JOIN public.inventory_movements m
  ON m.brand_id=l.brand_id AND m.reference_type='inventory_purchase_log'
 AND m.reference_id=l.id AND m.movement_type='PURCHASE_RECEIPT'
WHERE l.brand_id=scope.brand_id;

-- H. Date-only opname ambiguity: never apply same-day movements twice.
SELECT r.inventory_item_id,r.item_name,r.unit,r.last_opname_date,
       count(m.id) AS movements_on_opname_day
FROM public.inventory_stock_reconciliation r
JOIN public.inventory_movements m
  ON m.brand_id=r.brand_id AND m.inventory_item_id=r.inventory_item_id
 AND m.movement_date=r.last_opname_date
WHERE r.brand_id='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'::uuid
  AND r.last_opname_date IS NOT NULL
GROUP BY r.inventory_item_id,r.item_name,r.unit,r.last_opname_date
ORDER BY movements_on_opname_day DESC,r.item_name
LIMIT 100;

-- I. Check exact inventory sign: never sum quantities across mixed units.
SELECT movement_type,count(*) AS events,
       count(*) FILTER(WHERE qty_delta<0) AS decreases,
       count(*) FILTER(WHERE qty_delta>0) AS increases,
       max(movement_date) AS last_event_date
FROM public.inventory_movements
WHERE brand_id='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'::uuid
GROUP BY movement_type ORDER BY movement_type;

COMMIT;
