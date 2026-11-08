-- Security hardening: protect immutable Majoo monthly source snapshots.
-- Additive follow-up to 20261108093000_dual_source_sales_product_report_staging_v1.sql.
-- NEVER touches canonical sales, daily_metrics, BOM or inventory ledgers.
--
-- Supabase default table privileges can grant authenticated ALL including
-- TRUNCATE; RLS does NOT protect TRUNCATE. Explicitly revoke those privileges.
REVOKE ALL PRIVILEGES ON TABLE public.sales_product_report_batches
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.sales_product_report_lines
  FROM PUBLIC, anon, authenticated;

-- Owner reviews remain RLS-guarded; raw line snapshots remain read-only.
GRANT SELECT, UPDATE ON TABLE public.sales_product_report_batches TO authenticated;
GRANT SELECT ON TABLE public.sales_product_report_lines TO authenticated;

-- Only the atomic importer can create complete batch+line snapshots.
-- It checks JWT authenticated Owner, brand membership and outlet association.
-- Keep the original empty search_path to avoid object-shadowing attacks.
ALTER FUNCTION public.stage_sales_product_report_v1(
  uuid,uuid,date,text,text,jsonb
) SECURITY DEFINER;
ALTER FUNCTION public.stage_sales_product_report_v1(
  uuid,uuid,date,text,text,jsonb
) SET search_path = '';

REVOKE ALL ON FUNCTION public.stage_sales_product_report_v1(
  uuid,uuid,date,text,text,jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage_sales_product_report_v1(
  uuid,uuid,date,text,text,jsonb
) TO authenticated;

-- Fail the migration if ACL still bypasses immutable snapshot protections.
DO $acl$
BEGIN
  IF has_table_privilege('authenticated',
     'public.sales_product_report_batches','TRUNCATE')
     OR has_table_privilege('authenticated',
     'public.sales_product_report_lines','TRUNCATE')
     OR has_table_privilege('authenticated',
     'public.sales_product_report_batches','INSERT')
     OR has_table_privilege('authenticated',
     'public.sales_product_report_lines','INSERT')
     OR has_table_privilege('authenticated',
     'public.sales_product_report_lines','UPDATE')
     OR has_table_privilege('authenticated',
     'public.sales_product_report_lines','DELETE')
     OR has_table_privilege('anon',
     'public.sales_product_report_batches','SELECT')
     OR has_function_privilege('anon',
     'public.stage_sales_product_report_v1(uuid,uuid,date,text,text,jsonb)',
     'EXECUTE') THEN
    RAISE EXCEPTION 'Monthly Majoo source ACL hardening FAILED — transaction rolled back';
  END IF;
END;
$acl$;
