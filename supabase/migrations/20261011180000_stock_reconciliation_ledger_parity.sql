-- HSN-P0: restore parity between Stock UI reconciliation and the canonical inventory ledger.
-- No business-table INSERT / UPDATE / DELETE; existing sales, purchase, movement and opname
-- rows are preserved. Visible Stock balances change because the source calculation changes.
-- Production baseline 2026-10-11: 14 of 41 tracked SKUs disagree with inventory_ledger_balance.
-- Root cause: the previous view directly deducted all current active recipes, while
-- private.sync_sale_item_inventory_movement only posts verified/effective BOM to the ledger.
-- Using posted SALE_CONSUMPTION rows preserves the verification gate and audit history.
-- Do NOT backfill or automatically verify draft recipes as part of this release.
-- Release gate: in isolated DB, assert inventory_stock_reconciliation.system_qty
-- matches inventory_ledger_balance.ledger_qty per tracked item.
-- Rollback: restore prior view SQL; do NOT edit stock rows to achieve visual parity.

create or replace view public.inventory_stock_reconciliation
with (security_invoker = true)
as
 WITH latest_opname AS (
         SELECT DISTINCT ON (o.brand_id, o.inventory_item_id) o.brand_id,
            o.inventory_item_id,
            o.opname_date,
            o.system_qty AS opname_system_qty,
            o.physical_qty,
            o.variance,
            o.created_at
           FROM inventory_stock_opname o
          WHERE o.opname_date <= CURRENT_DATE
          ORDER BY o.brand_id, o.inventory_item_id, o.opname_date DESC, o.created_at DESC
        ), base AS (
         SELECT i.id AS inventory_item_id,
            i.brand_id,
            i.item_name,
            i.category,
            COALESCE(i.unit, 'pcs'::text) AS unit,
            COALESCE(i.min_qty, 0::numeric) AS min_qty,
            COALESCE(i.order_qty, 0::numeric) AS order_qty,
            COALESCE(lo.opname_date, CURRENT_DATE) AS baseline_date,
            COALESCE(lo.physical_qty, i.opening_qty, 0::numeric) AS baseline_qty,
            lo.opname_date IS NOT NULL AS tracking_active,
            lo.opname_date AS last_opname_date,
            lo.physical_qty AS last_physical_qty,
            lo.opname_system_qty AS last_opname_system_qty,
            lo.variance AS last_variance
           FROM inventory_items i
             LEFT JOIN latest_opname lo ON lo.brand_id = i.brand_id AND lo.inventory_item_id = i.id
        ), tracked_base AS (
         SELECT base.inventory_item_id,
            base.brand_id,
            base.item_name,
            base.category,
            base.unit,
            base.min_qty,
            base.order_qty,
            base.baseline_date,
            base.baseline_qty,
            base.tracking_active,
            base.last_opname_date,
            base.last_physical_qty,
            base.last_opname_system_qty,
            base.last_variance
           FROM base
          WHERE base.tracking_active
        ), purchase_totals AS (
         SELECT b_1.brand_id,
            b_1.inventory_item_id,
            COALESCE(sum(l.qty), 0::numeric) AS purchase_qty
           FROM tracked_base b_1
             LEFT JOIN inventory_purchase_log l ON l.brand_id = b_1.brand_id AND l.inventory_item_id = b_1.inventory_item_id AND l.purchase_date > b_1.baseline_date AND l.purchase_date <= CURRENT_DATE
          GROUP BY b_1.brand_id, b_1.inventory_item_id
        ), sales_totals AS (
         SELECT b_1.brand_id,
            b_1.inventory_item_id,
            COALESCE(sum(-m.qty_delta), 0::numeric) AS sales_usage_qty
           FROM tracked_base b_1
             LEFT JOIN inventory_movements m
               ON m.brand_id = b_1.brand_id
              AND m.inventory_item_id = b_1.inventory_item_id
              AND m.movement_type = 'SALE_CONSUMPTION'::text
              AND m.movement_date > b_1.baseline_date
              AND m.movement_date <= CURRENT_DATE
          GROUP BY b_1.brand_id, b_1.inventory_item_id
        )
 SELECT b.brand_id,
    b.inventory_item_id,
    b.item_name,
    b.category,
    b.unit,
    b.min_qty,
    b.order_qty,
    b.baseline_date,
    b.baseline_qty,
    COALESCE(p.purchase_qty, 0::numeric) AS purchase_qty,
    COALESCE(st.sales_usage_qty, 0::numeric) AS sales_usage_qty,
    b.baseline_qty + COALESCE(p.purchase_qty, 0::numeric) - COALESCE(st.sales_usage_qty, 0::numeric) AS system_qty,
    b.last_opname_date,
    b.last_physical_qty,
    b.last_opname_system_qty,
    b.last_variance,
    b.tracking_active,
        CASE
            WHEN NOT b.tracking_active THEN 'untracked'::text
            WHEN (b.baseline_qty + COALESCE(p.purchase_qty, 0::numeric) - COALESCE(st.sales_usage_qty, 0::numeric)) <= 0::numeric THEN 'critical'::text
            WHEN b.min_qty > 0::numeric AND (b.baseline_qty + COALESCE(p.purchase_qty, 0::numeric) - COALESCE(st.sales_usage_qty, 0::numeric)) < b.min_qty THEN 'order'::text
            ELSE 'ok'::text
        END AS status
   FROM base b
     LEFT JOIN purchase_totals p ON p.brand_id = b.brand_id AND p.inventory_item_id = b.inventory_item_id
     LEFT JOIN sales_totals st ON st.brand_id = b.brand_id AND st.inventory_item_id = b.inventory_item_id;;

grant select on public.inventory_stock_reconciliation to authenticated;

comment on view public.inventory_stock_reconciliation is
  'HSN-P0 Stock balance = last physical opname + purchased receipts after opname - posted SALE_CONSUMPTION after opname; draft BOM never creates virtual stock usage.';
