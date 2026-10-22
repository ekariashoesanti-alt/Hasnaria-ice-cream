-- Split Owner authorization wrapper from internal atomic posting so an explicitly
-- authorized one-time DBA settlement may use the SAME validated journal logic.
-- Private function never exposed to anon/authenticated/service_role.
BEGIN;
CREATE OR REPLACE FUNCTION private.apply_purchase_review_internal_v1(p_brand uuid,p_batch uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $apply$
DECLARE
 v_brand uuid:=p_brand;
 v_period date;
 v_end date;
 v_count int;
 v_all int;
 v_purchase_count int;
 v_journal_count int;
 v_total numeric(18,2);
 v_posted_total numeric(18,2);
 v_debit numeric(18,2);
 v_credit numeric(18,2);
 v_bad int;
BEGIN
 IF p_batch IS NULL THEN RAISE EXCEPTION 'Batch koreksi tidak valid'; END IF;
 SELECT count(*),min(period_month),sum(original_amount)
 INTO v_count,v_period,v_total
 FROM public.purchase_review_amount_requests_v1
 WHERE batch_id=p_batch AND brand_id=v_brand;
 IF v_count=0 OR v_period IS NULL THEN RAISE EXCEPTION 'Batch tidak ditemukan untuk Owner ini'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(v_brand::text),hashtext(v_period::text));
 SELECT count(*),count(*) FILTER(WHERE status='applied')
 INTO v_all,v_bad
 FROM public.purchase_review_amount_requests_v1
 WHERE brand_id=v_brand AND batch_id=p_batch;
 IF v_all=v_bad THEN
   RETURN jsonb_build_object('status','applied','applied_rows',v_all,'batch_id',p_batch,'already_applied',true);
 END IF;
 IF EXISTS(
  SELECT 1 FROM public.purchase_review_amount_requests_v1 r
  WHERE r.brand_id=v_brand AND r.batch_id=p_batch AND
   (r.period_month<>v_period OR r.status<>'pending_finance_review'
    OR r.proposed_payment_method<>'PINJAMAN_USAHA_LAIN'
    OR r.proposed_amount<>r.original_amount OR r.original_amount<=0
    OR coalesce(r.original_payment_method,'')<>'BELUM_DIPETAKAN')
 ) THEN RAISE EXCEPTION 'Batch berisi nominal baru, metode selain pinjaman Jas Hujan, atau status tidak valid. Tidak ada jurnal dibuat'; END IF;
 IF EXISTS(
  SELECT 1 FROM public.purchase_review_amount_requests_v1 r
  LEFT JOIN public.offline_purchase_history h
    ON h.id=r.source_history_id AND h.brand_id=r.brand_id
  LEFT JOIN public.finance_purchase_expense_bridge_v1 x
    ON x.source_history_id=r.source_history_id AND x.brand_id=r.brand_id
  WHERE r.brand_id=v_brand AND r.batch_id=p_batch
   AND (h.id IS NULL OR h.source_period<>v_period OR h.payment_method IS DISTINCT FROM r.original_payment_method
    OR h.total_amount IS DISTINCT FROM r.original_amount OR x.source_history_id IS NULL
    OR x.total_amount IS DISTINCT FROM r.original_amount OR x.expense_account_code='1990')
 ) THEN RAISE EXCEPTION 'Snapshot transaksi/sumber tidak lagi cocok; perubahan dibatalkan'; END IF;
 IF EXISTS(SELECT 1 FROM public.accounting_periods ap WHERE ap.brand_id=v_brand
  AND ap.status<>'open' AND daterange(ap.period_start,ap.period_end,'[]')
       && daterange(v_period,(v_period+interval '1 month - 1 day')::date,'[]'))
 THEN RAISE EXCEPTION 'Periode akuntansi ditutup; koreksi ditolak'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.finance_accounts a WHERE a.brand_id=v_brand
   AND a.code='2110' AND a.active AND a.account_type='LIABILITY')
 THEN RAISE EXCEPTION 'Akun utang antarusaha 2110 belum tersedia'; END IF;
 v_end:=(v_period+interval '1 month - 1 day')::date;
 IF EXISTS(SELECT 1 FROM public.finance_journal_entries e WHERE e.brand_id=v_brand
   AND e.entry_date BETWEEN v_period AND v_end AND e.source_type IN ('purchase','purchase_expense')
   AND (NOT e.auto_generated OR e.source_type<>'purchase_expense'))
 THEN RAISE EXCEPTION 'Jurnal pembelian manual/legacy terdeteksi; tidak boleh rebuild otomatis'; END IF;
 SELECT count(*),sum(total_amount) INTO v_purchase_count,v_posted_total
 FROM public.finance_purchase_expense_bridge_v1
 WHERE brand_id=v_brand AND period_month=v_period;
 IF v_purchase_count=0 OR v_purchase_count>1000 OR v_posted_total<=0
 OR EXISTS(SELECT 1 FROM public.finance_purchase_expense_bridge_v1 x WHERE x.brand_id=v_brand
 AND x.period_month=v_period AND (x.journal_status NOT IN ('posted','provisional') OR x.total_amount<=0))
 THEN RAISE EXCEPTION 'Rekonsiliasi periode tidak memenuhi syarat posting'; END IF;
 INSERT INTO public.accounting_periods(brand_id,period_start,period_end,status)
 SELECT v_brand,v_period,v_end,'open'
 WHERE NOT EXISTS(SELECT 1 FROM public.accounting_periods ap WHERE ap.brand_id=v_brand
   AND ap.period_start<=v_end AND ap.period_end>=v_period);
 IF NOT EXISTS(SELECT 1 FROM public.accounting_periods ap WHERE ap.brand_id=v_brand
   AND ap.period_start<=v_period AND ap.period_end>=v_end AND ap.status='open')
 THEN RAISE EXCEPTION 'Periode akuntansi tidak terbuka utuh'; END IF;
 -- The status is changed inside this SQL transaction, making the views resolve
 -- the reviewed funding as 2110; the existing canonical reconciliation then creates
 -- two balanced lines per source. Any mismatch below ROLLS BACK status, period and journals.
 UPDATE public.purchase_review_amount_requests_v1 r
 SET status='applied',finance_reviewed_at=now(),
 finance_review_note='Owner-approved automatic related-party funding; posted using account 2110, canonical source unchanged'
 WHERE r.brand_id=v_brand AND r.batch_id=p_batch AND r.status='pending_finance_review';
 GET DIAGNOSTICS v_bad=ROW_COUNT;
 IF v_bad<>v_count THEN RAISE EXCEPTION 'Batch changed concurrently; posting rolled back'; END IF;
 PERFORM private.reconcile_purchase_classification_internal_v3(v_brand,v_period,v_end);
 SELECT count(*),coalesce(sum(l.debit),0),coalesce(sum(l.credit),0)
 INTO v_journal_count,v_debit,v_credit
 FROM public.finance_journal_entries e
 JOIN public.finance_journal_lines l ON l.entry_id=e.id
 WHERE e.brand_id=v_brand AND e.period_month=v_period AND e.source_type='purchase_expense';
 IF v_journal_count<>v_purchase_count*2 OR v_debit<>v_posted_total OR v_credit<>v_posted_total
 OR EXISTS(SELECT 1 FROM public.finance_journal_entries e
   WHERE e.brand_id=v_brand AND e.period_month=v_period AND e.source_type='purchase_expense'
   AND e.status<>'posted')
 THEN RAISE EXCEPTION 'Jurnal pembelian tidak lengkap/berimbang; semua perubahan dibatalkan'; END IF;
 IF EXISTS(SELECT 1 FROM public.purchase_review_amount_requests_v1 r
  LEFT JOIN public.finance_journal_entries j ON j.brand_id=r.brand_id
    AND j.source_type='purchase_expense' AND j.source_id=r.source_history_id
  LEFT JOIN public.finance_journal_lines l ON l.entry_id=j.id
    AND l.account_code='2110' AND l.credit=r.proposed_amount
  WHERE r.brand_id=v_brand AND r.batch_id=p_batch
    AND (j.id IS NULL OR j.status<>'posted' OR l.entry_id IS NULL))
 THEN RAISE EXCEPTION 'Posting pinjaman Jas Hujan tidak cocok; rollback'; END IF;
 IF EXISTS(SELECT 1 FROM public.finance_purchase_dual_posting_v1 x
  JOIN public.purchase_review_amount_requests_v1 r ON r.source_history_id=x.source_history_id
  WHERE r.brand_id=v_brand AND r.batch_id=p_batch
  AND (x.category_status<>'classified' OR x.counter_account_code<>'2110'))
 THEN RAISE EXCEPTION 'Status Finance belum sinkron; posting rollback'; END IF;
 RETURN jsonb_build_object('status','applied','batch_id',p_batch,'applied_rows',v_count,
   'purchase_journal_rows',v_purchase_count,'total_purchase_posted',v_posted_total,
   'loan_amount_posted',v_total,'debit',v_debit,'credit',v_credit,
   'finance_posted',true,'stock_posted',false,'already_applied',false);
END;
$apply$;
REVOKE ALL ON FUNCTION private.apply_purchase_review_internal_v1(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.apply_purchase_review_owner_v1(p_batch uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $owner$
BEGIN
 RETURN private.apply_purchase_review_internal_v1(private.owner_stock_review_assert_v1(),p_batch);
END;
$owner$;
REVOKE ALL ON FUNCTION public.apply_purchase_review_owner_v1(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apply_purchase_review_owner_v1(uuid) TO authenticated,service_role;
COMMIT;