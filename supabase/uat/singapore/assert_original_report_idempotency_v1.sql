-- Singapore-only, safe replay of the original October 2026 54-line source.
-- Requires the synthetic UAT Owner fixture and original Majoo report preloaded.
-- BEGIN/ROLLBACK ensures zero persistent test modifications.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','ce794aa5-d2ef-4297-b154-c42e69e423e5',true);

DO $uat$
DECLARE
  v_existing uuid;
  v_rows jsonb;
  v_replay jsonb;
  v_mutated jsonb;
  v_denied boolean := false;
BEGIN
  SELECT id INTO v_existing FROM public.sales_product_report_batches
  WHERE file_sha256='ea801b3a0d2eb33ea135aba187daf04371acb3a49990eccb104b2ea46947f648';
  IF v_existing IS NULL THEN RAISE EXCEPTION 'Missing original Majoo UAT batch'; END IF;
  SELECT jsonb_agg(jsonb_build_object(
    'line_no',l.line_no,'sku',l.source_sku,'name',l.source_product_name,
    'quantity',l.quantity,'sales_amount',trim_scale(l.source_sales_amount),
    'cogs_amount',trim_scale(l.source_hpp_amount),
    'gross_profit',trim_scale(l.source_gross_profit),
    'refund_qty',l.refund_quantity,
    'refund_amount',trim_scale(l.refund_amount),
    'refund_cogs',trim_scale(l.refund_hpp_amount)
  ) ORDER BY l.line_no)
  INTO v_rows FROM public.sales_product_report_lines l WHERE l.batch_id=v_existing;

  IF jsonb_array_length(v_rows)<>54
     OR md5(v_rows::text)<>(
       SELECT payload_fingerprint FROM public.sales_product_report_batches WHERE id=v_existing
     ) THEN RAISE EXCEPTION 'Original source fingerprint mismatched'; END IF;

  SELECT public.stage_sales_product_report_v1(
    'a611dd70-87a1-4b37-8415-266101900001'::uuid,
    'a611dd70-87a1-4b37-8415-266101900002'::uuid,
    '2026-10-01'::date,
    'penjualan_produk_2026_11_08_09_54_52.xlsx',
    'ea801b3a0d2eb33ea135aba187daf04371acb3a49990eccb104b2ea46947f648',
    v_rows
  ) INTO v_replay;
  IF (v_replay->>'reused')::boolean IS DISTINCT FROM true
     OR v_replay->>'batch_id' <> v_existing::text THEN
    RAISE EXCEPTION 'Identical file replay created a new batch: %',v_replay; END IF;

  v_mutated=jsonb_set(v_rows,'{0,quantity}',to_jsonb((v_rows->0->>'quantity')::integer+1),false);
  BEGIN
    PERFORM public.stage_sales_product_report_v1(
      'a611dd70-87a1-4b37-8415-266101900001'::uuid,
      'a611dd70-87a1-4b37-8415-266101900002'::uuid,
      '2026-10-01'::date,
      'penjualan_produk_2026_11_08_09_54_52.xlsx',
      'ea801b3a0d2eb33ea135aba187daf04371acb3a49990eccb104b2ea46947f648',
      v_mutated
    );
  EXCEPTION WHEN others THEN
    v_denied = SQLERRM ILIKE '%collision%' OR SQLERRM ILIKE '%concurrent import%';
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Altered payload with same file hash was not rejected'; END IF;

  IF (SELECT count(*) FROM public.sales_product_report_batches)<>1
     OR (SELECT count(*) FROM public.sales_product_report_lines)<>54
     OR (SELECT sum(quantity) FROM public.sales_product_report_lines)<>2604
     OR (SELECT count(*) FROM public.sales)<>0
     OR (SELECT count(*) FROM public.inventory_movements)<>0 THEN
    RAISE EXCEPTION 'UAT replay altered source or operational tables'; END IF;
  RAISE NOTICE 'PASS: original Majoo replay idempotent, mutated payload rejected, no stock writes';
END;
$uat$;
ROLLBACK;
SELECT 'PASS'::text AS original_majoo_replay_guard;
