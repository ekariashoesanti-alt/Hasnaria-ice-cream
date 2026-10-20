-- Add-only reviewed BELANJA re-upload. No DELETE/UPDATE of history, Stock or Finance.
CREATE OR REPLACE FUNCTION public.import_purchase_reviewed_append_v1(
 p_source_period date,p_rows jsonb,p_expected_count integer DEFAULT NULL,p_commit boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $body$
DECLARE
 v_brand uuid:=private.my_brand_id();v_existing int;v_majoo int;v_excel int;
 v_item jsonb;v_raw jsonb;v_key text;v_rowno int;v_q numeric;v_price numeric;v_amount numeric;v_funding numeric;
 v_payment text;v_date date;v_name text;v_found public.offline_purchase_history%ROWTYPE;
 v_unchanged int:=0;v_append int:=0;v_conflicts int:=0;v_delta numeric:=0;
 v_add_rows jsonb:='[]'::jsonb;v_seen_keys text[]:=ARRAY[]::text[];v_seen_rows int[]:=ARRAY[]::integer[];v_file text;
BEGIN
 IF auth.uid() IS NULL OR v_brand IS NULL OR NOT private.same_brand(v_brand)
    OR NOT private.can_import_module('purchasing') THEN
  RAISE EXCEPTION 'Purchase import permission required';
 END IF;
 IF p_source_period IS NULL OR p_source_period<>date_trunc('month',p_source_period::timestamp)::date
    OR p_rows IS NULL OR jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows)=0 OR jsonb_array_length(p_rows)>1000 THEN
  RAISE EXCEPTION 'Invalid BELANJA import period or row count';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtext(v_brand::text),hashtext(p_source_period::text));
 SELECT count(*),count(*) FILTER(WHERE h.raw_data->>'source_sheet'='BELANJA'),
        count(*) FILTER(WHERE h.raw_data->>'source_sheet'<>'BELANJA' OR h.raw_data->>'source_sheet' IS NULL)
 INTO v_existing,v_excel,v_majoo FROM public.offline_purchase_history h
 WHERE h.brand_id=v_brand AND h.source_period=p_source_period;
 IF p_expected_count IS NOT NULL AND p_expected_count<>v_existing THEN
  RAISE EXCEPTION 'Jumlah transaksi berubah dari % menjadi %. Lakukan review ulang.',p_expected_count,v_existing;
 END IF;
 v_file:='BELANJA_REVIEWED_'||to_char(p_source_period,'YYYYMM')||'.xlsx';
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  IF jsonb_typeof(v_item)<>'object' THEN RAISE EXCEPTION 'Format baris BELANJA tidak valid';END IF;
  v_raw:=v_item->'raw_data';v_rowno:=(v_item->>'row_no')::integer;
  v_key:=nullif(btrim(v_raw->>'canonical_source_record_key'),'');
  v_name:=nullif(btrim(v_item->>'item_name'),'');v_date:=(v_item->>'purchase_date')::date;
  v_q:=(v_item->>'quantity_text')::numeric;v_price:=(v_item->>'unit_price')::numeric;
  v_amount:=(v_item->>'total_amount')::numeric;v_payment:=v_item->>'payment_method';
  IF jsonb_typeof(v_raw)<>'object' OR v_rowno IS NULL OR v_rowno<=1
     OR v_key IS NULL OR v_key NOT LIKE 'excel:v3:%' OR v_name IS NULL OR v_date IS NULL
     OR date_trunc('month',v_date::timestamp)::date<>p_source_period
     OR v_q IS NULL OR v_q<=0 OR v_price IS NULL OR v_price<=0 OR v_amount IS NULL OR v_amount<=0
     OR round(v_q*v_price,2)<>v_amount OR v_payment NOT IN ('TUNAI','TRANSFER','PAYLATER')
     OR v_raw->>'source_sheet'<>'BELANJA' OR v_raw->>'source_funding_policy'<>'BELANJA_CxD_vs_EFGH_v1'
     OR jsonb_typeof(v_raw->'funding_breakdown')<>'object'
     OR (v_raw->>'source_row')::integer<>v_rowno
     OR coalesce((v_raw#>>'{funding_breakdown,related_party_loan_jas_hujan}')::numeric,0)<>0
  THEN RAISE EXCEPTION 'BELANJA row % failed validation',v_rowno;END IF;
  IF v_key=ANY(v_seen_keys) OR v_rowno=ANY(v_seen_rows) THEN
   RAISE EXCEPTION 'Duplikat identitas/nomor baris pada file BELANJA';
  END IF;
  v_seen_keys:=array_append(v_seen_keys,v_key);v_seen_rows:=array_append(v_seen_rows,v_rowno);
  IF coalesce((v_raw#>>'{funding_breakdown,cash}')::numeric,0)<0
     OR coalesce((v_raw#>>'{funding_breakdown,bank_mandiri}')::numeric,0)<0
     OR coalesce((v_raw#>>'{funding_breakdown,paylater}')::numeric,0)<0
  THEN RAISE EXCEPTION 'Sumber dana negatif: baris %',v_rowno;END IF;
  v_funding:=coalesce((v_raw#>>'{funding_breakdown,cash}')::numeric,0)
    +coalesce((v_raw#>>'{funding_breakdown,bank_mandiri}')::numeric,0)
    +coalesce((v_raw#>>'{funding_breakdown,paylater}')::numeric,0);
  IF round(v_funding,2)<>v_amount OR
    (CASE WHEN coalesce((v_raw#>>'{funding_breakdown,cash}')::numeric,0)>0 THEN 1 ELSE 0 END
     +CASE WHEN coalesce((v_raw#>>'{funding_breakdown,bank_mandiri}')::numeric,0)>0 THEN 1 ELSE 0 END
     +CASE WHEN coalesce((v_raw#>>'{funding_breakdown,paylater}')::numeric,0)>0 THEN 1 ELSE 0 END)<>1
    OR NOT ((v_payment='TUNAI' AND (v_raw#>>'{funding_breakdown,cash}')::numeric=v_amount)
       OR (v_payment='TRANSFER' AND (v_raw#>>'{funding_breakdown,bank_mandiri}')::numeric=v_amount)
       OR (v_payment='PAYLATER' AND (v_raw#>>'{funding_breakdown,paylater}')::numeric=v_amount))
  THEN RAISE EXCEPTION 'BELANJA row % funding unbalanced or mixed',v_rowno;END IF;
  v_found:=NULL;
  SELECT h.* INTO v_found FROM public.offline_purchase_history h WHERE h.brand_id=v_brand
    AND h.source_period=p_source_period AND h.raw_data->>'source_sheet'='BELANJA'
    AND h.raw_data->>'canonical_source_record_key'=v_key ORDER BY h.created_at LIMIT 1;
  IF NOT FOUND THEN
   SELECT h.* INTO v_found FROM public.offline_purchase_history h WHERE h.brand_id=v_brand
    AND h.source_period=p_source_period AND h.raw_data->>'source_sheet'='BELANJA'
    AND (h.raw_data->>'source_row') ~ '^[0-9]+$'
    AND (h.raw_data->>'source_row')::integer=v_rowno ORDER BY h.created_at LIMIT 1;
  END IF;
  IF FOUND THEN
   IF v_found.item_name=v_name AND v_found.purchase_date=v_date AND v_found.total_amount=v_amount
     AND v_found.unit_price=v_price AND v_found.quantity_text::numeric=v_q AND v_found.payment_method=v_payment THEN
    v_unchanged:=v_unchanged+1;
   ELSE v_conflicts:=v_conflicts+1;END IF;
  ELSE
   v_append:=v_append+1;v_delta:=v_delta+v_amount;v_add_rows:=v_add_rows||jsonb_build_array(v_item);
  END IF;
 END LOOP;
 IF p_commit THEN
  IF p_expected_count IS NULL THEN RAISE EXCEPTION 'Snapshot verifikasi wajib saat menyimpan';END IF;
  IF v_conflicts>0 THEN RAISE EXCEPTION '% baris Excel berbeda dari histori; perlu koreksi manual, bukan overwrite',v_conflicts;END IF;
  IF EXISTS(SELECT 1 FROM public.accounting_periods ap WHERE ap.brand_id=v_brand
    AND ap.status<>'open' AND daterange(ap.period_start,ap.period_end,'[]')
    && daterange(p_source_period,(p_source_period+interval '1 month - 1 day')::date,'[]'))
  THEN RAISE EXCEPTION 'Periode Finance ditutup; append ditolak';END IF;
  INSERT INTO public.offline_purchase_history(brand_id,source_period,source_file,row_no,purchase_date,
    item_name,quantity_text,unit_text,unit_price,total_amount,payment_method,notes,raw_data)
  SELECT v_brand,p_source_period,v_file,x.row_no,x.purchase_date,x.item_name,x.quantity_text,
    x.unit_text,x.unit_price,x.total_amount,x.payment_method,x.notes,
    x.raw_data||jsonb_build_object('reviewed_append_v1',true,'import_scope','BELANJA_ONLY',
                                  'finance_posted',false,'stock_posted',false)
  FROM jsonb_to_recordset(v_add_rows) AS x(row_no integer,purchase_date date,item_name text,
    quantity_text text,unit_text text,unit_price numeric,total_amount numeric,
    payment_method text,notes text,raw_data jsonb);
  IF (SELECT count(*) FROM public.offline_purchase_history h WHERE h.brand_id=v_brand AND h.source_period=p_source_period)<>v_existing+v_append THEN
   RAISE EXCEPTION 'Concurrent import detected; rollback and review again';
  END IF;
 END IF;
 RETURN jsonb_build_object('mode',CASE WHEN p_commit THEN 'REVIEWED_APPEND_COMMITTED' ELSE 'REVIEW_ONLY' END,
  'source_period',p_source_period,'existing_rows',v_existing,'existing_non_excel',v_majoo,
  'existing_excel',v_excel,'incoming_rows',jsonb_array_length(p_rows),
  'unchanged_rows',v_unchanged,'append_rows',v_append,'conflict_rows',v_conflicts,
  'append_amount',v_delta,'can_commit',v_conflicts=0,
  'finance_synced',false,'stock_posted',false,'replaced_rows',0);
END;
$body$;
REVOKE ALL ON FUNCTION public.import_purchase_reviewed_append_v1(date,jsonb,integer,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.import_purchase_reviewed_append_v1(date,jsonb,integer,boolean) TO authenticated,service_role;
COMMENT ON FUNCTION public.import_purchase_reviewed_append_v1(date,jsonb,integer,boolean) IS
 'Authenticated append-only reviewed BELANJA import. Preview or commit; preserves other sources and finance/stock; no overwrite.';
