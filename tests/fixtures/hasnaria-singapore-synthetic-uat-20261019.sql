-- Hasnaria Singapore-only synthetic fixture, 19 October 2026.
-- Manual staging exercise ONLY. Never run on Tokyo or on user data.
-- No Auth users are manufactured in SQL; create Owner/Staff via Supabase Auth Admin.
-- No automatic stock/finance posting; the fictional operational run is draft.
-- A unique brand ID makes all fixtures identifiable for reviewed cleanup.
BEGIN;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '2s';
DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM staging_guard.environment_identity
    WHERE environment = 'staging' AND supabase_project_ref = 'rynnpndtzjwpekbiwiif')
  THEN RAISE EXCEPTION 'BLOCK_NOT_APPROVED_SINGAPORE_STAGING'; END IF;
  IF EXISTS (SELECT 1 FROM public.brands
    WHERE id = 'a611dd70-87a1-4b37-8415-266101900001'::uuid
      AND name <> '[UAT SYNTHETIC] Hasnaria Singapore 2026-10-19')
  THEN RAISE EXCEPTION 'FIXTURE_ID_OCCUPIED'; END IF;
END $guard$;

INSERT INTO public.brands (id, name)
VALUES ('a611dd70-87a1-4b37-8415-266101900001','[UAT SYNTHETIC] Hasnaria Singapore 2026-10-19')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.outlets(id,brand_id,code,name)
VALUES ('a611dd70-87a1-4b37-8415-266101900002','a611dd70-87a1-4b37-8415-266101900001','UAT-SG-19','[UAT SYNTHETIC] Outlet')
ON CONFLICT(id) DO NOTHING;

INSERT INTO public.inventory_items
 (id,brand_id,category,item_name,unit,opening_date,opening_qty,source_period,source_file)
VALUES
 ('a611dd70-87a1-4b37-8415-266101900003','a611dd70-87a1-4b37-8415-266101900001','Makanan','[UAT] Tepung Uji','pcs','2026-10-01',10,'2026-10-01','UAT_SYNTHETIC_ONLY_20261019.xlsx'),
 ('a611dd70-87a1-4b37-8415-266101900004','a611dd70-87a1-4b37-8415-266101900001','Kemasan','[UAT] Cup Uji','pcs','2026-10-01',20,'2026-10-01','UAT_SYNTHETIC_ONLY_20261019.xlsx')
ON CONFLICT(id) DO NOTHING;

INSERT INTO public.operational_runs
 (id,brand_id,run_type,title,scheduled_date,status,procedure_version)
VALUES ('a611dd70-87a1-4b37-8415-266101900005','a611dd70-87a1-4b37-8415-266101900001',
 'stock_opname','[UAT SYNTHETIC] Draft opname tanpa posting','2026-10-19','draft','uat-20261019')
ON CONFLICT(id) DO NOTHING;

INSERT INTO public.operational_run_items
 (id,run_id,item_order,item_key,label,item_type,inventory_item_id,expected_qty)
VALUES
 ('a611dd70-87a1-4b37-8415-266101900006','a611dd70-87a1-4b37-8415-266101900005',1,'UAT-SKU-A','[UAT] Tepung','stock_count','a611dd70-87a1-4b37-8415-266101900003',10),
 ('a611dd70-87a1-4b37-8415-266101900007','a611dd70-87a1-4b37-8415-266101900005',2,'UAT-SKU-B','[UAT] Cup','stock_count','a611dd70-87a1-4b37-8415-266101900004',20)
ON CONFLICT(id) DO NOTHING;

DO $assert$
DECLARE bid uuid:='a611dd70-87a1-4b37-8415-266101900001';
BEGIN
 IF (SELECT count(*) FROM public.outlets WHERE brand_id=bid)<>1
 OR (SELECT count(*) FROM public.inventory_items WHERE brand_id=bid)<>2
 OR (SELECT count(*) FROM public.operational_runs WHERE brand_id=bid AND status='draft')<>1
 OR (SELECT count(*) FROM public.operational_run_items WHERE run_id='a611dd70-87a1-4b37-8415-266101900005')<>2
 THEN RAISE EXCEPTION 'INCOMPLETE_SYNTHETIC_FIXTURE'; END IF;
 IF EXISTS(SELECT 1 FROM public.inventory_movements WHERE brand_id=bid)
 OR EXISTS(SELECT 1 FROM public.finance_journal_entries WHERE brand_id=bid)
 THEN RAISE EXCEPTION 'UNEXPECTED_SYNTHETIC_POSTING'; END IF;
END $assert$;
COMMIT;
-- The initial fixture is intentionally reversible without modifying production.
-- Reviewed cleanup: first verify no approved/posting/UAT Auth accounts exist,
-- then delete ONLY this exact test brand and dependent objects on Singapore.
