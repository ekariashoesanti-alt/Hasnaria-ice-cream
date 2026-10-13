-- Hasnaria P0.2 — eliminate unsafe pack-factor -> active BOM coupling.
-- This migration does not modify existing business rows. Existing verified
-- conversions and recipe components remain intact; future unit verification
-- never creates/activates/rewrites recipe consumption.
-- All Owner signed reviews need an audit reason with packaging/invoice evidence.
-- Legacy direct conversion RPC stays callable but fails closed (clear error),
-- while the ERP Action Center's resolve_inventory_conversion API is preserved.
-- Protect against duplicate verified conversions committed from concurrent
-- Owner sessions. All existing VERIFIED production keys are unique as of
-- the read-only preflight; duplicate DRAFT rows remain for Owner review.
create unique index if not exists inventory_unit_conversion_verified_key_uidx
on public.inventory_unit_conversions(
  brand_id,inventory_item_id,
  lower(btrim(purchase_unit)),lower(btrim(sale_unit))
) where status='verified';

create or replace function private.guard_verified_inventory_conversion_v1()
-- SECURITY INVOKER is critical. A SECURITY DEFINER trigger would erase
-- the execution-role boundary and let a client spoof the transaction GUC.
-- Here CURRENT_USER stays 'authenticated' for direct table writes but becomes
-- the audited RPC's trusted function owner during its definer execution.
returns trigger language plpgsql security invoker set search_path=''
as $guard$
declare v_brand uuid;
begin
  if tg_op='DELETE' then
    if old.status='verified' then
      raise exception 'Aturan konversi terverifikasi tidak boleh dihapus langsung; lakukan koreksi audit Owner';
    end if;
    return old;
  end if;
  if tg_op='INSERT' and new.status='verified'
     or tg_op='UPDATE' and (
          new.status is distinct from old.status
          and (new.status='verified' or old.status='verified')
          or (old.status='verified' or new.status='verified') and (
            new.units_per_purchase_unit is distinct from old.units_per_purchase_unit
            or new.purchase_unit is distinct from old.purchase_unit
            or new.sale_unit is distinct from old.sale_unit
            or new.inventory_item_id is distinct from old.inventory_item_id
            or new.brand_id is distinct from old.brand_id
            or new.product_id is distinct from old.product_id))
    then
    -- An authenticated Owner can call SET_CONFIG directly. Therefore the
    -- transaction marker is NOT an authorization credential by itself.
    -- The trigger must also run inside the trusted SECURITY DEFINER RPC,
    -- whose execution role is its PostgreSQL owner (not 'authenticated').
    if current_user is distinct from (
         select pg_get_userbyid(p.proowner)
         from pg_proc p
         where p.oid='private.resolve_inventory_conversion_ui(uuid,numeric,text)'::regprocedure
       ) then
       raise exception 'Direct conversion verification forbidden: use audited Owner RPC';
    end if;
    if coalesce(current_setting('hasnaria.p0_owner_conversion_id',true),'')<>new.id::text
       or auth.uid() is null then
      raise exception 'Aturan verified hanya boleh dibuat atau diubah lewat review Owner terotorisasi';
    end if;
    v_brand:=private.owner_stock_review_assert_v1();
    if new.brand_id is distinct from v_brand then
      raise exception 'Review konversi merek lain tidak diperbolehkan';
    end if;
  end if;
  return new;
end;
$guard$;

revoke all on function private.guard_verified_inventory_conversion_v1() from public,anon,authenticated;
drop trigger if exists guard_verified_inventory_conversion_v1 on public.inventory_unit_conversions;
create trigger guard_verified_inventory_conversion_v1
before insert or update or delete on public.inventory_unit_conversions
for each row execute function private.guard_verified_inventory_conversion_v1();

-- The old API could verify conversions and silently write/activate a formula
-- (qty_per_sale=1/factor) on the separate recipe BOM. Close this escape route.
create or replace function private.apply_inventory_unit_conversion(
 p_conversion_id uuid,p_units_per_purchase_unit numeric)
returns public.inventory_unit_conversions
language plpgsql security definer set search_path=''
as $legacy$
begin
 perform private.owner_stock_review_assert_v1();
 raise exception 'Konversi lama dihentikan: gunakan ERP Owner dengan bukti kemasan; resep tidak boleh diubah otomatis';
end;
$legacy$;
revoke all on function private.apply_inventory_unit_conversion(uuid,numeric)
 from public,anon,authenticated;

