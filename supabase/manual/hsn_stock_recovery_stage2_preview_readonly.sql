-- HASNARIA HSN-2A-2B · OWNER REVIEW / DRY-RUN (READ ONLY)
-- Supabase Hasnaria Production. No CALL/RPC posting, no approvals or mutations.
-- Never treat imported purchase quantity as an actual physical receipt without evidence.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY;

-- A. October purchase backlog. Source unit is frequently empty; do NOT assume
-- a purchase quantity is expressed in the inventory master's base unit.
SELECT p.source_period,p.purchase_date,p.purchase_source_id,p.source_file,p.row_no,
       p.item_name,p.quantity_text,p.unit_text AS source_unit,
       p.inventory_item_id,i.item_name AS matched_sku,i.unit AS stock_unit,
       p.inventory_qty,p.mapping_status,p.backfill_status,
       CASE WHEN nullif(btrim(coalesce(p.unit_text,'')),'') IS NULL
            THEN 'SOURCE_UNIT_MISSING' ELSE 'RECHECK_CONVERSION' END AS unit_gate,
       CASE WHEN p.backfill_status='READY_NOT_POSTED' THEN 'RECEIPT_EVIDENCE_AND_UNIT_REQUIRED'
            WHEN p.backfill_status='REVIEW' THEN 'OWNER_MAPPING_OR_CONVERSION_REQUIRED'
            WHEN p.backfill_status='NON_STOCK' THEN 'EXCLUDE_FROM_STOCK'
            ELSE 'VERIFY_PRIOR_LEDGER_SOURCE' END AS next_action
FROM public.inventory_purchase_backfill_audit_p5_v1 p
LEFT JOIN public.inventory_items i
  ON i.id=p.inventory_item_id AND i.brand_id=p.brand_id
WHERE p.brand_id='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'::uuid
  AND p.source_period IN ('2026-09-01'::date,'2026-10-01'::date)
ORDER BY p.source_period DESC,
         CASE p.backfill_status WHEN 'READY_NOT_POSTED' THEN 0
              WHEN 'REVIEW' THEN 1 WHEN 'NON_STOCK' THEN 2 ELSE 3 END,
         p.purchase_date,p.item_name,p.row_no
LIMIT 500;

-- B. Purchase status and missing unit gate. These counts represent source rows,
-- not quantities or currency, and do not imply received inventory.
SELECT p.source_period,p.backfill_status,count(*) AS source_rows,
       count(*) FILTER(WHERE nullif(btrim(coalesce(p.unit_text,'')),'') IS NULL) AS source_unit_missing,
       count(*) FILTER(WHERE p.inventory_item_id IS NOT NULL) AS has_mapped_sku
FROM public.inventory_purchase_backfill_audit_p5_v1 p
WHERE p.brand_id='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'::uuid
  AND p.source_period IN ('2026-09-01'::date,'2026-10-01'::date)
GROUP BY p.source_period,p.backfill_status
ORDER BY p.source_period DESC,p.backfill_status;

-- C. Recipe priority from October sales. This VIEW already scopes per product
-- and does not post SALE_CONSUMPTION. 'Eligible' still needs effective-date proof.
SELECT r.product_name,r.sale_item_rows,r.sold_units,r.active_components,
       r.verified_components,r.pending_components,r.recipe_status,
       r.review_state,r.effective_from
FROM public.ui_stock_recipe_review_v1 r
WHERE r.brand_id='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'::uuid
  AND r.period_month='2026-10-01'::date
ORDER BY r.sale_item_rows DESC,r.product_name ASC LIMIT 100;

-- D. Raw uploaded recipe evidence is unapproved. Original units are shown,
-- not silently converted (e.g. pack, buah, pcs, gram, ml).
SELECT l.source_product_name,l.source_sku,l.source_ingredient_name,
       l.source_ingredient_sku,l.source_quantity,l.source_unit,b.status AS batch_status,
       CASE WHEN l.source_quantity<=0 OR l.source_quantity IS NULL THEN 'QUANTITY_REVIEW'
            WHEN nullif(btrim(coalesce(l.source_unit,'')),'') IS NULL THEN 'SOURCE_UNIT_MISSING'
            ELSE 'MANUAL_SKU_AND_UOM_REVIEW' END AS review_gate
FROM public.recipe_import_lines_v1 l
JOIN public.recipe_import_batches_v1 b ON b.id=l.batch_id
WHERE b.brand_id='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'::uuid
ORDER BY l.source_product_name,l.line_no LIMIT 250;

-- E. Product source name matching is not the same thing as BOM verification.
WITH imported_products AS (
 SELECT DISTINCT lower(btrim(l.source_product_name)) AS source_name
 FROM public.recipe_import_lines_v1 l
 JOIN public.recipe_import_batches_v1 b ON b.id=l.batch_id
 WHERE b.brand_id='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'::uuid
)
SELECT coalesce(rv.status,'NO_PRODUCT_VERIFICATION') AS approval_state,
       count(*) AS source_product_names
FROM imported_products src
LEFT JOIN public.products p
  ON lower(btrim(p.name))=src.source_name
 AND p.brand_id='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'::uuid
LEFT JOIN public.product_recipe_verifications rv
  ON rv.product_id=p.id
GROUP BY coalesce(rv.status,'NO_PRODUCT_VERIFICATION');

-- F. Unit conversions are a separate gate, not automatically trusted on sale.
SELECT status,count(*) AS conversion_rows
FROM public.inventory_unit_conversions
WHERE brand_id='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'::uuid
GROUP BY status ORDER BY status;

COMMIT;
