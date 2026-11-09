-- Singapore-only post-schema-restore ACL parity fix, verified 2026-10-19.
-- DO NOT add this file to supabase/migrations: it must never run in Tokyo.
-- Run manually against the Hasnaria Singapore STAGING project only.
-- This script does not change tables, rows, policies, function bodies or production.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='25s';
DO $guard$
DECLARE n int;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM staging_guard.environment_identity
   WHERE environment='staging' AND supabase_project_ref='rynnpndtzjwpekbiwiif')
 THEN RAISE EXCEPTION 'BLOCK: not approved Hasnaria Singapore staging'; END IF;
 SELECT count(*) INTO n FROM pg_proc p
   JOIN pg_namespace x ON x.oid=p.pronamespace
   WHERE x.nspname='public' AND p.prosecdef;
 IF n<>22 THEN RAISE EXCEPTION 'BLOCK: expected 22 known SECURITY DEFINER functions, got %',n; END IF;
 IF NOT has_function_privilege('anon','public.staff_stock_opname_history_v1(text,date,date)','EXECUTE')
 THEN RAISE EXCEPTION 'BLOCK: tokenized Staff RPC absent'; END IF;
END $guard$;
DO $acl$
DECLARE rec record; sig text;
BEGIN
 FOR rec IN SELECT p.oid,p.proname,pg_get_function_identity_arguments(p.oid) args
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.prosecdef
 LOOP
   sig:=format('public.%I(%s)',rec.proname,rec.args);
   -- Tokyo allows only this tokenized staff endpoint for anon.
   IF rec.proname<>'staff_stock_opname_history_v1' THEN
     EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon',sig);
   END IF;
   -- Tokyo explicitly permits the two listed authenticated RPCs plus Staff token.
   IF rec.proname NOT IN
     ('staff_stock_opname_history_v1','get_ui_dashboard_pack_v1','import_purchase_empty_period_v1')
   THEN EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated',sig);
   END IF;
 END LOOP;
END $acl$;
-- Tokyo denies SELECT to both roles on this historical definer view.
REVOKE ALL PRIVILEGES ON TABLE public.owner_cashflow_monthly_v2 FROM anon,authenticated;
DO $assert$
DECLARE anon_total int; authenticated_total int;
BEGIN
 SELECT count(*) FILTER (WHERE has_function_privilege('anon',p.oid,'EXECUTE')),
        count(*) FILTER (WHERE has_function_privilege('authenticated',p.oid,'EXECUTE'))
 INTO anon_total,authenticated_total
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prosecdef;
 IF anon_total<>1 OR authenticated_total<>3 THEN
   RAISE EXCEPTION 'ACL mismatch: anon %, auth %',anon_total,authenticated_total;
 END IF;
 IF has_table_privilege('anon','public.owner_cashflow_monthly_v2','SELECT')
 OR has_table_privilege('authenticated','public.owner_cashflow_monthly_v2','SELECT')
 THEN RAISE EXCEPTION 'Definer cashflow view still exposed'; END IF;
 IF NOT has_function_privilege('authenticated','public.import_purchase_empty_period_v1(date,jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'Legitimate purchasing RPC permission missing'; END IF;
END $assert$;
COMMIT;
-- Notes: Tokyo was inspected READ ONLY as ACL reference. This is staging-only.
-- If new functions are added, this script deliberately aborts until reviewed.
