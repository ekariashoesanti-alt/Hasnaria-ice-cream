-- Already applied in Tokyo production on 2026-10-18.
-- Supabase migration name: hsn_p02_block_unattested_conversion_bom_mutation_v1
-- Recovery/audit copy ONLY. Do not run automatically or merge blindly from PR #88.
CREATE OR REPLACE FUNCTION private.guard_unattested_verified_inventory_conversion_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $guard$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status='verified' THEN
      RAISE EXCEPTION 'P0.2: konversi baru tidak dapat langsung verified. Verifikasi bukti kemasan dan alur persetujuan Owner diperlukan'
        USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status='verified'
     AND (
       OLD.status IS DISTINCT FROM NEW.status
       OR OLD.units_per_purchase_unit IS DISTINCT FROM NEW.units_per_purchase_unit
       OR OLD.purchase_unit IS DISTINCT FROM NEW.purchase_unit
       OR OLD.sale_unit IS DISTINCT FROM NEW.sale_unit
       OR OLD.inventory_item_id IS DISTINCT FROM NEW.inventory_item_id
       OR OLD.product_id IS DISTINCT FROM NEW.product_id
       OR OLD.brand_id IS DISTINCT FROM NEW.brand_id
     )
  THEN
    RAISE EXCEPTION 'P0.2: verifikasi konversi dan perubahan faktor verified ditahan sampai bukti fisik dan audit BOM lengkap'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$guard$;

REVOKE ALL ON FUNCTION private.guard_unattested_verified_inventory_conversion_v1()
  FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS guard_unattested_verified_inventory_conversion_v1
  ON public.inventory_unit_conversions;
CREATE TRIGGER guard_unattested_verified_inventory_conversion_v1
  BEFORE INSERT OR UPDATE ON public.inventory_unit_conversions
  FOR EACH ROW EXECUTE FUNCTION private.guard_unattested_verified_inventory_conversion_v1();
REVOKE ALL ON FUNCTION public.apply_inventory_unit_conversion(uuid,numeric)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.resolve_inventory_conversion(uuid,numeric,text)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.apply_inventory_unit_conversion(uuid,numeric)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.resolve_inventory_conversion_ui(uuid,numeric,text)
  FROM PUBLIC,anon,authenticated;
COMMENT ON FUNCTION private.guard_unattested_verified_inventory_conversion_v1() IS
  'Temporary fail-closed P0.2 verified conversion integrity guard. Prevents old pack factor changes from mutating recipe BOM without physically evidenced Owner approval. Remove only as part of a tested Owner evidence gated replacement.';
