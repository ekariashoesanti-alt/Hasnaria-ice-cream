-- ALREADY APPLIED TO TOKYO SUPABASE under hsn_p02_owner_conversion_review_queue_v1.
-- Source reference only; do not replay during automated deploys.
CREATE OR REPLACE FUNCTION private.owner_conversion_review_queue_v1()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $body$
DECLARE v_brand uuid; v_items jsonb; v_pending integer; v_verified integer;
BEGIN
 v_brand:=private.owner_stock_review_assert_v1();
 SELECT count(*) FILTER(WHERE status<>'verified'),count(*) FILTER(WHERE status='verified')
 INTO v_pending,v_verified FROM public.inventory_unit_conversions c WHERE c.brand_id=v_brand;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
 'sku',t.sku_name,'master_unit',t.master_unit,'purchase_unit',t.normalized_purchase_unit,
 'sale_unit',t.normalized_sale_unit,'draft_factor_min',t.smallest_factor,
 'draft_factor_max',t.largest_factor,'pending_rules',t.not_verified_count,
 'total_rules',t.rule_count,'verified_rules',t.verified_count,'gate',t.verification_gate,
 'action',case when t.verification_gate='BLOCK_MASTER_SALE_UNIT_CONFLICT' then 'PERIKSA_SATUAN_MASTER_DULU'
 when t.verification_gate='REVIEW_DUPLICATE_UNVERIFIED_RULES' then 'TINJAU_ATURAN_DUPLIKAT'
 when t.verification_gate like 'BLOCK_%' then 'PERIKSA_KONFLIK_SEBELUM_VERIFIKASI'
 else 'BUKTI_FISIK_KEMASAN_DAN_RESEP' end,
 'documented_factor_is_not_approval',true)
 ORDER BY case when t.verification_gate like 'BLOCK_%' then 0
 when t.verification_gate='REVIEW_DUPLICATE_UNVERIFIED_RULES' then 1 else 2 end,t.sku_name),'[]'::jsonb)
 INTO v_items FROM private.inventory_unit_conversion_triage_v1 t
 WHERE t.brand_id=v_brand and t.not_verified_count>0;
 RETURN jsonb_build_object('items',v_items,'group_count',jsonb_array_length(v_items),
 'pending_rules',v_pending,'verified_rules',v_verified,
 'mode','READ_ONLY_PENDING_PHYSICAL_EVIDENCE',
 'stock_changed',false,'master_changed',false,'recipe_changed',false);
END;
$body$;
CREATE OR REPLACE FUNCTION public.owner_conversion_review_queue_v1()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $wrapper$ SELECT private.owner_conversion_review_queue_v1(); $wrapper$;
REVOKE ALL ON FUNCTION public.owner_conversion_review_queue_v1() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.owner_conversion_review_queue_v1() TO authenticated,service_role;
COMMENT ON FUNCTION public.owner_conversion_review_queue_v1() IS
'Owner-only read-only draft unit conversion triage; no status, Stock, BOM or Finance mutation.';
