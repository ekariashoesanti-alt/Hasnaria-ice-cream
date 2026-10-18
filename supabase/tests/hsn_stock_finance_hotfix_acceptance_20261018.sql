-- Read-only release acceptance checks, run after applying the hotfix migrations
-- on a disposable staging clone and authenticated Owner/Staff sessions.
-- No source mutations; every failure stops the release.
DO $test$ DECLARE n bigint; BEGIN
 SELECT count(*) INTO n FROM public.inventory_stock_reconciliation r
 JOIN public.inventory_ledger_balance l USING(brand_id,inventory_item_id)
 WHERE r.tracking_active AND abs(r.system_qty-l.ledger_qty)>0.000001;
 IF n<>0 THEN RAISE EXCEPTION 'Stock/ledger mismatch after hotfix: %',n; END IF;
 IF EXISTS(SELECT 1 FROM pg_class c WHERE c.oid IN
   ('public.inventory_stock_reconciliation'::regclass,'public.ui_finance_alerts'::regclass,
    'public.ui_administration_overview_v1'::regclass,'public.ui_administration_category_chart_v1'::regclass)
   AND NOT coalesce(c.reloptions @> array['security_invoker=true']::text[],false))
 THEN RAISE EXCEPTION 'Finance/Stock view security_invoker disabled'; END IF;
END $test$;

-- For a signed-in Owner session with October canonical Purchases and no Finance
-- journals, PURCHASE_SYNC_MISMATCH must remain visible, canonical_rows must be
-- the true DISTINCT source count (never inventory+expense+review overlap).
-- Save authenticated screenshots + response payload as private UAT evidence.
SELECT alert_code,metadata FROM public.ui_finance_alerts ORDER BY sort_order;
SELECT period_month,admin_rows,admin_amount,category_count,sync_ok
FROM public.ui_administration_overview_v1 ORDER BY period_month DESC;