-- ERP Action Center already calls public.resolve_inventory_conversion(...).
-- Preserve this RPC interface; replace its private implementation with Owner
-- authorization, complete evidence, conflict checks, no BOM side effects.
create or replace function private.resolve_inventory_conversion_ui(
 p_conversion_id uuid,p_units_per_purchase_unit numeric,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=''
as $owner$
declare
 v_brand uuid;
 v_before public.inventory_unit_conversions%rowtype;
 v_after public.inventory_unit_conversions%rowtype;
 v_stock_unit text;
 v_inventory_name text;
 v_product_name text;
 v_duplicate integer;
 v_other_verified integer;
begin
 v_brand:=private.owner_stock_review_assert_v1();
 if p_conversion_id is null or p_units_per_purchase_unit is null
    or p_units_per_purchase_unit<=0 or p_units_per_purchase_unit>=1000000
    or length(btrim(coalesce(p_reason,'')))<20
    or length(btrim(coalesce(p_reason,'')))>1000 then
  raise exception 'Owner wajib mengisi faktor yang valid dan bukti kemasan/nota minimal 20 karakter';
 end if;

 select * into v_before from public.inventory_unit_conversions
 where id=p_conversion_id and brand_id=v_brand for update;
 if not found then raise exception 'Konversi SKU tidak ada atau bukan milik merek ini'; end if;
 -- Serialize approvals at SKU scope, not only by conversion-row ID.
 -- Distinct packaging rules for the same SKU cannot race the verified check.
 perform pg_advisory_xact_lock(hashtextextended(
   v_brand::text||':'||v_before.inventory_item_id::text,417));
 select i.unit,i.item_name into v_stock_unit,v_inventory_name
 from public.inventory_items i
 where i.brand_id=v_brand and i.id=v_before.inventory_item_id;
 if not found or nullif(btrim(coalesce(v_stock_unit,'')),'') is null
    or lower(btrim(v_stock_unit))='purchase_unit' then
  raise exception 'Master SKU belum memiliki satuan stok valid; verifikasi master terlebih dahulu';
 end if;
 if nullif(btrim(coalesce(v_before.purchase_unit,'')),'') is null
    or lower(btrim(v_before.purchase_unit)) in ('purchase_unit','unknown','?')
    or lower(btrim(coalesce(v_before.sale_unit,'')))<>lower(btrim(v_stock_unit)) then
  raise exception 'Satuan beli atau satuan hasil konversi tidak cocok dengan master SKU';
 end if;
 if lower(btrim(v_before.purchase_unit))=lower(btrim(v_stock_unit))
    and p_units_per_purchase_unit<>1 then
  raise exception 'Bila satuan beli sama dengan satuan stok, faktor harus 1';
 end if;
 if v_before.status='verified'
    and v_before.units_per_purchase_unit is distinct from p_units_per_purchase_unit then
  raise exception 'Mengubah aturan verified lama perlu proses koreksi historis tersendiri';
 end if;
 -- For duplicate drafts (NATA DE COCO/SPRITE), do not silently pick
 -- an arbitrary row: Owner must first document consolidation separately.
 select count(*) into v_duplicate from public.inventory_unit_conversions c
 where c.brand_id=v_brand and c.inventory_item_id=v_before.inventory_item_id
   and c.id<>v_before.id
   and lower(btrim(c.purchase_unit))=lower(btrim(v_before.purchase_unit))
   and lower(btrim(c.sale_unit))=lower(btrim(v_before.sale_unit));
 if v_duplicate>0 then
  raise exception 'Ada aturan konversi ganda untuk SKU/satuan ini; selesaikan duplikasi dahulu';
 end if;
 select count(*) into v_other_verified from public.inventory_unit_conversions c
 where c.brand_id=v_brand and c.inventory_item_id=v_before.inventory_item_id
   and c.id<>v_before.id
   and c.status='verified';
 if v_other_verified>0 then
  raise exception 'SKU masih memiliki aturan verified lain; periksa dan konfirmasi tidak konflik';
 end if;

 -- A transaction-local marker binds this row to the reviewed RPC call.
 -- The SECURITY INVOKER trigger additionally checks the actual execution
 -- role, so setting the marker alone is never enough for direct SQL writes.
 perform set_config('hasnaria.p0_owner_conversion_id',v_before.id::text,true);
 update public.inventory_unit_conversions
 set status='verified',units_per_purchase_unit=p_units_per_purchase_unit,
     updated_at=clock_timestamp()
 where id=v_before.id and brand_id=v_brand
 returning * into v_after;
 perform set_config('hasnaria.p0_owner_conversion_id','',true);

 select name into v_product_name from public.products
 where id=v_after.product_id and brand_id=v_brand;

 perform private.write_audit_log(
   v_brand,null,'inventory_unit_conversion',v_after.id,
   'owner_verify_pack_conversion_no_bom',auth.uid(),
   to_jsonb(v_before),to_jsonb(v_after),btrim(p_reason),
   jsonb_build_object(
     'product_name',v_product_name,
     'inventory_item_name',v_inventory_name,
     'packaging_evidence_required',true,
     'recipe_bom_modified',false,
     'inventory_receipts_modified',false,
     'finance_modified',false,
     'source','owner_erp_workflow')
 );
 return jsonb_build_object(
  'conversion_id',v_after.id,'status',v_after.status,
  'product_id',v_after.product_id,'product_name',v_product_name,
  'inventory_item_id',v_after.inventory_item_id,'inventory_item_name',v_inventory_name,
  'purchase_unit',v_after.purchase_unit,'sale_unit',v_after.sale_unit,
  'units_per_purchase_unit',v_after.units_per_purchase_unit,
  'qty_per_sale',null,
  'recipe_bom_modified',false,
  'stock_changed',false,'finance_changed',false,
  'updated_at',v_after.updated_at
 );
end;
$owner$;
revoke all on function private.resolve_inventory_conversion_ui(uuid,numeric,text)
 from public,anon;
-- Preserve authenticated RPC execution; its private function now checks Owner
-- before touching a rule and never calls legacy recipe-writing function.

comment on function private.resolve_inventory_conversion_ui(uuid,numeric,text) is
 'Owner-only evidenced unit verification. Never rewrites or activates product BOM, receipts, sales usage or Finance. Verified drafts cannot be duplicate or conflict with SKU master.';
