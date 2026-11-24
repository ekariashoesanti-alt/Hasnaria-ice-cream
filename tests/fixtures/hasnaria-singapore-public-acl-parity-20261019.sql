-- Singapore-only deterministic public-table/view ACL restore parity.
-- Production Tokyo was queried READ-ONLY on 19 October 2026 to derive these restrictions.
-- This file is intentionally outside supabase/migrations. Never run on Tokyo.
-- Privileges are REMOVED only. No changes to RLS, data, Auth, or application.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='45s';
DO $guards$
DECLARE total_tables bigint; total_views bigint;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM staging_guard.environment_identity
   WHERE environment='staging' AND region='ap-southeast-1'
     AND supabase_project_ref='rynnpndtzjwpekbiwiif')
 THEN RAISE EXCEPTION 'BLOCK: only Hasnaria Singapore staging is allowed'; END IF;
 SELECT count(*) INTO total_tables FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r';
 SELECT count(*) INTO total_views FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='v';
 IF total_tables<>87 OR total_views<>176 THEN
  RAISE EXCEPTION 'BLOCK: schema object count changed: %, %',total_tables,total_views;
 END IF;
END $guards$;
CREATE TEMP TABLE sg_expected_public_acl(object_name text,role_name text,desired_mask integer) ON COMMIT DROP;
INSERT INTO sg_expected_public_acl VALUES
('payroll_lines','anon',0),
('payroll_periods','anon',0),
('operational_runs','anon',0),
('purchase_item_rules','anon',0),
('sale_item_name_rules','anon',0),
('operational_run_items','anon',0),
('attendance_corrections','anon',0),
('inventory_sku_registry','anon',0),
('account_access_registry','anon',0),
('purchase_amount_resolutions','anon',0),
('purchase_quantity_overrides','anon',0),
('inventory_cost_verifications','anon',0),
('product_recipe_verifications','anon',0),
('financing_payment_resolutions','anon',0),
('inventory_purchase_usage_registry','anon',0),
('payroll_lines','authenticated',113),
('payroll_periods','authenticated',113),
('operational_runs','authenticated',1),
('approval_requests','authenticated',113),
('inventory_movements','authenticated',113),
('sale_item_name_rules','authenticated',1),
('operational_run_items','authenticated',1),
('attendance_corrections','authenticated',0),
('account_access_registry','authenticated',0),
('purchase_amount_resolutions','authenticated',1),
('inventory_cost_verifications','authenticated',1),
('product_recipe_verifications','authenticated',7),
('financing_payment_resolutions','authenticated',7),
('ui_hpp_blockers','anon',0),
('ui_owner_alerts','anon',0),
('erp_action_queue','anon',0),
('payroll_lines_v1','anon',0),
('ui_cogs_coverage','anon',0),
('ui_hpp_readiness','anon',0),
('ui_backend_health','anon',0),
('ui_data_freshness','anon',0),
('ui_finance_alerts','anon',0),
('ui_inventory_items','anon',0),
('ui_owner_dashboard','anon',0),
('owner_erp_dashboard','anon',0),
('recipe_review_queue','anon',0),
('ui_cashflow_monthly','anon',0),
('ui_erp_action_queue','anon',0),
('ui_profit_readiness','anon',0),
('ui_recent_erp_audit','anon',0),
('ui_action_summary_v2','anon',0),
('ui_action_summary_v3','anon',0),
('ui_action_summary_v4','anon',0),
('ui_contract_manifest','anon',0),
('erp_readiness_summary','anon',0),
('ui_management_monthly','anon',0),
('owner_cashflow_monthly','anon',0),
('owner_erp_dashboard_v2','anon',0),
('ui_action_capabilities','anon',0),
('ui_cashflow_monthly_v2','anon',0),
('ui_data_quality_alerts','anon',0),
('ui_erp_action_queue_v2','anon',0),
('ui_erp_action_queue_v3','anon',0),
('ui_erp_action_queue_v4','anon',0),
('ui_profit_readiness_v2','anon',0),
('ui_sale_price_coverage','anon',0),
('erp_action_queue_ranked','anon',0),
('purchase_mapping_review','anon',0),
('ui_contract_manifest_v2','anon',0),
('ui_contract_manifest_v3','anon',0),
('ui_contract_manifest_v4','anon',0),
('purchase_expense_staging','anon',0),
('purchase_monthly_summary','anon',0),
('ui_management_monthly_v2','anon',0),
('owner_cashflow_monthly_v2','anon',0),
('product_costing_readiness','anon',0),
('purchase_inventory_bridge','anon',0),
('ui_action_capabilities_v2','anon',0),
('ui_action_capabilities_v3','anon',0),
('ui_action_capabilities_v4','anon',0),
('ui_invalid_quantity_queue','anon',0),
('offline_purchase_canonical','anon',0),
('purchase_master_candidates','anon',0),
('sales_product_data_quality','anon',0),
('ui_financing_payment_queue','anon',0),
('ui_purchase_quality_totals','anon',0),
('ui_sale_item_mapping_queue','anon',0),
('ui_expense_category_options','anon',0),
('ui_purchase_quality_monthly','anon',0),
('ui_manual_input_requirements','anon',0),
('ui_recipe_verification_queue','anon',0),
('ui_selling_price_suggestions','anon',0),
('ui_inventory_conversion_queue','anon',0),
('ui_purchase_quality_totals_v2','anon',0),
('ui_unverified_inventory_queue','anon',0),
('ui_zero_amount_purchase_queue','anon',0),
('purchase_classification_summary','anon',0),
('ui_inventory_baseline_candidate','anon',0),
('ui_manual_input_requirements_v2','anon',0),
('inventory_conversion_review_queue','anon',0),
('purchase_unverified_inventory_queue','anon',0),
('inventory_valuation_verified_summary','anon',0),
('ui_hpp_blockers','authenticated',1),
('ui_owner_alerts','authenticated',1),
('payroll_lines_v1','authenticated',1),
('ui_hpp_readiness','authenticated',1),
('ui_backend_health','authenticated',1),
('ui_data_freshness','authenticated',1),
('ui_inventory_items','authenticated',1),
('ui_owner_dashboard','authenticated',1),
('ui_cashflow_monthly','authenticated',1),
('ui_erp_action_queue','authenticated',1),
('ui_profit_readiness','authenticated',1),
('ui_recent_erp_audit','authenticated',1),
('ui_action_summary_v2','authenticated',1),
('ui_contract_manifest','authenticated',1),
('ui_management_monthly','authenticated',1),
('owner_cashflow_monthly','authenticated',1),
('owner_erp_dashboard_v2','authenticated',1),
('ui_action_capabilities','authenticated',1),
('ui_data_quality_alerts','authenticated',1),
('ui_erp_action_queue_v2','authenticated',1),
('ui_profit_readiness_v2','authenticated',1),
('erp_action_queue_ranked','authenticated',1),
('ui_contract_manifest_v2','authenticated',1),
('ui_contract_manifest_v3','authenticated',1),
('ui_contract_manifest_v4','authenticated',1),
('owner_cashflow_monthly_v2','authenticated',0),
('product_costing_readiness','authenticated',1),
('purchase_inventory_bridge','authenticated',1),
('ui_invalid_quantity_queue','authenticated',1),
('ui_purchase_quality_totals','authenticated',1),
('ui_sale_item_mapping_queue','authenticated',1),
('ui_expense_category_options','authenticated',1),
('ui_purchase_quality_monthly','authenticated',1),
('ui_recipe_verification_queue','authenticated',1),
('ui_selling_price_suggestions','authenticated',1),
('ui_inventory_conversion_queue','authenticated',1),
('ui_purchase_quality_totals_v2','authenticated',1),
('ui_unverified_inventory_queue','authenticated',1),
('ui_zero_amount_purchase_queue','authenticated',1),
('inventory_conversion_review_queue','authenticated',1);
DO $apply$
DECLARE r record; allowed text; perm text; actual_mask integer;
BEGIN
 FOR r IN SELECT * FROM sg_expected_public_acl ORDER BY object_name,role_name LOOP
  IF to_regclass(format('public.%I',r.object_name)) IS NULL THEN
   RAISE EXCEPTION 'BLOCK: required object missing: %',r.object_name; END IF;
  SELECT string_agg(p,', ') INTO allowed FROM unnest(ARRAY[
    CASE WHEN (r.desired_mask & 1)=0 THEN 'SELECT' END,
    CASE WHEN (r.desired_mask & 2)=0 THEN 'INSERT' END,
    CASE WHEN (r.desired_mask & 4)=0 THEN 'UPDATE' END,
    CASE WHEN (r.desired_mask & 8)=0 THEN 'DELETE' END,
    CASE WHEN (r.desired_mask & 16)=0 THEN 'TRUNCATE' END,
    CASE WHEN (r.desired_mask & 32)=0 THEN 'REFERENCES' END,
    CASE WHEN (r.desired_mask & 64)=0 THEN 'TRIGGER' END
  ]) p WHERE p IS NOT NULL;
  EXECUTE format('REVOKE %s ON TABLE public.%I FROM %I',allowed,r.object_name,r.role_name);
  actual_mask :=
    (CASE WHEN has_table_privilege(r.role_name,format('public.%I',r.object_name),'SELECT') THEN 1 ELSE 0 END)+
    (CASE WHEN has_table_privilege(r.role_name,format('public.%I',r.object_name),'INSERT') THEN 2 ELSE 0 END)+
    (CASE WHEN has_table_privilege(r.role_name,format('public.%I',r.object_name),'UPDATE') THEN 4 ELSE 0 END)+
    (CASE WHEN has_table_privilege(r.role_name,format('public.%I',r.object_name),'DELETE') THEN 8 ELSE 0 END)+
    (CASE WHEN has_table_privilege(r.role_name,format('public.%I',r.object_name),'TRUNCATE') THEN 16 ELSE 0 END)+
    (CASE WHEN has_table_privilege(r.role_name,format('public.%I',r.object_name),'REFERENCES') THEN 32 ELSE 0 END)+
    (CASE WHEN has_table_privilege(r.role_name,format('public.%I',r.object_name),'TRIGGER') THEN 64 ELSE 0 END);
  IF actual_mask<>r.desired_mask THEN
    RAISE EXCEPTION 'BLOCK: ACL parity mismatch for %, %',r.role_name,r.object_name;
  END IF;
 END LOOP;
END $apply$;
COMMIT;
-- After a restore, recheck the full public ACL checksum against Tokyo before UAT.
