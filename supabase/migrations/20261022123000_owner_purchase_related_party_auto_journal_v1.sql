-- Hasnaria Owner financial settlement. Only explicitly reviewed related-party loan sources
-- are eligible; canonical purchase history and Stock are NEVER rewritten by this migration.
-- Existing view shape retained so downstream dashboard and Finance reports remain consistent.
BEGIN;
DO $guard$
BEGIN
 IF md5(pg_get_viewdef('public.finance_purchase_expense_bridge_v1'::regclass,true)) <> 'ab8d676be419f10b6c3a607db144fb2a'
 OR md5(pg_get_viewdef('public.finance_purchase_dual_posting_v1'::regclass,true)) <> '707f7e8ddb893b53e348915c68d685f1'
 THEN RAISE EXCEPTION 'Purchase finance view drift: abort without changes'; END IF;
END
$guard$;
INSERT INTO public.finance_accounts(brand_id,code,name,account_type,active)
SELECT b.id,'2110','Utang Antar Usaha - Jas Hujan','LIABILITY',true
FROM public.brands b WHERE b.id='a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'
ON CONFLICT(brand_id,code) DO NOTHING;

CREATE OR REPLACE VIEW public.finance_purchase_expense_bridge_v1 AS
 WITH p0 AS (
         SELECT p_1.id,
            p_1.brand_id,
            p_1.source_period,
            p_1.source_file,
            p_1.row_no,
            p_1.purchase_date,
            p_1.item_name,
            p_1.quantity_text,
            p_1.unit_text,
            p_1.unit_price,
            p_1.total_amount,
            p_1.payment_method,
            p_1.notes,
            p_1.raw_data,
            p_1.created_at,
            p_1.canonical_loaded_at,
            p_1.normalized_item_name,
            p_1.quantity_numeric,
            p_1.inventory_item_id,
            p_1.inventory_match_count,
            p_1.mapping_status,
            p_1.derived_unit_cost,
            p_1.ready_for_inventory,
            p_1.expense_category,
            p_1.inventory_qty,
            p_1.rule_type,
            private.normalize_purchase_payment_method_v1(p_1.payment_method) AS normalized_payment_method
           FROM purchase_inventory_bridge p_1
        ), routed AS (
         SELECT p_1.id,
            p_1.brand_id,
            p_1.source_period,
            p_1.source_file,
            p_1.row_no,
            p_1.purchase_date,
            p_1.item_name,
            p_1.quantity_text,
            p_1.unit_text,
            p_1.unit_price,
            p_1.total_amount,
            p_1.payment_method,
            p_1.notes,
            p_1.raw_data,
            p_1.created_at,
            p_1.canonical_loaded_at,
            p_1.normalized_item_name,
            p_1.quantity_numeric,
            p_1.inventory_item_id,
            p_1.inventory_match_count,
            p_1.mapping_status,
            p_1.derived_unit_cost,
            p_1.ready_for_inventory,
            p_1.expense_category,
            p_1.inventory_qty,
            p_1.rule_type,
            p_1.normalized_payment_method,
            ii.category AS inventory_category,
            fa_override.code AS override_code,
            fa_override.name AS override_name,
                CASE
                    WHEN fa_override.code IS NOT NULL THEN fa_override.code
                    WHEN COALESCE(p_1.raw_data ->> 'analytics_group'::text, ''::text) = 'Investasi'::text THEN '1500'::text
                    WHEN COALESCE(p_1.raw_data ->> 'analytics_group'::text, ''::text) = 'Karyawan'::text OR COALESCE(p_1.raw_data ->> 'analytics_category'::text, ''::text) ~~* '%Karyawan%'::text OR upper(COALESCE(p_1.item_name, ''::text)) ~ '(GAJI|KARYAWAN|SERAGAM|JAS HUJAN|MAKAN SIANG|TUNJANGAN|BONUS|LEMBUR)'::text THEN '6200'::text
                    WHEN COALESCE(p_1.expense_category, ''::text) = 'cleaning_supplies'::text THEN '6010'::text
                    WHEN COALESCE(p_1.expense_category, ''::text) = 'delivery_freight'::text THEN '6020'::text
                    WHEN COALESCE(p_1.expense_category, ''::text) = 'kitchen_fuel'::text THEN '6030'::text
                    WHEN COALESCE(p_1.expense_category, ''::text) = ANY (ARRAY['marketing_printing'::text, 'marketing'::text, 'promotion'::text]) THEN '6040'::text
                    WHEN COALESCE(p_1.expense_category, ''::text) = 'small_equipment'::text THEN '6050'::text
                    WHEN COALESCE(p_1.expense_category, ''::text) = 'store_supplies'::text THEN '6060'::text
                    WHEN COALESCE(p_1.expense_category, ''::text) = ANY (ARRAY['utilities_electricity'::text, 'utilities'::text]) THEN '6070'::text
                    WHEN COALESCE(p_1.expense_category, ''::text) = 'internet_telecom'::text THEN '6080'::text
                    WHEN COALESCE(p_1.expense_category, ''::text) = 'rent'::text THEN '6090'::text
                    WHEN COALESCE(p_1.expense_category, ''::text) = ANY (ARRAY['admin_printing'::text, 'administration'::text]) THEN '6100'::text
                    WHEN COALESCE(p_1.expense_category, ''::text) = 'maintenance'::text THEN '6110'::text
                    WHEN upper(COALESCE(p_1.item_name, ''::text)) ~ '(SABUN|DETERGEN|PEMBERSIH|RINSO|SOKLIN|CUCI PIRING|SABUN PEL)'::text THEN '6010'::text
                    WHEN upper(COALESCE(p_1.item_name, ''::text)) ~ '(ONGKIR|DELIVERY|FREIGHT|ANGKUT)'::text THEN '6020'::text
                    WHEN upper(COALESCE(p_1.item_name, ''::text)) ~ '(^|[^A-Z])(GAS|LPG)([^A-Z]|$)'::text THEN '6030'::text
                    WHEN upper(COALESCE(p_1.item_name, ''::text)) ~ '(CETAK MENU|BANNER|PROMO|IKLAN|MARKETING)'::text THEN '6040'::text
                    WHEN upper(COALESCE(p_1.item_name, ''::text)) ~ '(ALAT KECIL|SCOOP|DUMBELL|TRIPOD|PIRING GOLD)'::text THEN '6050'::text
                    WHEN upper(COALESCE(p_1.item_name, ''::text)) ~ '(SELOTIP|ISOLASI|SOLASI|PULPEN|KERTAS KASIR|STICKER)'::text THEN '6060'::text
                    WHEN upper(COALESCE(p_1.item_name, ''::text)) ~ '(TOKEN|LISTRIK|PLN|PDAM)'::text THEN '6070'::text
                    WHEN upper(COALESCE(p_1.item_name, ''::text)) ~ '(INTERNET|PULSA|PAKET DATA|TELEKOM)'::text THEN '6080'::text
                    WHEN upper(COALESCE(p_1.item_name, ''::text)) ~ '(SEWA|RENT)'::text THEN '6090'::text
                    WHEN upper(COALESCE(p_1.item_name, ''::text)) ~ '(FOTO COPY|FOTOKOPI|FC LAPORAN|LAPORAN|RETRIBUSI|LANGGANAN MAJOO|ADMIN)'::text THEN '6100'::text
                    WHEN upper(COALESCE(p_1.item_name, ''::text)) ~ '(SERVIS|SERVICE|PERBAIK|MAINTENANCE|REPAIR)'::text THEN '6110'::text
                    WHEN COALESCE(p_1.raw_data ->> 'analytics_category'::text, ''::text) = ANY (ARRAY['Makanan'::text, 'Minuman'::text, 'Ice Cream'::text, 'Kemasan & Supplies'::text]) THEN '6120'::text
                    WHEN (p_1.mapping_status = ANY (ARRAY['inventory_alias'::text, 'exact_name'::text])) OR p_1.inventory_item_id IS NOT NULL THEN '6120'::text
                    ELSE '1990'::text
                END AS routed_account_code
           FROM p0 p_1
             LEFT JOIN inventory_items ii ON ii.id = p_1.inventory_item_id AND ii.brand_id = p_1.brand_id
             LEFT JOIN finance_accounts fa_override ON fa_override.brand_id = p_1.brand_id AND fa_override.code = NULLIF(p_1.raw_data ->> 'finance_account_code_override'::text, ''::text) AND fa_override.active AND (fa_override.account_type = ANY (ARRAY['ASSET'::text, 'LIABILITY'::text, 'EXPENSE'::text, 'COGS'::text]))
        )
 SELECT p.id AS source_history_id,
    p.brand_id,
    COALESCE(p.purchase_date, p.source_period) AS purchase_date,
    date_trunc('month'::text, COALESCE(p.purchase_date, p.source_period)::timestamp with time zone)::date AS period_month,
    p.item_name,
    p.total_amount,
    (CASE WHEN EXISTS (SELECT 1 FROM public.purchase_review_amount_requests_v1 pr
 WHERE pr.brand_id=p.brand_id AND pr.source_history_id=p.id
 AND pr.status='applied' AND pr.proposed_payment_method='PINJAMAN_USAHA_LAIN') THEN 'PINJAMAN_USAHA_LAIN'::text ELSE p.payment_method END) AS payment_method,
    COALESCE(a.name,
        CASE
            WHEN p.routed_account_code = '1990'::text THEN 'Pembelian Dalam Review'::text
            ELSE 'Pembelian'::text
        END) AS expense_category,
    p.routed_account_code AS expense_account_code,
        CASE
            WHEN EXISTS (SELECT 1 FROM public.purchase_review_amount_requests_v1 pr
 WHERE pr.brand_id=p.brand_id AND pr.source_history_id=p.id
 AND pr.status='applied' AND pr.proposed_payment_method='PINJAMAN_USAHA_LAIN') THEN '2110'::text
            WHEN p.normalized_payment_method = 'TUNAI'::text THEN '1000'::text
            WHEN p.normalized_payment_method = ANY (ARRAY['TRANSFER'::text, 'QRIS'::text]) THEN '1100'::text
            WHEN p.normalized_payment_method = ANY (ARRAY['UTANG'::text, 'PAYLATER'::text]) THEN '2000'::text
            ELSE '2190'::text
        END AS counter_account_code,
        CASE
            WHEN EXISTS (SELECT 1 FROM public.purchase_review_amount_requests_v1 pr
 WHERE pr.brand_id=p.brand_id AND pr.source_history_id=p.id
 AND pr.status='applied' AND pr.proposed_payment_method='PINJAMAN_USAHA_LAIN') AND p.routed_account_code <> '1990'::text THEN 'posted'::text
            WHEN p.routed_account_code = '1990'::text OR p.normalized_payment_method IS NULL OR p.normalized_payment_method = 'BELUM_DIPETAKAN'::text THEN 'provisional'::text
            ELSE 'posted'::text
        END AS journal_status
   FROM routed p
     LEFT JOIN finance_accounts a ON a.brand_id = p.brand_id AND a.code = p.routed_account_code AND a.active
  WHERE COALESCE(p.total_amount, 0::numeric) > 0::numeric AND (COALESCE(p.mapping_status, ''::text) <> ALL (ARRAY['excluded'::text, 'payment_candidate'::text]));;
