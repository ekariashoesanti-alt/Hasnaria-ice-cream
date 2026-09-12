-- Inventory reconciliation v2: system stock = baseline + purchases - sales usage.
-- Physical stock opname is stored separately so variance is auditable.

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS opening_date date,
  ADD COLUMN IF NOT EXISTS opening_qty numeric;

UPDATE public.inventory_items
SET
  opening_date = COALESCE(opening_date, DATE '2026-08-01'),
  opening_qty = COALESCE(
    opening_qty,
    NULLIF(regexp_replace(COALESCE(stock_august, stock_june, ''), '[^0-9.\-]+', '', 'g'), '')::numeric,
    0
  )
WHERE opening_date IS NULL OR opening_qty IS NULL;

ALTER TABLE public.inventory_items
  ALTER COLUMN opening_date SET DEFAULT DATE '2026-08-01',
  ALTER COLUMN opening_qty SET DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.inventory_recipe_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  qty_per_sale numeric NOT NULL DEFAULT 1 CHECK (qty_per_sale > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, inventory_item_id)
);

CREATE INDEX IF NOT EXISTS inventory_recipe_components_brand_idx
  ON public.inventory_recipe_components (brand_id, product_id);
CREATE INDEX IF NOT EXISTS inventory_recipe_components_item_idx
  ON public.inventory_recipe_components (inventory_item_id);

ALTER TABLE public.inventory_recipe_components ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventory_recipe_components_read_same_brand ON public.inventory_recipe_components;
CREATE POLICY inventory_recipe_components_read_same_brand
ON public.inventory_recipe_components FOR SELECT TO authenticated
USING ((SELECT private.same_brand(inventory_recipe_components.brand_id)));

DROP POLICY IF EXISTS inventory_recipe_components_write_role ON public.inventory_recipe_components;
CREATE POLICY inventory_recipe_components_write_role
ON public.inventory_recipe_components FOR ALL TO authenticated
USING (
  (SELECT private.same_brand(inventory_recipe_components.brand_id))
  AND (SELECT private.can_stock_write())
)
WITH CHECK (
  (SELECT private.same_brand(inventory_recipe_components.brand_id))
  AND (SELECT private.can_stock_write())
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_recipe_components TO authenticated;

CREATE TABLE IF NOT EXISTS public.inventory_stock_opname (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  opname_date date NOT NULL DEFAULT CURRENT_DATE,
  system_qty numeric NOT NULL DEFAULT 0,
  physical_qty numeric NOT NULL CHECK (physical_qty >= 0),
  variance numeric GENERATED ALWAYS AS (physical_qty - system_qty) STORED,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, inventory_item_id, opname_date)
);

CREATE INDEX IF NOT EXISTS inventory_stock_opname_brand_date_idx
  ON public.inventory_stock_opname (brand_id, opname_date DESC);
CREATE INDEX IF NOT EXISTS inventory_stock_opname_item_date_idx
  ON public.inventory_stock_opname (inventory_item_id, opname_date DESC, created_at DESC);

ALTER TABLE public.inventory_stock_opname ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventory_stock_opname_read_same_brand ON public.inventory_stock_opname;
CREATE POLICY inventory_stock_opname_read_same_brand
ON public.inventory_stock_opname FOR SELECT TO authenticated
USING ((SELECT private.same_brand(inventory_stock_opname.brand_id)));

