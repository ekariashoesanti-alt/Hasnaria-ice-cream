-- Execute ONLY against Singapore synthetic UAT.
-- Assert that Majoo SKU → BOM simulation reconciles original files, does not
-- convert purchases/units silently, and never opens stock posting privileges.
DO $uat$
DECLARE
  expected_key constant text := 'majoo_20261108_0820';
  n integer; q numeric;
BEGIN
  SELECT COUNT(*) INTO n
  FROM hasnaria_uat.bom_sku_readiness_gate_v2;
  IF n<>54 OR (SELECT SUM(quantity) FROM hasnaria_uat.bom_sku_readiness_gate_v2)<>2604 THEN
    RAISE EXCEPTION 'BOM SKU gate does not cover 54 sold SKU / 2,604 original units';
  END IF;
  IF (SELECT COUNT(*) FROM hasnaria_uat.bom_sku_readiness_gate_v2
      WHERE source_coverage_status='EXPORTED_BOM_UNAPPROVED')<>47
    OR (SELECT SUM(quantity) FROM hasnaria_uat.bom_sku_readiness_gate_v2
      WHERE source_coverage_status='EXPORTED_BOM_UNAPPROVED')<>2300
    OR (SELECT COUNT(*) FROM hasnaria_uat.bom_sku_readiness_gate_v2
      WHERE source_coverage_status='LEGACY_BOM_REVIEW_ONLY')<>7
    OR (SELECT SUM(quantity) FROM hasnaria_uat.bom_sku_readiness_gate_v2
      WHERE source_coverage_status='LEGACY_BOM_REVIEW_ONLY')<>304 THEN
    RAISE EXCEPTION 'BOM coverage regression or unapproved legacy source mixed into exported data';
  END IF;
  IF (SELECT COUNT(*) FROM hasnaria_uat.bom_demand_component_preview_v2)<>138
    OR (SELECT COUNT(DISTINCT product_sku) FROM hasnaria_uat.bom_demand_component_preview_v2)<>47
    OR (SELECT COUNT(DISTINCT ingredient_sku) FROM hasnaria_uat.bom_demand_component_preview_v2)<>55
    OR (SELECT COUNT(*) FROM hasnaria_uat.bom_ingredient_demand_preview_v2)<>55 THEN
    RAISE EXCEPTION 'BOM demand component/ingredient cardinality mismatch';
  END IF;

  IF EXISTS (SELECT 1 FROM hasnaria_uat.bom_demand_component_preview_v2 c
     WHERE c.batch_key<>expected_key OR c.recipe_quantity_per_sale_raw<=0
       OR c.gross_demand_raw_unit<>c.recipe_quantity_per_sale_raw*c.gross_sold_units
       OR c.possible_refund_raw_unit<>c.recipe_quantity_per_sale_raw*c.refunded_sold_units
       OR c.recipe_unit<>c.ingredient_master_unit
       OR NOT c.simulation_only OR c.conversion_verified OR c.recipe_approved
       OR c.stock_posting_allowed) THEN
    RAISE EXCEPTION 'Raw BOM source-unit calculation or approval flag unsafe';
  END IF;
  IF EXISTS (SELECT 1 FROM hasnaria_uat.bom_sku_readiness_gate_v2
     WHERE approved_for_stock OR stock_posting_allowed
       OR (source_coverage_status='LEGACY_BOM_REVIEW_ONLY'
           AND source_bom_component_lines<>0)) THEN
    RAISE EXCEPTION 'Legacy recipes or SKU approval gates permit posting';
  END IF;
  IF EXISTS (SELECT 1 FROM hasnaria_uat.bom_ingredient_demand_preview_v2
     WHERE NOT simulation_only OR conversion_verified OR stock_posting_allowed) THEN
    RAISE EXCEPTION 'Ingredient-level raw demand may affect operational stock';
  END IF;

  IF (SELECT COUNT(*) FROM hasnaria_uat.bom_demand_component_preview_v2
      WHERE safety_gate='PACK_OR_PORTION_CONVERSION_REVIEW')<>17
     OR (SELECT COUNT(*) FROM hasnaria_uat.bom_ingredient_demand_preview_v2
      WHERE pack_or_portion_review)<>6
     OR (SELECT COUNT(DISTINCT recipe_unit) FROM hasnaria_uat.bom_ingredient_demand_preview_v2)<>13 THEN
    RAISE EXCEPTION 'Pack/Porsi risk marker or heterogeneous units changed unexpectedly';
  END IF;

  -- Independent reconciliation to the original raw-demand view for each
  -- ingredient AND source unit; do not sum dimensions with different units.
  IF EXISTS (
    SELECT 1
    FROM hasnaria_uat.raw_bom_demand_preview_v1 old
    FULL JOIN hasnaria_uat.bom_ingredient_demand_preview_v2 new
      ON old.batch_key=new.batch_key AND old.sales_file_sha256=new.sales_file_sha256
       AND old.ingredient_sku=new.ingredient_sku AND old.recipe_unit=new.recipe_unit
    WHERE old.ingredient_sku IS NULL OR new.ingredient_sku IS NULL
       OR old.gross_required_raw_recipe_unit<>new.gross_raw_requirement
       OR old.potential_refunded_raw_recipe_unit<>new.refund_exposure_raw_unit
       OR old.sold_products_using_ingredient<>new.contributing_sku_count
  ) THEN
    RAISE EXCEPTION 'Original raw-demand values do not match audited v2 component totals';
  END IF;

  IF (SELECT gross_raw_requirement FROM hasnaria_uat.bom_ingredient_demand_preview_v2
      WHERE ingredient_sku='#FO19' AND recipe_unit='Pack')<>673
     OR (SELECT gross_raw_requirement FROM hasnaria_uat.bom_ingredient_demand_preview_v2
      WHERE ingredient_sku='#FO09' AND recipe_unit='Pack')<>276
     OR (SELECT gross_raw_requirement FROM hasnaria_uat.bom_ingredient_demand_preview_v2
      WHERE ingredient_sku='#FO20' AND recipe_unit='Gram')<>44775
     OR (SELECT gross_raw_requirement FROM hasnaria_uat.bom_ingredient_demand_preview_v2
      WHERE ingredient_sku='#IC05' AND recipe_unit='Porsi')<>84 THEN
    RAISE EXCEPTION 'High risk BOM raw-unit invariant changed';
  END IF;

  IF has_schema_privilege('anon','hasnaria_uat','USAGE')
      OR has_schema_privilege('authenticated','hasnaria_uat','USAGE')
      OR has_table_privilege('authenticated',
        'hasnaria_uat.bom_demand_component_preview_v2','SELECT')
      OR has_table_privilege('authenticated',
        'hasnaria_uat.bom_ingredient_demand_preview_v2','SELECT')
      OR has_table_privilege('authenticated',
        'hasnaria_uat.bom_sku_readiness_gate_v2','SELECT') THEN
    RAISE EXCEPTION 'BOM simulation UAT private views accidentally exposed';
  END IF;
  IF EXISTS(SELECT 1 FROM public.sales)
      OR EXISTS(SELECT 1 FROM public.sale_items)
      OR EXISTS(SELECT 1 FROM public.inventory_movements) THEN
    RAISE EXCEPTION 'UAT operational sales/stock mutated during source simulation';
  END IF;

  RAISE NOTICE 'October Singapore read-only BOM V2 simulation source integrity: PASS';
END
$uat$;
SELECT 'PASS' AS bom_readonly_simulation_v2;
