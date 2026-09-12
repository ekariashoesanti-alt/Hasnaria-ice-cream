CREATE OR REPLACE VIEW public.inventory_stock_reconciliation
WITH (security_invoker = true)
AS
WITH latest_opname AS (
  SELECT DISTINCT ON (o.brand_id, o.inventory_item_id)
    o.brand_id,
    o.inventory_item_id,
    o.opname_date,
    o.system_qty AS opname_system_qty,
    o.physical_qty,
    o.variance,
    o.created_at
  FROM public.inventory_stock_opname o
  WHERE o.opname_date <= CURRENT_DATE
  ORDER BY o.brand_id, o.inventory_item_id, o.opname_date DESC, o.created_at DESC
),
base AS (
  SELECT
    i.id AS inventory_item_id,
    i.brand_id,
    i.item_name,
    i.category,
    COALESCE(i.unit, 'pcs') AS unit,
    COALESCE(i.min_qty, 0) AS min_qty,
    COALESCE(i.order_qty, 0) AS order_qty,
    COALESCE(lo.opname_date, CURRENT_DATE) AS baseline_date,
    COALESCE(lo.physical_qty, i.opening_qty, 0) AS baseline_qty,
    (lo.opname_date IS NOT NULL) AS tracking_active,
    lo.opname_date AS last_opname_date,
    lo.physical_qty AS last_physical_qty,
    lo.opname_system_qty AS last_opname_system_qty,
    lo.variance AS last_variance
  FROM public.inventory_items i
  LEFT JOIN latest_opname lo
    ON lo.brand_id = i.brand_id
   AND lo.inventory_item_id = i.id
),
effective_recipe AS (
  SELECT r.brand_id, r.product_id, r.inventory_item_id, r.qty_per_sale
  FROM public.inventory_recipe_components r
  WHERE r.active
),
purchase_totals AS (
  SELECT
    b.inventory_item_id,
    CASE WHEN b.tracking_active THEN
      COALESCE(SUM(l.qty) FILTER (
        WHERE l.purchase_date > b.baseline_date
          AND l.purchase_date <= CURRENT_DATE
      ), 0)
    ELSE 0 END AS purchase_qty
  FROM base b
  LEFT JOIN public.inventory_purchase_log l
    ON l.brand_id = b.brand_id
   AND l.inventory_item_id = b.inventory_item_id
  GROUP BY b.inventory_item_id, b.tracking_active
),
sales_totals AS (
  SELECT
    b.inventory_item_id,
    CASE WHEN b.tracking_active THEN
      COALESCE(SUM(CASE WHEN s.id IS NOT NULL THEN si.qty::numeric * er.qty_per_sale ELSE 0 END), 0)
    ELSE 0 END AS sales_usage_qty
  FROM base b
  LEFT JOIN effective_recipe er
    ON er.brand_id = b.brand_id
   AND er.inventory_item_id = b.inventory_item_id
  LEFT JOIN public.sale_items si
    ON si.product_id = er.product_id
  LEFT JOIN public.sales s
    ON s.id = si.sale_id
   AND s.brand_id = b.brand_id
   AND s.sold_at > b.baseline_date
   AND s.sold_at <= CURRENT_DATE
  GROUP BY b.inventory_item_id, b.tracking_active
)
SELECT
  b.brand_id,
  b.inventory_item_id,
  b.item_name,
  b.category,
  b.unit,
  b.min_qty,
  b.order_qty,
  b.baseline_date,
  b.baseline_qty,
  COALESCE(p.purchase_qty, 0) AS purchase_qty,
  COALESCE(st.sales_usage_qty, 0) AS sales_usage_qty,
  b.baseline_qty + COALESCE(p.purchase_qty, 0) - COALESCE(st.sales_usage_qty, 0) AS system_qty,
  b.last_opname_date,
  b.last_physical_qty,
  b.last_opname_system_qty,
  b.last_variance,
  b.tracking_active,
  CASE
    WHEN NOT b.tracking_active THEN 'untracked'
    WHEN b.baseline_qty + COALESCE(p.purchase_qty, 0) - COALESCE(st.sales_usage_qty, 0) <= 0 THEN 'critical'
    WHEN b.min_qty > 0 AND b.baseline_qty + COALESCE(p.purchase_qty, 0) - COALESCE(st.sales_usage_qty, 0) < b.min_qty THEN 'order'
    ELSE 'ok'
  END AS status
FROM base b
LEFT JOIN purchase_totals p ON p.inventory_item_id = b.inventory_item_id
LEFT JOIN sales_totals st ON st.inventory_item_id = b.inventory_item_id;

GRANT SELECT ON public.inventory_stock_reconciliation TO authenticated;

COMMENT ON VIEW public.inventory_stock_reconciliation IS
  'Reconciled stock. Tracking starts after the first physical stock opname. Only movements dated up to CURRENT_DATE affect current stock.';
