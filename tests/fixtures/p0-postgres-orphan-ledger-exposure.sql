-- P0 priority #1 regression against disposable Postgres 17 only.
-- Historic orphan must remain forensic evidence, with no movement active after
-- the last physical count and no mismatched/missing receipt movements.
do $baseline$
declare v record;
begin
 select * into v from private.orphan_receipt_active_ledger_gate_v1
 where receipt_id='00000000-0000-0000-0000-000000000302';
 if not found
    or v.tracking_active
    or v.active_ledger_exposure
    or v.movement_integrity_failed
    or v.receipt_movement_count<>1
    or v.movement_matching_keys<>1
    or v.movement_qty<>6
    or v.gate_status<>'HISTORICAL_NO_OPNAME_BASELINE' then
  raise exception 'Old orphan must be preserved with matching movement/no live exposure: %',to_jsonb(v);
 end if;
 if has_table_privilege('anon','private.orphan_receipt_active_ledger_gate_v1','SELECT')
    or has_table_privilege('authenticated','private.orphan_receipt_active_ledger_gate_v1','SELECT') then
  raise exception 'Private Stock lineage exposure report unexpectedly public';
 end if;
 if (select count(*) from public.offline_purchase_history
     where id='00000000-0000-0000-0000-000000000299')<>0 then
  raise exception 'Read-only receipt audit inserted missing canonical Purchase';
 end if;
 raise notice 'HSN-P0 ORPHAN LEDGER BASELINE PASS: historical evidence and movement preserved; no live impact.';
end;
$baseline$;

-- Scenario 1: a new physical count AFTER the stale receipt date must
-- exclude the old purchase from current Stock, not delete it.
begin;
insert into public.inventory_stock_opname
(brand_id,inventory_item_id,opname_date,system_qty,physical_qty,variance)
values('00000000-0000-0000-0000-000000000001',
       '00000000-0000-0000-0000-000000000103',current_date-2,0,0,0);
do $after$
declare v record;
begin
 select * into v from private.orphan_receipt_active_ledger_gate_v1
 where receipt_id='00000000-0000-0000-0000-000000000302';
 if not found or not v.tracking_active or v.active_ledger_exposure
    or v.gate_status<>'HISTORICAL_PRIOR_TO_PHYSICAL_OPNAME' then
    raise exception 'Orphan before last physical count should be historical only: %',to_jsonb(v);
 end if;
end;
$after$;
rollback;

-- Scenario 2: if the physical count is BEFORE the orphan receipt/movement,
-- this source is counted in today's Stock and MUST BLOCK the release.
begin;
insert into public.inventory_stock_opname
(brand_id,inventory_item_id,opname_date,system_qty,physical_qty,variance)
values('00000000-0000-0000-0000-000000000001',
       '00000000-0000-0000-0000-000000000103',current_date-10,0,0,0);
do $prior$
declare v record;
begin
 select * into v from private.orphan_receipt_active_ledger_gate_v1
 where receipt_id='00000000-0000-0000-0000-000000000302';
 if not found or not v.tracking_active or not v.active_ledger_exposure
    or v.active_movement_count<>1
    or v.gate_status<>'BLOCK_RELEASE_ACTIVE_ORPHAN' then
    raise exception 'Active receipt orphan must be release blocking: %',to_jsonb(v);
 end if;
 raise notice 'HSN-P0 ACTIVE ORPHAN DETECTION PASS: release blocked when physical baseline precedes orphan.';
end;
$prior$;
rollback;

-- Scenario 3: movement is missing/corrupt, still block without silently
-- inventing a replacement and without rewriting historical Purchase.
begin;
delete from public.inventory_movements
where reference_id='00000000-0000-0000-0000-000000000302'
  and movement_type='PURCHASE_RECEIPT';
do $missing$
declare v record;
begin
 select * into v from private.orphan_receipt_active_ledger_gate_v1
 where receipt_id='00000000-0000-0000-0000-000000000302';
 if not found or not v.movement_integrity_failed or v.receipt_movement_count<>0
    or v.gate_status<>'BLOCK_RELEASE_RECEIPT_MOVEMENT_MISMATCH' then
   raise exception 'Missing old receipt movement must block release: %',to_jsonb(v);
 end if;
end;
$missing$;
rollback;

-- Scenario 4: duplicate generated movement likewise blocks release.
begin;
insert into public.inventory_movements
 (brand_id,inventory_item_id,movement_date,movement_type,qty_delta,
  reference_type,reference_id)
values('00000000-0000-0000-0000-000000000001',
       '00000000-0000-0000-0000-000000000103',current_date-9,
       'PURCHASE_RECEIPT',6,'inventory_purchase_log',
       '00000000-0000-0000-0000-000000000302');
do $duplicate$
declare v record;
begin
 select * into v from private.orphan_receipt_active_ledger_gate_v1
 where receipt_id='00000000-0000-0000-0000-000000000302';
 if not found or not v.movement_integrity_failed or v.receipt_movement_count<>2
   or v.gate_status<>'BLOCK_RELEASE_RECEIPT_MOVEMENT_MISMATCH' then
  raise exception 'Duplicate generated receipt movement must block release: %',to_jsonb(v);
 end if;
end;
$duplicate$;
rollback;

do $final$
begin
 if (select count(*) from private.orphan_receipt_active_ledger_gate_v1
    where active_ledger_exposure or movement_integrity_failed)<>0 then
    raise exception 'Rollback left invalid orphan-ledger exposure';
 end if;
 if (select count(*) from public.inventory_purchase_log
    where source_history_id='00000000-0000-0000-0000-000000000299')<>1 then
    raise exception 'Testing changed old orphan receipt history';
 end if;
 raise notice 'HSN-P0 ORPHAN LEDGER REGRESSION PASS: no exposure, bad links correctly blocked, history unchanged.';
end;
$final$;
