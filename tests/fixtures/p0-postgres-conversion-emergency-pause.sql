-- Isolated CI after pausing Owner conversion; all checks are read-only.
select set_config('app.test_role','owner',false);
select set_config('app.test_uid','00000000-0000-0000-0000-000000009999',false);
do $test$
declare bad boolean:=false; n int;
begin
 begin
  perform public.resolve_inventory_conversion(
    '00000000-0000-0000-0000-000000000802',8,
    'Owner invoice SUP-802 still confirms eight pieces per sealed pack');
 exception when others then
   bad:=position('dihentikan sementara' in sqlerrm)>0;
 end;
 if not bad then
   raise exception 'Emergency conversion pause did not block Owner writes';
 end if;
 if (select count(*) from public.inventory_unit_conversions
     where id='00000000-0000-0000-0000-000000000802'
       and status='verified' and units_per_purchase_unit=8)<>1 then
   raise exception 'Emergency conversion pause changed verified factor';
 end if;
 if (select qty_per_sale from public.inventory_recipe_components
     where product_id='00000000-0000-0000-0000-000000000901'
       and inventory_item_id='00000000-0000-0000-0000-000000000102')<>0.30 then
   raise exception 'Emergency conversion pause touched recipe BOM';
 end if;
 raise notice 'HSN P0.2 EMERGENCY PAUSE PASS: approval blocked, verified factor and BOM unchanged.';
end;
$test$;
