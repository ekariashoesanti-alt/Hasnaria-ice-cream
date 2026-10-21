-- Owner Purchase Review: submit a batch of proposed amount corrections safely.
-- This is an audited REQUEST, not a direct mutation of posted purchase/Finance/Stock.
CREATE TABLE IF NOT EXISTS public.purchase_review_amount_requests_v1(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 batch_id uuid NOT NULL,
 brand_id uuid NOT NULL,
 period_month date NOT NULL,
 source_history_id uuid NOT NULL REFERENCES public.offline_purchase_history(id),
 original_amount numeric(18,2) NOT NULL CHECK(original_amount>0),
 proposed_amount numeric(18,2) NOT NULL CHECK(proposed_amount>0 AND proposed_amount<>original_amount),
 status text NOT NULL DEFAULT 'pending_finance_review'
   CHECK(status IN ('pending_finance_review','applied','rejected','cancelled')),
 submitted_by uuid NOT NULL,
 submitted_at timestamptz NOT NULL DEFAULT now(),
 finance_reviewed_at timestamptz,
 finance_review_note text
);
CREATE UNIQUE INDEX IF NOT EXISTS purchase_review_amount_one_pending_v1
 ON public.purchase_review_amount_requests_v1(brand_id,source_history_id)
 WHERE status='pending_finance_review';
CREATE INDEX IF NOT EXISTS purchase_review_amount_period_idx_v1
 ON public.purchase_review_amount_requests_v1(brand_id,period_month,submitted_at DESC);
ALTER TABLE public.purchase_review_amount_requests_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.purchase_review_amount_requests_v1 FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.purchase_review_amount_requests_v1 TO service_role;

CREATE OR REPLACE FUNCTION public.submit_purchase_review_amount_corrections_v1(
 p_period date, p_changes jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 v_brand uuid:=private.owner_stock_review_assert_v1();
 v_batch uuid:=gen_random_uuid();
 v_item jsonb;
 v_id uuid;
 v_old numeric(18,2);
 v_new numeric(18,2);
 v_history public.offline_purchase_history%ROWTYPE;
 v_source record;
 v_count integer:=0;
 v_previous numeric(18,2):=0;
 v_proposed numeric(18,2):=0;
 v_seen uuid[]:=ARRAY[]::uuid[];
BEGIN
 IF p_period IS NULL OR p_period<>date_trunc('month',p_period::timestamp)::date
    OR p_changes IS NULL OR jsonb_typeof(p_changes)<>'array'
    OR jsonb_array_length(p_changes)<1 OR jsonb_array_length(p_changes)>100 THEN
   RAISE EXCEPTION 'Periode atau jumlah koreksi tidak valid (1–100 baris)';
 END IF;
 -- Serialize submission for one brand/period; all rows commit atomically.
 PERFORM pg_advisory_xact_lock(hashtext(v_brand::text),hashtext(p_period::text));
 IF EXISTS(SELECT 1 FROM public.accounting_periods ap
   WHERE ap.brand_id=v_brand AND ap.status<>'open'
   AND p_period BETWEEN date_trunc('month',ap.period_start::timestamp)::date
                    AND date_trunc('month',ap.period_end::timestamp)::date) THEN
   RAISE EXCEPTION 'Periode Finance ditutup; permintaan koreksi ditolak';
 END IF;
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_changes) LOOP
  IF jsonb_typeof(v_item)<>'object' THEN
   RAISE EXCEPTION 'Bentuk koreksi tidak valid';
  END IF;
  v_id:=(v_item->>'source_history_id')::uuid;
  v_old:=(v_item->>'current_amount')::numeric(18,2);
  v_new:=(v_item->>'corrected_amount')::numeric(18,2);
  IF v_id IS NULL OR v_id=ANY(v_seen) OR v_old IS NULL OR v_old<=0
     OR v_new IS NULL OR v_new<=0 OR v_old=v_new
     OR v_new>999999999999.99 THEN
    RAISE EXCEPTION 'Baris koreksi kosong, ganda, atau nominal tidak valid';
  END IF;
  v_seen:=array_append(v_seen,v_id);
  SELECT * INTO v_history FROM public.offline_purchase_history h
   WHERE h.id=v_id AND h.brand_id=v_brand
     AND h.source_period=p_period FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaksi tidak ditemukan pada periode yang dipilih'; END IF;
  IF v_history.total_amount IS DISTINCT FROM v_old THEN
    RAISE EXCEPTION 'Nilai transaksi telah berubah. Muat ulang sebelum Submit';
  END IF;
  SELECT x.source_history_id,x.expense_account_code,x.category_status,x.total_amount
   INTO v_source FROM public.finance_purchase_dual_posting_v1 x
   WHERE x.brand_id=v_brand AND x.source_history_id=v_id
     AND x.period_month=p_period AND
       (x.expense_account_code='1990' OR x.category_status='provisional')
   LIMIT 1;
  IF NOT FOUND OR v_source.total_amount IS DISTINCT FROM v_old THEN
    RAISE EXCEPTION 'Transaksi tidak lagi masuk KPI Review atau nominal berubah';
  END IF;
  IF EXISTS(SELECT 1 FROM public.purchase_review_amount_requests_v1 r
     WHERE r.brand_id=v_brand AND r.source_history_id=v_id
       AND r.status='pending_finance_review') THEN
    RAISE EXCEPTION 'Baris sudah pernah dikirim dan masih menunggu review Finance';
  END IF;
  INSERT INTO public.purchase_review_amount_requests_v1(
    batch_id,brand_id,period_month,source_history_id,
    original_amount,proposed_amount,status,submitted_by)
  VALUES(v_batch,v_brand,p_period,v_id,v_old,v_new,'pending_finance_review',auth.uid());
  v_count:=v_count+1;
  v_previous:=v_previous+v_old;
  v_proposed:=v_proposed+v_new;
 END LOOP;
 RETURN jsonb_build_object('batch_id',v_batch,'submitted_rows',v_count,
   'period',p_period,'old_total',v_previous,'proposed_total',v_proposed,
   'status','pending_finance_review','finance_posted',false,'stock_posted',false);
END;
$fn$;
REVOKE ALL ON FUNCTION public.submit_purchase_review_amount_corrections_v1(date,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_purchase_review_amount_corrections_v1(date,jsonb)
 TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_purchase_review_amount_requests_v1(p_period date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 v_brand uuid:=private.owner_stock_review_assert_v1();
 v_out jsonb;
BEGIN
 IF p_period IS NULL OR p_period<>date_trunc('month',p_period::timestamp)::date
   THEN RAISE EXCEPTION 'Periode review tidak valid'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'source_history_id',r.source_history_id,'original_amount',r.original_amount,
   'proposed_amount',r.proposed_amount,'status',r.status,
   'submitted_at',r.submitted_at,'batch_id',r.batch_id)
   ORDER BY r.submitted_at DESC),'[]'::jsonb)
 INTO v_out FROM public.purchase_review_amount_requests_v1 r
 WHERE r.brand_id=v_brand AND r.period_month=p_period
   AND r.status='pending_finance_review';
 RETURN v_out;
END;
$fn$;
REVOKE ALL ON FUNCTION public.get_purchase_review_amount_requests_v1(date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_purchase_review_amount_requests_v1(date) TO authenticated,service_role;
COMMENT ON TABLE public.purchase_review_amount_requests_v1 IS
 'Audited submitted Owner amount corrections; originals/Finance/Stock remain unchanged until separate controlled approval.';