CREATE OR REPLACE VIEW public.finance_purchase_dual_posting_v1 AS
 WITH b AS MATERIALIZED (
         SELECT purchase_inventory_bridge.id,
            purchase_inventory_bridge.brand_id,
            purchase_inventory_bridge.source_period,
            purchase_inventory_bridge.source_file,
            purchase_inventory_bridge.row_no,
            purchase_inventory_bridge.purchase_date,
            purchase_inventory_bridge.item_name,
            purchase_inventory_bridge.quantity_text,
            purchase_inventory_bridge.unit_text,
            purchase_inventory_bridge.unit_price,
            purchase_inventory_bridge.total_amount,
            purchase_inventory_bridge.payment_method,
            purchase_inventory_bridge.notes,
            purchase_inventory_bridge.raw_data,
            purchase_inventory_bridge.created_at,
            purchase_inventory_bridge.canonical_loaded_at,
            purchase_inventory_bridge.normalized_item_name,
            purchase_inventory_bridge.quantity_numeric,
            purchase_inventory_bridge.inventory_item_id,
            purchase_inventory_bridge.inventory_match_count,
            purchase_inventory_bridge.mapping_status,
            purchase_inventory_bridge.derived_unit_cost,
            purchase_inventory_bridge.ready_for_inventory,
            purchase_inventory_bridge.expense_category,
            purchase_inventory_bridge.inventory_qty,
            purchase_inventory_bridge.rule_type
           FROM purchase_inventory_bridge
          WHERE COALESCE(purchase_inventory_bridge.total_amount, 0::numeric) > 0::numeric
        ), classified AS (
         SELECT b.id,
            b.brand_id,
            b.source_period,
            b.source_file,
            b.row_no,
            b.purchase_date,
            b.item_name,
            b.quantity_text,
            b.unit_text,
            b.unit_price,
            b.total_amount,
            b.payment_method,
            b.notes,
            b.raw_data,
            b.created_at,
            b.canonical_loaded_at,
            b.normalized_item_name,
            b.quantity_numeric,
            b.inventory_item_id,
            b.inventory_match_count,
            b.mapping_status,
            b.derived_unit_cost,
            b.ready_for_inventory,
            b.expense_category,
            b.inventory_qty,
            b.rule_type,
            COALESCE(b.purchase_date, b.source_period) AS effective_date_fast,
            COALESCE(NULLIF(b.raw_data ->> 'analytics_group'::text, ''::text), 'Belum diklasifikasi'::text) AS analytics_group_fast,
            COALESCE(NULLIF(b.raw_data ->> 'analytics_category'::text, ''::text), NULLIF(b.expense_category, ''::text), 'Lainnya'::text) AS analytics_category_fast,
                CASE
                    WHEN COALESCE(b.raw_data ->> 'analytics_group'::text, ''::text) = 'Karyawan'::text OR COALESCE(b.raw_data ->> 'analytics_category'::text, ''::text) ~~* '%Karyawan%'::text OR upper(COALESCE(b.item_name, ''::text)) ~ '(GAJI|KARYAWAN|SERAGAM|JAS HUJAN|MAKAN SIANG|TUNJANGAN|BONUS|LEMBUR)'::text THEN 'Beban Kepegawaian'::text
                    WHEN upper(COALESCE(b.item_name, ''::text)) ~ '(SERVIS|SERVICE|PERBAIK|MAINTENANCE|KEBERSIH|SABUN|TISSUE|DETERGEN|PLASTIK SAMPAH|PERALATAN|ALAT KECIL|LAMPU|REPAIR|LISTRIK|TOKEN|GAS|CUCI)'::text THEN 'Beban Pemeliharaan'::text
                    WHEN COALESCE(b.raw_data ->> 'analytics_category'::text, ''::text) = ANY (ARRAY['Makanan'::text, 'Minuman'::text, 'Ice Cream'::text, 'Kemasan & Supplies'::text]) THEN 'Beban Bahan Baku'::text
                    ELSE 'Beban Administrasi'::text
                END AS expense_category_fast,
                CASE
                    WHEN b.mapping_status = ANY (ARRAY['payment_candidate'::text, 'excluded'::text]) THEN 'review_required'::text
                    WHEN EXISTS (SELECT 1 FROM public.purchase_review_amount_requests_v1 pr
 WHERE pr.brand_id=b.brand_id AND pr.source_history_id=b.id
 AND pr.status='applied' AND pr.proposed_payment_method='PINJAMAN_USAHA_LAIN') THEN 'posted'::text
                    WHEN (upper(btrim(COALESCE(b.payment_method, ''::text))) = ANY (ARRAY['TUNAI'::text, 'CASH'::text, 'REK MANDIRI'::text, 'TRANSFER'::text, 'TF'::text, 'QRIS'::text])) OR upper(COALESCE(b.payment_method, ''::text)) ~~ '%UTANG%'::text OR upper(COALESCE(b.payment_method, ''::text)) ~~ '%PAYLATER%'::text THEN 'posted'::text
                    ELSE 'provisional'::text
                END AS finance_status_fast,
                CASE
                    WHEN EXISTS (SELECT 1 FROM public.purchase_review_amount_requests_v1 pr
 WHERE pr.brand_id=b.brand_id AND pr.source_history_id=b.id
 AND pr.status='applied' AND pr.proposed_payment_method='PINJAMAN_USAHA_LAIN') THEN '2110'::text
                    WHEN upper(btrim(COALESCE(b.payment_method, ''::text))) = ANY (ARRAY['TUNAI'::text, 'CASH'::text]) THEN '1000'::text
                    WHEN upper(btrim(COALESCE(b.payment_method, ''::text))) = ANY (ARRAY['REK MANDIRI'::text, 'TRANSFER'::text, 'TF'::text, 'QRIS'::text]) THEN '1100'::text
                    WHEN upper(COALESCE(b.payment_method, ''::text)) ~~ '%UTANG%'::text OR upper(COALESCE(b.payment_method, ''::text)) ~~ '%PAYLATER%'::text THEN '2000'::text
                    ELSE '2190'::text
                END AS counter_account_code_fast
           FROM b
        ), shaped AS (
         SELECT c.id,
            c.brand_id,
            c.source_period,
            c.source_file,
            c.row_no,
            c.purchase_date,
            c.item_name,
            c.quantity_text,
            c.unit_text,
            c.unit_price,
            c.total_amount,
            c.payment_method,
            c.notes,
            c.raw_data,
            c.created_at,
            c.canonical_loaded_at,
            c.normalized_item_name,
            c.quantity_numeric,
            c.inventory_item_id,
            c.inventory_match_count,
            c.mapping_status,
            c.derived_unit_cost,
            c.ready_for_inventory,
            c.expense_category,
            c.inventory_qty,
            c.rule_type,
            c.effective_date_fast,
            c.analytics_group_fast,
            c.analytics_category_fast,
            c.expense_category_fast,
            c.finance_status_fast,
            c.counter_account_code_fast,
                CASE c.expense_category_fast
                    WHEN 'Beban Administrasi'::text THEN '6100'::text
                    WHEN 'Beban Pemeliharaan'::text THEN '6110'::text
                    WHEN 'Beban Bahan Baku'::text THEN '6120'::text
                    WHEN 'Beban Kepegawaian'::text THEN '6200'::text
                    ELSE '6000'::text
                END AS expense_account_code_fast,
                CASE
                    WHEN c.finance_status_fast = 'review_required'::text THEN 'provisional_review'::text
                    WHEN c.finance_status_fast = 'provisional'::text THEN 'provisional'::text
                    ELSE 'classified'::text
                END AS category_status_fast
           FROM classified c
        )
 SELECT s.brand_id,
    s.id AS source_history_id,
    s.source_period,
    s.effective_date_fast AS effective_date,
    date_trunc('month'::text, s.effective_date_fast::timestamp without time zone)::date AS period_month,
    s.item_name,
    s.total_amount::numeric(18,2) AS total_amount,
    (CASE WHEN EXISTS (SELECT 1 FROM public.purchase_review_amount_requests_v1 pr
 WHERE pr.brand_id=s.brand_id AND pr.source_history_id=s.id
 AND pr.status='applied' AND pr.proposed_payment_method='PINJAMAN_USAHA_LAIN') THEN 'PINJAMAN_USAHA_LAIN'::text ELSE s.payment_method END) AS payment_method,
    s.analytics_group_fast AS analytics_group,
    s.analytics_category_fast AS analytics_category,
    s.expense_category_fast AS expense_category,
    s.category_status_fast AS category_status,
    s.finance_status_fast AS source_finance_status,
    s.expense_account_code_fast AS expense_account_code,
    s.expense_category_fast AS expense_account_name,
    s.counter_account_code_fast AS counter_account_code,
    COALESCE(ca.name, 'Akun lawan sementara'::text) AS counter_account_name,
    s.inventory_item_id,
    i.item_name AS inventory_item_name,
    s.mapping_status AS stock_mapping_status,
    s.ready_for_inventory,
    s.inventory_qty AS source_stock_qty,
    NULLIF(s.unit_text, ''::text) AS source_stock_unit,
    l.id AS stock_log_id,
    l.qty AS posted_stock_qty,
    l.unit AS posted_stock_unit,
        CASE
            WHEN l.id IS NOT NULL THEN 'posted_to_stock'::text
            WHEN s.ready_for_inventory THEN 'ready_to_stock'::text
            WHEN s.mapping_status = ANY (ARRAY['unmatched'::text, 'ambiguous_inventory_name'::text, 'invalid_qty'::text]) THEN 'stock_review_required'::text
            ELSE 'not_stock_item'::text
        END AS stock_status
   FROM shaped s
     LEFT JOIN finance_accounts ca ON ca.brand_id = s.brand_id AND ca.code = s.counter_account_code_fast
     LEFT JOIN inventory_items i ON i.id = s.inventory_item_id AND i.brand_id = s.brand_id
     LEFT JOIN inventory_purchase_log l ON l.brand_id = s.brand_id AND l.source_history_id = s.id;;

