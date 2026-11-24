-- HSN P0 isolated PostgreSQL migration proof. Execute via psql, not Supabase SQL editor.
-- REQUIRED: restored/synthetic staging DB containing real schema, an active Owner
-- profile, canonical Purchases and journal fixtures. Never against production.
-- psql -X -v ON_ERROR_STOP=1 -f tests/fixtures/hsn-stock-finance-hotfix-dryrun.sql
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30000ms';
CREATE TEMP TABLE hsn_old_admin_chart ON COMMIT DROP AS
 SELECT period_month,category,admin_rows,amount
 FROM public.ui_administration_category_chart_v1;
CREATE TEMP TABLE hsn_old_admin_overview ON COMMIT DROP AS
 SELECT period_month,admin_rows,admin_amount,category_count,sync_ok
 FROM public.ui_administration_overview_v1;

\ir ../../supabase/migrations/20261018201000_hotfix_stock_ledger_balance_parity.sql
\ir ../../supabase/migrations/20261018202000_hotfix_finance_alerts_fast.sql
\ir ../../supabase/migrations/20261018203000_hotfix_administration_report_fast.sql

DO $assert$
DECLARE n bigint; BEGIN
 SELECT count(*) INTO n
 FROM public.inventory_stock_reconciliation r
 JOIN public.inventory_ledger_balance l USING(brand_id,inventory_item_id)
 WHERE r.tracking_active AND abs(r.system_qty-l.ledger_qty)>0.000001;
 IF n<>0 THEN RAISE EXCEPTION 'Post-hotfix SKU parity: % mismatched', n; END IF;
 SELECT count(*) INTO n FROM (
   (SELECT * FROM hsn_old_admin_chart EXCEPT
    SELECT period_month,category,admin_rows,amount
    FROM public.ui_administration_category_chart_v1)
   UNION ALL
   (SELECT period_month,category,admin_rows,amount
    FROM public.ui_administration_category_chart_v1 EXCEPT
    SELECT * FROM hsn_old_admin_chart)
 ) d;
 IF n<>0 THEN RAISE EXCEPTION 'Administration category/value drift: %', n; END IF;
 SELECT count(*) INTO n FROM (
   (SELECT * FROM hsn_old_admin_overview EXCEPT
    SELECT period_month,admin_rows,admin_amount,category_count,sync_ok
    FROM public.ui_administration_overview_v1)
   UNION ALL
   (SELECT period_month,admin_rows,admin_amount,category_count,sync_ok
    FROM public.ui_administration_overview_v1 EXCEPT
    SELECT * FROM hsn_old_admin_overview)
 ) d;
 IF n<>0 THEN RAISE EXCEPTION 'Administration overview drift: %', n; END IF;
 IF has_table_privilege('anon','public.ui_finance_alerts','SELECT') THEN
   RAISE EXCEPTION 'Anonymous Finance alert view access permitted';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE status='active' AND role='owner') THEN
   RAISE EXCEPTION 'No synthetic Owner: cannot claim auth UAT passed';
 END IF;
 RAISE NOTICE 'Schema, Stock parity, Admin category parity and anon grants: PASS';
END $assert$;

-- Simulated authenticated DB role. This does NOT replace real browser login UAT.
SELECT set_config('request.jwt.claim.sub',(
 SELECT id::text FROM public.user_profiles
 WHERE role='owner' AND status='active' ORDER BY id LIMIT 1
),true);
SELECT set_config('request.jwt.claims',
 jsonb_build_object('sub',auth.uid(),'role','authenticated')::text,true);
SET LOCAL ROLE authenticated;
DO $assert$
DECLARE
 v_brand uuid:=private.my_brand_id();
 v_period date;
 v_expected bigint;
 v_journal bigint;
 v_actual bigint;
 v_alert_rows bigint;
BEGIN
 IF v_brand IS NULL THEN RAISE EXCEPTION 'Authenticated brand not available'; END IF;
 SELECT max(period_month) INTO v_period
 FROM public.finance_purchase_expense_bridge_v1 WHERE brand_id=v_brand;
 IF v_period IS NULL THEN RAISE EXCEPTION 'No canonical Purchase fixture; cannot validate alert'; END IF;
 SELECT count(*) INTO v_expected FROM public.finance_purchase_expense_bridge_v1
 WHERE brand_id=v_brand AND period_month=v_period;
 SELECT count(*) INTO v_journal FROM public.finance_journal_entries
 WHERE brand_id=v_brand AND period_month=v_period
 AND source_type='purchase_expense' AND status<>'void';
 SELECT count(*),max((metadata->>'canonical_rows')::bigint)
 INTO v_alert_rows,v_actual
 FROM public.ui_finance_alerts WHERE alert_code='PURCHASE_SYNC_MISMATCH';
 IF v_expected<>v_journal THEN
   IF v_alert_rows<>1 OR v_actual<>v_expected THEN
     RAISE EXCEPTION 'Finance mismatch hidden or miscounted: sources %, journals %, alert %, metadata %',
      v_expected,v_journal,v_alert_rows,v_actual;
   END IF;
 END IF;
 RAISE NOTICE 'Simulated Owner Finance alert: PASS';
END $assert$;
RESET ROLE;

-- Unknown Auth UID must never see cross-brand alerts.
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000000',true);
SELECT set_config('request.jwt.claims',
 '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $assert$
DECLARE n bigint; BEGIN
 SELECT count(*) INTO n FROM public.ui_finance_alerts;
 IF n<>0 THEN RAISE EXCEPTION 'Unowned JWT leaked % Finance alerts',n; END IF;
END $assert$;
RESET ROLE;
ROLLBACK;
\echo 'HSN P0 simulated database acceptance: PASS (all migrations rolled back)'
