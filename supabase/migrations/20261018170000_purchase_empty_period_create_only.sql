-- P0 Hasnaria: safe canonical BELANJA import with no DELETE/UPDATE and no historical overwrite.
-- Backend is the transaction-boundary for concurrency, even when frontend is stale.
CREATE OR REPLACE FUNCTION public.import_purchase_empty_period_v1(
  p_source_period date, p_rows jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $body$
DECLARE
  v_brand uuid := private.my_brand_id();
  v_inserted integer := 0;
  v_finance jsonb := null;
  v_finance_sync boolean := false;
  v_first date;
  v_last date;
BEGIN
  IF auth.uid() IS NULL OR v_brand IS NULL
     OR NOT private.same_brand(v_brand)
     OR NOT private.can_import_module('purchasing') THEN
    RAISE EXCEPTION 'Purchase import permission required';
  END IF;
  IF p_source_period IS NULL
     OR p_source_period <> date_trunc('month',p_source_period::timestamp)::date
     OR p_rows IS NULL OR jsonb_typeof(p_rows)<>'array'
     OR jsonb_array_length(p_rows)=0 OR jsonb_array_length(p_rows)>1000 THEN
    RAISE EXCEPTION 'Invalid BELANJA import period or row count';
  END IF;
  -- Serialize any concurrent imports for the same brand/month.
  PERFORM pg_advisory_xact_lock(hashtext(v_brand::text),hashtext(p_source_period::text));
  -- Definer sees canonical rows hidden from authenticated RLS (including Majoo).
  IF EXISTS(SELECT 1 FROM public.offline_purchase_history h
    WHERE h.brand_id=v_brand AND h.source_period=p_source_period) THEN
    RAISE EXCEPTION 'Periode % sudah berisi Pembelian. Tidak ada overwrite; review merge diperlukan',p_source_period;
  END IF;
  IF EXISTS(SELECT 1 FROM public.accounting_periods ap
    WHERE ap.brand_id=v_brand AND ap.status<>'open'
    AND daterange(ap.period_start,ap.period_end,'[]')
        && daterange(p_source_period,(p_source_period+interval '1 month - 1 day')::date,'[]')) THEN
    RAISE EXCEPTION 'Finance period is closed or not open';
  END IF;
  -- All row/content validations run before the first write.
  IF EXISTS(
    SELECT 1 FROM jsonb_to_recordset(p_rows) AS x(
       source_file text,row_no integer,purchase_date date,item_name text,
       quantity_text text,unit_text text,unit_price numeric,total_amount numeric,
       payment_method text,notes text,raw_data jsonb
    )
    WHERE x.row_no IS NULL OR x.row_no<=0 OR nullif(btrim(x.item_name),'') IS NULL
       OR nullif(btrim(x.source_file),'') IS NULL
       OR x.purchase_date IS NULL
       OR date_trunc('month',x.purchase_date::timestamp)::date<>p_source_period
       OR x.unit_price IS NULL OR x.unit_price<=0 OR x.total_amount IS NULL OR x.total_amount<=0
       OR nullif(btrim(x.quantity_text),'') IS NULL
       OR x.quantity_text !~ '^[0-9]+(\.[0-9]+)?$'
       OR x.quantity_text::numeric<=0
       OR round(x.quantity_text::numeric*x.unit_price,2)<>x.total_amount
       OR x.payment_method NOT IN ('TUNAI','TRANSFER','PAYLATER')
       OR jsonb_typeof(x.raw_data)<>'object'
       OR coalesce(x.raw_data->>'source_sheet','')<>'BELANJA'
       OR coalesce(x.raw_data->>'source_funding_policy','')<>'BELANJA_CxD_vs_EFGH_v1'
       OR nullif(x.raw_data->>'canonical_source_record_key','') IS NULL
       OR jsonb_typeof(x.raw_data->'funding_breakdown')<>'object'
       OR coalesce((x.raw_data#>>'{funding_breakdown,cash}')::numeric,0)<0
       OR coalesce((x.raw_data#>>'{funding_breakdown,bank_mandiri}')::numeric,0)<0
       OR coalesce((x.raw_data#>>'{funding_breakdown,paylater}')::numeric,0)<0
       OR coalesce((x.raw_data#>>'{funding_breakdown,related_party_loan_jas_hujan}')::numeric,0)<>0
       OR round(
          coalesce((x.raw_data#>>'{funding_breakdown,cash}')::numeric,0)+
          coalesce((x.raw_data#>>'{funding_breakdown,bank_mandiri}')::numeric,0)+
          coalesce((x.raw_data#>>'{funding_breakdown,paylater}')::numeric,0),2
        )<>x.total_amount
       OR (
        (CASE WHEN coalesce((x.raw_data#>>'{funding_breakdown,cash}')::numeric,0)>0 THEN 1 ELSE 0 END)+
        (CASE WHEN coalesce((x.raw_data#>>'{funding_breakdown,bank_mandiri}')::numeric,0)>0 THEN 1 ELSE 0 END)+
        (CASE WHEN coalesce((x.raw_data#>>'{funding_breakdown,paylater}')::numeric,0)>0 THEN 1 ELSE 0 END)
        )<>1
       OR NOT (
         (x.payment_method='TUNAI' AND (x.raw_data#>>'{funding_breakdown,cash}')::numeric=x.total_amount)
         OR (x.payment_method='TRANSFER' AND (x.raw_data#>>'{funding_breakdown,bank_mandiri}')::numeric=x.total_amount)
         OR (x.payment_method='PAYLATER' AND (x.raw_data#>>'{funding_breakdown,paylater}')::numeric=x.total_amount)
       )
  ) THEN RAISE EXCEPTION 'BELANJA invalid: C×D, period, source lineage, or funding breakdown mismatch'; END IF;
  IF EXISTS(
    SELECT 1 FROM jsonb_to_recordset(p_rows) x(row_no integer,raw_data jsonb)
    GROUP BY x.row_no HAVING count(*)>1
  ) OR EXISTS(
    SELECT 1 FROM jsonb_to_recordset(p_rows) x(row_no integer,raw_data jsonb)
    GROUP BY x.raw_data->>'canonical_source_record_key' HAVING count(*)>1
  ) THEN RAISE EXCEPTION 'Duplicate BELANJA rows or source identity'; END IF;

  SELECT min(purchase_date),max(purchase_date) INTO v_first,v_last
    FROM jsonb_to_recordset(p_rows) AS x(purchase_date date);

  INSERT INTO public.offline_purchase_history(
    brand_id,source_period,source_file,row_no,purchase_date,item_name,
    quantity_text,unit_text,unit_price,total_amount,payment_method,notes,raw_data
  )
  SELECT v_brand,p_source_period,x.source_file,x.row_no,x.purchase_date,x.item_name,
    x.quantity_text,x.unit_text,x.unit_price,x.total_amount,x.payment_method,x.notes,x.raw_data
  FROM jsonb_to_recordset(p_rows) AS x(
     source_file text,row_no integer,purchase_date date,item_name text,
     quantity_text text,unit_text text,unit_price numeric,total_amount numeric,
     payment_method text,notes text,raw_data jsonb
  ) ORDER BY x.row_no;
  GET DIAGNOSTICS v_inserted=ROW_COUNT;

  SELECT EXISTS(SELECT 1 FROM public.accounting_periods ap
    WHERE ap.brand_id=v_brand AND ap.status='open'
    AND daterange(ap.period_start,ap.period_end,'[]') && daterange(v_first,v_last,'[]'))
   INTO v_finance_sync;
  IF v_finance_sync THEN
    v_finance:=private.reconcile_purchase_classification_v2(v_brand,v_first,v_last);
  END IF;
  RETURN jsonb_build_object(
    'source_period',p_source_period,'inserted_rows',v_inserted,
    'finance_synced',v_finance_sync,'finance',v_finance,
    'mode','CREATE_ONLY_ATOMIC','replaced_rows',0
  );
END;
$body$;

REVOKE ALL ON FUNCTION public.import_purchase_empty_period_v1(date,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.import_purchase_empty_period_v1(date,jsonb) TO authenticated,service_role;
-- Eliminate previously exposed DELETE-then-INSERT canonical overwrite RPC.
REVOKE ALL ON FUNCTION public.replace_purchase_canonical_period_v1(date,jsonb)
  FROM PUBLIC,anon,authenticated;
COMMENT ON FUNCTION public.import_purchase_empty_period_v1(date,jsonb) IS
 'Owner/stock-writer atomic create-only BELANJA import, with serialized empty-period guard, C×D and funding proof. Not a historical merge, no mixed tender; Finance only syncs existing open period.';
