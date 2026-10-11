-- Disposable PostgreSQL fixture: documentary Owner review for SKU master unit.
-- Runs entirely in one disposable transaction, rolled back after assertions.
-- Does not pollute later legacy RLS/rollback fixtures with extra SKU rows.
begin;
insert into public.inventory_items(
 id,brand_id,item_name,category,unit,opening_qty)
values
 ('00000000-0000-0000-0000-000000000180',
  '00000000-0000-0000-0000-000000000001',
  'P0 RECIPE PLACEHOLDER','Bahan','purchase_unit',0),
 ('00000000-0000-0000-0000-000000000181',
  '00000000-0000-0000-0000-000000000001',
  'UNUSED PLACEHOLDER','Kemasan','purchase_unit',0);
insert into public.inventory_recipe_components(
 brand_id,inventory_item_id,product_id,qty_per_sale,active)
values('00000000-0000-0000-0000-000000000001',
       '00000000-0000-0000-0000-000000000180',
       '00000000-0000-0000-0000-000000000901',0.5,true);
do $queue$
declare p jsonb; all_rows jsonb; pv jsonb; b boolean:=false;
begin
 p:=public.owner_master_unit_queue_v1(true);
 all_rows:=public.owner_master_unit_queue_v1(false);
 if (p->>'total')::integer<>1
  or (all_rows->>'total')::integer<>2
  or p->'items'->0->>'item_id'<>'00000000-0000-0000-0000-000000000180'
  or p->'items'->0->>'priority'<>'P0_ACTIVE_DEPENDENCY'
  or p->'items'->0->>'status'<>'REQUIRES_MASTER_UNIT_REVIEW' then
   raise exception 'Owner master-unit triage failed to prioritize active 1 of 2 placeholders: %',p;
 end if;
 begin
  perform public.owner_master_unit_preview_v1(
   '00000000-0000-0000-0000-000000000180','DOCUMENT_UNIT','purchase_unit');
 exception when others then b:=true;end;
 if not b then raise exception 'Placeholder unit was approved as a real physical unit';end if;
 b:=false;
 begin
  perform public.owner_master_unit_preview_v1(
   '00000000-0000-0000-0000-000000000180','NOT_FOR_STOCK','pcs');
 exception when others then b:=true;end;
 if not b then raise exception 'NOT_FOR_STOCK should not carry fictitious unit';end if;
 pv:=public.owner_master_unit_preview_v1(
 '00000000-0000-0000-0000-000000000180','DOCUMENT_UNIT','pcs');
 if pv->>'priority'<>'P0_ACTIVE_DEPENDENCY'
    or pv->>'master_unit'<>'purchase_unit'
    or pv->>'proposed_stock_unit'<>'pcs'
    or (pv->>'master_will_change')::boolean
    or (pv->>'stock_will_change')::boolean then
    raise exception 'Master-unit preview must be documentary only and show recipe dependencies: %',pv;
 end if;
 raise notice 'HSN P0.2 MASTER QUEUE PASS: critical recipe SKU prioritized; placeholder blocked.';
end;
$queue$;

savepoint stage11_changed_master;
update public.inventory_items set unit='pack'
where id='00000000-0000-0000-0000-000000000180';
do $changed$
declare denied boolean:=false;
begin
 begin
  perform public.owner_master_unit_preview_v1(
   '00000000-0000-0000-0000-000000000180','DOCUMENT_UNIT','pcs');
 exception when others then denied:=true;end;
 if not denied then raise exception 'Stale master unit was approved after changed source';end if;
end;
$changed$;
rollback to savepoint stage11_changed_master;

do $apply$
declare pv jsonb; rec jsonb; v_review_id uuid; denied boolean:=false;
 v_receipts bigint;v_movements bigint;v_recipes bigint;
begin
 select count(*) into v_receipts from public.inventory_purchase_log;
 select count(*) into v_movements from public.inventory_movements;
 select count(*) into v_recipes from public.inventory_recipe_components;
 pv:=public.owner_master_unit_preview_v1(
   '00000000-0000-0000-0000-000000000180','DOCUMENT_UNIT','pcs');
 begin
  perform public.owner_master_unit_apply_v1(
    '00000000-0000-0000-0000-000000000180','DOCUMENT_UNIT','pcs',
    'bad-token','Supplier invoice fixture XX180',
    'Owner inspected an example pack and documented pcs, no Stock change');
 exception when others then denied:=true;end;
 if not denied then raise exception 'Invalid master-unit preview token accepted';end if;
 rec:=public.owner_master_unit_apply_v1(
   '00000000-0000-0000-0000-000000000180','DOCUMENT_UNIT','pcs',
   pv->>'token','Supplier invoice fixture number XX104',
   'Owner inspected an example pack and documented the pcs unit without posting Stock');
 v_review_id:=(rec->>'review_id')::uuid;
 if rec->>'status'<>'DOCUMENTED_NOT_APPLIED' or v_review_id is null then
  raise exception 'Master documentary attestation not recorded: %',rec;
 end if;
 if (select unit from public.inventory_items
      where id='00000000-0000-0000-0000-000000000180')<>'purchase_unit'
    or (select count(*) from public.inventory_purchase_log)<>v_receipts
    or (select count(*) from public.inventory_movements)<>v_movements
    or (select count(*) from public.inventory_recipe_components)<>v_recipes then
    raise exception 'Documenting master unit mutated active inventory, receipt or recipe';
 end if;
 denied:=false;
 begin
  perform public.owner_master_unit_apply_v1(
    '00000000-0000-0000-0000-000000000180','DOCUMENT_UNIT','pcs',
    pv->>'token','Supplier invoice fixture XX104',
    'Owner must not duplicate previous documentary review on the same SKU');
 exception when others then denied:=true;end;
 if not denied then raise exception 'Duplicate active master-unit review accepted';end if;
 if (public.owner_master_unit_queue_v1(true)->'items'->0->>'status')
   <>'DOCUMENTED_NOT_APPLIED' then
   raise exception 'Owner queue does not show documentary approval';
 end if;
 perform public.owner_master_unit_revoke_v1(v_review_id,
  'Owner found documentation that requires rechecking before the master is changed');
 if (select count(*) from private.inventory_master_unit_attestations_v1
      where id=v_review_id and revoked_at is not null)<>1 then
   raise exception 'Master review revocation failed to preserve audit trail';
 end if;
 if (public.owner_master_unit_queue_v1(true)->'items'->0->>'status')
   <>'REQUIRES_MASTER_UNIT_REVIEW' then
   raise exception 'Revoking master evidence did not reopen queue';
 end if;
 if has_table_privilege('authenticated','private.inventory_master_unit_attestations_v1','SELECT')
  or has_table_privilege('authenticated','private.inventory_master_unit_attestations_v1','INSERT') then
   raise exception 'Private master review data exposed directly to authenticated';
 end if;
 raise notice 'HSN P0.2 MASTER REVIEW PASS: approved and revoked, 0 Stock/BOM/Finance mutation';
end;
$apply$;

rollback;
