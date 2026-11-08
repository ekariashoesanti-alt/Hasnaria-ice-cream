-- Singapore-only UAT: atomic new insert still works after default ACL lockdown,
-- while staff/anonymous/direct-table writers cannot bypass the Owner RPC.
-- Every data change is rolled back, including the synthetic new batch.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','ce794aa5-d2ef-4297-b154-c42e69e423e5',true);

DO $uat$
DECLARE
  v_brand uuid := 'a611dd70-87a1-4b37-8415-266101900001';
  v_outlet uuid := 'a611dd70-87a1-4b37-8415-266101900002';
  v_hash text := repeat('c7',32);
  v_hash_denied text := repeat('c8',32);
  v_rows jsonb :=
    '[{"line_no":1,"sku":"FO1","name":"ODENG","quantity":2,"sales_amount":10000,"cogs_amount":4000,"gross_profit":6000,"refund_qty":0,"refund_amount":0,"refund_cogs":0},{"line_no":2,"sku":"F053","name":"Topokki","quantity":3,"sales_amount":30000,"cogs_amount":12000,"gross_profit":18000,"refund_qty":0,"refund_amount":0,"refund_cogs":0}]'::jsonb;
  v_receipt jsonb;
  v_id uuid;
  v_blocked boolean;
BEGIN
  IF has_table_privilege('authenticated','public.sales_product_report_batches','TRUNCATE')
     OR has_table_privilege('authenticated','public.sales_product_report_lines','TRUNCATE')
     OR has_table_privilege('authenticated','public.sales_product_report_batches','INSERT')
     OR has_table_privilege('authenticated','public.sales_product_report_lines','INSERT')
     OR has_table_privilege('anon','public.sales_product_report_batches','SELECT')
     OR has_function_privilege('anon','public.stage_sales_product_report_v1(uuid,uuid,date,text,text,jsonb)','EXECUTE')
     THEN RAISE EXCEPTION 'Source table direct privileges still unsafe'; END IF;

  SELECT public.stage_sales_product_report_v1(
    v_brand,v_outlet,'2026-09-01'::date,
    'SG_UAT_ATOMIC_ONLY.xlsx',v_hash,v_rows
  ) INTO v_receipt;
  IF v_receipt->>'status'<>'under_review'
     OR (v_receipt->>'reused')::boolean IS DISTINCT FROM false
     OR (v_receipt->>'line_count')::integer<>2
     THEN RAISE EXCEPTION 'Owner RPC new batch failed: %',v_receipt; END IF;
  v_id := (v_receipt->>'batch_id')::uuid;
  IF (SELECT count(*) FROM public.sales_product_report_lines WHERE batch_id=v_id)<>2
     THEN RAISE EXCEPTION 'Atomic Owner RPC lost lines'; END IF;

  -- No direct batch creation even by a real Owner.
  v_blocked := false;
  BEGIN
    INSERT INTO public.sales_product_report_batches (
      brand_id,outlet_id,period_month,filename,file_sha256,
      payload_fingerprint,source_row_count)
    VALUES (v_brand,v_outlet,'2026-08-01','BYPASS.xlsx',repeat('a1',32),
       repeat('0',32),1);
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Owner direct INSERT bypassed atomic staging RPC'; END IF;

  -- A non-Owner session cannot invoke the security-definer importer.
  PERFORM set_config('request.jwt.claim.sub','e4991de6-fe9a-466e-b120-e536abe035d7',true);
  v_blocked := false;
  BEGIN
    PERFORM public.stage_sales_product_report_v1(
      v_brand,v_outlet,'2026-09-01'::date,
      'STAFF_SHOULD_BE_DENIED.xlsx',v_hash_denied,v_rows
    );
  EXCEPTION WHEN others THEN
    v_blocked := SQLERRM ILIKE '%Owner permission required%';
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Non-Owner invoked security-definer RPC'; END IF;

  IF EXISTS (SELECT 1 FROM public.sales_product_report_batches WHERE id=v_id)
     THEN RAISE EXCEPTION 'Non-Owner can see Owner UAT batch'; END IF;

  -- The privileged Owner can still read the sealed source; no operational writes.
  PERFORM set_config('request.jwt.claim.sub','ce794aa5-d2ef-4297-b154-c42e69e423e5',true);
  IF NOT EXISTS (SELECT 1 FROM public.sales_product_report_batches WHERE id=v_id AND status='under_review')
     OR (SELECT count(*) FROM public.sales WHERE sold_at>='2026-09-01' AND sold_at<'2026-10-01') <> 0
     OR (SELECT count(*) FROM public.inventory_movements) <> 0
     THEN RAISE EXCEPTION 'Owner visibility or zero-stock-impact invariant failed'; END IF;

  RAISE NOTICE 'PASS: Owner atomic insert, staff denied, direct SQL denied, zero production-style writes';
END;
$uat$;

ROLLBACK;
SELECT 'PASS'::text AS acl_owner_atomic_insert;