DROP POLICY IF EXISTS inventory_stock_opname_write_role ON public.inventory_stock_opname;
CREATE POLICY inventory_stock_opname_write_role
ON public.inventory_stock_opname FOR ALL TO authenticated
USING (
  (SELECT private.same_brand(inventory_stock_opname.brand_id))
  AND (SELECT private.can_stock_write())
)
WITH CHECK (
  (SELECT private.same_brand(inventory_stock_opname.brand_id))
  AND (SELECT private.can_stock_write())
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_stock_opname TO authenticated;

-- Seed only high-confidence composite mappings. Exact-name products are handled automatically in the view.
WITH recipe_seed(product_name, item_name, qty_per_sale) AS (
  VALUES
    ('TOPOKKI ODENG', 'TOPOKKI', 1::numeric),
    ('TOPOKKI ODENG', 'ODENG', 1::numeric),
    ('RABOKKI', 'TOPOKKI', 1::numeric),
    ('RABOKKI', 'MIE KUNING', 1::numeric),
    ('RABOKKI ODENG', 'TOPOKKI', 1::numeric),
    ('RABOKKI ODENG', 'MIE KUNING', 1::numeric),
    ('RABOKKI ODENG', 'ODENG', 1::numeric),
    ('MIE PEDAS', 'MIE KUNING', 1::numeric),
    ('NASI AYAM KATSU', 'AYAM KATSU', 1::numeric),
    ('NASI AYAM KATSU', 'BERAS', 1::numeric),
    ('ODENG GOCHUJANG', 'ODENG', 1::numeric),
    ('ODENG GOCHUJANG', 'SAUS GOCHUJANG', 1::numeric)
)
INSERT INTO public.inventory_recipe_components
  (brand_id, product_id, inventory_item_id, qty_per_sale, active)
SELECT
  p.brand_id,
  p.id,
  i.id,
  rs.qty_per_sale,
  true
FROM recipe_seed rs
JOIN public.products p
  ON p.brand_id = 'a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'::uuid
 AND upper(trim(p.name)) = rs.product_name
JOIN public.inventory_items i
  ON i.brand_id = p.brand_id
 AND upper(trim(i.item_name)) = rs.item_name
ON CONFLICT (product_id, inventory_item_id)
DO UPDATE SET
  qty_per_sale = EXCLUDED.qty_per_sale,
  active = true,
  updated_at = now();

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
    COALESCE(lo.opname_date, i.opening_date, DATE '2026-08-01') AS baseline_date,
    COALESCE(lo.physical_qty, i.opening_qty, 0) AS baseline_qty,
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
  SELECT
    r.brand_id,
    r.product_id,
    r.inventory_item_id,
    r.qty_per_sale
  FROM public.inventory_recipe_components r
  WHERE r.active

  UNION ALL

  SELECT
    p.brand_id,
    p.id AS product_id,
    i.id AS inventory_item_id,
    1::numeric AS qty_per_sale
  FROM public.products p
  JOIN public.inventory_items i
    ON i.brand_id = p.brand_id
   AND regexp_replace(upper(i.item_name), '[^A-Z0-9]+', '', 'g')
       = regexp_replace(upper(p.name), '[^A-Z0-9]+', '', 'g')
  WHERE p.active
    AND p.name NOT LIKE 'HASNARIA_%'
    AND NOT EXISTS (
      SELECT 1
      FROM public.inventory_recipe_components r
      WHERE r.product_id = p.id
        AND r.active
    )
),
purchase_totals AS (
  SELECT
    b.inventory_item_id,
    COALESCE(SUM(l.qty) FILTER (WHERE l.purchase_date > b.baseline_date), 0) AS purchase_qty
  FROM base b
  LEFT JOIN public.inventory_purchase_log l
    ON l.brand_id = b.brand_id
   AND l.inventory_item_id = b.inventory_item_id
  GROUP BY b.inventory_item_id
),
sales_totals AS (
  SELECT
    b.inventory_item_id,
    COALESCE(
      SUM(
        CASE
          WHEN s.id IS NOT NULL THEN si.qty::numeric * er.qty_per_sale
          ELSE 0
        END
      ),
      0
    ) AS sales_usage_qty
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
  GROUP BY b.inventory_item_id
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
  CASE
    WHEN b.baseline_qty + COALESCE(p.purchase_qty, 0) - COALESCE(st.sales_usage_qty, 0) <= 0 THEN 'critical'
    WHEN b.min_qty > 0
      AND b.baseline_qty + COALESCE(p.purchase_qty, 0) - COALESCE(st.sales_usage_qty, 0) < b.min_qty THEN 'order'
    ELSE 'ok'
  END AS status
FROM base b
LEFT JOIN purchase_totals p ON p.inventory_item_id = b.inventory_item_id
LEFT JOIN sales_totals st ON st.inventory_item_id = b.inventory_item_id;

GRANT SELECT ON public.inventory_stock_reconciliation TO authenticated;

COMMENT ON VIEW public.inventory_stock_reconciliation IS
  'Current theoretical stock. Latest physical opname becomes the next baseline; variance remains recorded on inventory_stock_opname.';