CREATE OR REPLACE FUNCTION public.apply_purchase_review_owner_v1(p_batch uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $apply$
DECLARE
 v_brand uuid:=private.owner_stock_review_assert_v1();
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
REVOKE ALL ON FUNCTION public.apply_purchase_review_owner_v1(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apply_purchase_review_owner_v1(uuid) TO authenticated,service_role;

-- The Owner's history must remain visible after settlement. No duplicates created.
CREATE OR REPLACE FUNCTION public.get_purchase_review_amount_requests_v1(p_period date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $getter$
DECLARE
 v_brand uuid:=private.owner_stock_review_assert_v1();
 v_out jsonb;
BEGIN
 IF p_period IS NULL OR p_period<>date_trunc('month',p_period::timestamp)::date
 THEN RAISE EXCEPTION 'Periode review tidak valid'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'source_history_id',r.source_history_id,'original_amount',r.original_amount,
  'proposed_amount',r.proposed_amount,'original_payment_method',r.original_payment_method,
  'proposed_payment_method',r.proposed_payment_method,'status',r.status,
  'submitted_at',r.submitted_at,'batch_id',r.batch_id,'finance_reviewed_at',r.finance_reviewed_at)
  ORDER BY r.submitted_at DESC),'[]'::jsonb)
 INTO v_out FROM public.purchase_review_amount_requests_v1 r
 WHERE r.brand_id=v_brand AND r.period_month=p_period
   AND r.status IN ('pending_finance_review','applied');
 RETURN v_out;
END;
$getter$;
REVOKE ALL ON FUNCTION public.get_purchase_review_amount_requests_v1(date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_purchase_review_amount_requests_v1(date) TO authenticated,service_role;
COMMIT;