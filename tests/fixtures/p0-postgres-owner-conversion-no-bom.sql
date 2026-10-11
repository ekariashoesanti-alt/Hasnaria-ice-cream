-- Disposable PostgreSQL 17 only: P0 pack-factor approval must not rewrite
-- recipe BOM or Stock movement, and must be signed by Owner with evidence.
-- Uses synthetic Product, Inventory, private audit sink and Owner authority.
create or replace function public.resolve_inventory_conversion(
 p_conversion_id uuid,p_units_per_purchase_unit numeric,p_reason text default null)
returns jsonb language sql set search_path=''
as $$select private.resolve_inventory_conversion_ui(p_conversion_id,p_units_per_purchase_unit,p_reason)$$;

insert into public.inventory_unit_conversions
(id,brand_id,inventory_item_id,product_id,status,purchase_unit,sale_unit,
 units_per_purchase_unit)
values ('00000000-0000-0000-0000-000000000802',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000102',
  '00000000-0000-0000-0000-000000000901',
  'needs_verification','pack','pcs',5);
insert into public.inventory_recipe_components(
 brand_id,inventory_item_id,product_id,qty_per_sale,active)
values('00000000-0000-0000-0000-000000000001',
       '00000000-0000-0000-0000-000000000102',
       '00000000-0000-0000-0000-000000000901',
       0.30,true);

do $owner$
declare
 v jsonb; n integer; before_receipts integer; before_movements integer;
 blocked boolean;
begin
 select count(*) into before_receipts from public.inventory_purchase_log;
 select count(*) into before_movements from public.inventory_movements;
 blocked:=false;
 begin
   perform public.resolve_inventory_conversion(
     '00000000-0000-0000-0000-000000000802',8,'short');
 exception when others then blocked:=true; end;
 if not blocked then raise exception 'Short evidence allowed verified conversion'; end if;

 -- Critical: a verified conversion must NEVER be updated by the old RPC,
 -- because it used to create an active 1/factor recipe.
 blocked:=false;
 begin
  perform private.apply_inventory_unit_conversion(
   '00000000-0000-0000-0000-000000000802',8);
 exception when others then blocked:=true; end;
 if not blocked then raise exception 'Legacy conversion RPC still changes recipe BOM'; end if;
 blocked:=false;
 begin
   update public.inventory_unit_conversions set status='verified'
   where id='00000000-0000-0000-0000-000000000802';
 exception when others then blocked:=true; end;
 if not blocked then raise exception 'Direct SQL verified status was not blocked'; end if;

 v:=public.resolve_inventory_conversion(
   '00000000-0000-0000-0000-000000000802',8,
   'Supplier invoice INV-TEST-802 confirms 8 pieces per sealed pack');
 if v->>'status'<>'verified'
    or (v->>'recipe_bom_modified')::boolean<>false
    or (v->>'stock_changed')::boolean<>false
    or (v->>'finance_changed')::boolean<>false
    or (v->>'units_per_purchase_unit')::numeric<>8
    or v->'qty_per_sale'<>'null'::jsonb then
   raise exception 'Owner verified response inconsistent with no-BOM contract: %',v;
 end if;

 if (select qty_per_sale from public.inventory_recipe_components
     where product_id='00000000-0000-0000-0000-000000000901'
       and inventory_item_id='00000000-0000-0000-0000-000000000102')<>0.30 then
   raise exception 'Verification changed active product recipe usage';
 end if;
 if (select count(*) from public.inventory_purchase_log)<>before_receipts
    or (select count(*) from public.inventory_movements)<>before_movements then
   raise exception 'Verification modified receipts or movements';
 end if;
 if (select count(*) from private.fixture_unit_conversion_audit
    where entity_id='00000000-0000-0000-0000-000000000802'
       and action='owner_verify_pack_conversion_no_bom'
       and details->>'recipe_bom_modified'='false')<>1 then
    raise exception 'Missing evidence audit of owner conversion signoff';
 end if;
 blocked:=false;
 begin
   update public.inventory_unit_conversions set units_per_purchase_unit=9
   where id='00000000-0000-0000-0000-000000000802';
 exception when others then blocked:=true; end;
 if not blocked then raise exception 'Verified factor directly altered without Owner review'; end if;
 blocked:=false;
 begin
   delete from public.inventory_unit_conversions
    where id='00000000-0000-0000-0000-000000000802';
 exception when others then blocked:=true; end;
 if not blocked then raise exception 'Verified conversion deleted without audit'; end if;
 blocked:=false;
 begin
   perform public.resolve_inventory_conversion(
     '00000000-0000-0000-0000-000000000802',9,
     'Invoice correction for different pack factor requires new audit');
 exception when others then blocked:=true; end;
 if not blocked then raise exception 'Different verified factor was silently overwritten'; end if;
 raise notice 'HSN P0.2 OWNER PACK CONVERSION PASS: Owner audit, no active BOM, no Stock/Finance, legacy API blocked.';
end;
$owner$;

-- Cross-brand users and repeated active verified rules must be rejected.
begin;
insert into public.inventory_unit_conversions
(id,brand_id,inventory_item_id,status,purchase_unit,sale_unit,
 units_per_purchase_unit)
values('00000000-0000-0000-0000-000000000803',
       '00000000-0000-0000-0000-000000000002',
       '00000000-0000-0000-0000-000000000102',
       'needs_verification','pack','pcs',8);
do $other$
declare blocked boolean:=false;
begin
 begin
  perform public.resolve_inventory_conversion(
   '00000000-0000-0000-0000-000000000803',8,
   'Invoice test other brand confirms eight pieces, not approved');
 exception when others then blocked:=true; end;
 if not blocked then raise exception 'Owner verified conversion of another tenant'; end if;
end;
$other$;
rollback;
