-- HSN-P0 PostgreSQL fixture assertions. Runs only against disposable CI database.
-- "ON_ERROR_STOP=1" is mandatory; exceptions expected here are caught explicitly.
do $test$
declare
  brand constant uuid := '00000000-0000-0000-0000-000000000001';
  posted_old constant uuid := '00000000-0000-0000-0000-000000000301';
  orphan_old constant uuid := '00000000-0000-0000-0000-000000000302';
  results jsonb;
  still_exists integer;
  n integer;
  balance numeric;
  rejected boolean;
begin
  -- Both valid direct source units and pack conversions must be applied.
  results := private.sync_purchase_quantity_stock_v1(brand,current_date-20,current_date);
  if (results->>'total_stock_candidates')::integer <> 6
     or (results->>'eligible_stock_rows')::integer <> 3
     or (results->>'blocked_for_unit_review')::integer <> 3
     or (results->>'synced_stock_rows')::integer <> 3 then
    raise exception 'Expected 6 candidates, 3 qualified and 3 inserted: %',results;
  end if;

  select count(*) into n from public.inventory_purchase_log
  where brand_id=brand and source_history_id in (
     '00000000-0000-0000-0000-000000000202',
     '00000000-0000-0000-0000-000000000203',
     '00000000-0000-0000-0000-000000000205');
  if n<>3 then raise exception 'Qualified receipts missing: %',n; end if;

  select qty into balance from public.inventory_purchase_log
    where source_history_id='00000000-0000-0000-0000-000000000203';
  if balance<>40 then raise exception 'Verified 2 pack * 20 pcs did not convert to 40 pcs: %',balance; end if;

  select qty into balance from public.inventory_purchase_log
    where source_history_id='00000000-0000-0000-0000-000000000205';
  if balance<>12 then raise exception 'Owner-reviewed 1 pack * 12 pcs not posted: %',balance; end if;

  select count(*) into n from public.inventory_purchase_log
  where source_history_id in (
    '00000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000204');
  if n<>0 then raise exception 'Missing/unverified source units incorrectly posted: %',n; end if;

  -- Append-only + idempotent: a second sync should write zero receipts.
  results := private.sync_purchase_quantity_stock_v1(brand,current_date-20,current_date);
  if (results->>'synced_stock_rows')::integer<>0 then
    raise exception 'Second sync inserted duplicate receipts: %',results;
  end if;

  select count(*) into still_exists from public.inventory_purchase_log
  where id=posted_old and qty=1 and unit='pack' and total_amount=100;
  if still_exists<>1 then raise exception 'Old receipt silently overwritten'; end if;
  select count(*) into still_exists from public.inventory_purchase_log
  where id=orphan_old and source_history_id='00000000-0000-0000-0000-000000000299';
  if still_exists<>1 then raise exception 'Orphan historical receipt deleted'; end if;

  rejected := false;
  begin
    delete from public.inventory_purchase_log where id=posted_old;
  exception when foreign_key_violation then rejected := true;
  end;
  if not rejected then raise exception 'DELETE of canonical Stock receipt should fail'; end if;

  rejected := false;
  begin
    delete from public.inventory_purchase_log where id=orphan_old;
  exception when foreign_key_violation then rejected := true;
  end;
  if not rejected then raise exception 'DELETE of orphan receipt should fail'; end if;

  rejected := false;
  begin
    update public.inventory_purchase_log
      set source_history_id='00000000-0000-0000-0000-000000000203'
      where id=posted_old;
  exception when foreign_key_violation then rejected := true;
  end;
  if not rejected then raise exception 'Receipt source rebind should fail'; end if;

  rejected := false;
  begin
    update public.inventory_purchase_log
      set id='00000000-0000-0000-0000-000000000399' where id=posted_old;
  exception when foreign_key_violation then rejected := true;
  end;
  if not rejected then raise exception 'Receipt primary-key rewrite should fail'; end if;

  rejected := false;
  begin
    delete from public.offline_purchase_history
      where id='00000000-0000-0000-0000-000000000206';
  exception when foreign_key_violation then rejected := true;
  end;
  if not rejected then raise exception 'Canonical Purchase source deletion should fail'; end if;

  rejected := false;
  begin
    update public.offline_purchase_history set unit_text='pcs'
      where id='00000000-0000-0000-0000-000000000206';
  exception when foreign_key_violation then rejected := true;
  end;
  if not rejected then raise exception 'Canonical Purchase source change should fail'; end if;

  rejected := false;
  begin
    insert into public.inventory_purchase_log(
      brand_id,inventory_item_id,purchase_date,qty,unit,total_amount,
      source_history_id,source_file,source_row_no)
    values (brand,'00000000-0000-0000-0000-000000000101',
            current_date-5,4,'pcs',400,
            '00000000-0000-0000-0000-000000000204','synthetic.xlsx',4);
  exception when check_violation then rejected := true;
  end;
  if not rejected then raise exception 'Missing Purchase unit accepted for manual posting'; end if;

  -- Simulate generated purchase movement after opname to check Stock view parity.
  insert into public.inventory_movements(
    brand_id,inventory_item_id,movement_date,movement_type,qty_delta)
  values(brand,'00000000-0000-0000-0000-000000000102',
         current_date-5,'PURCHASE_RECEIPT',3);
  select system_qty into balance from public.inventory_stock_reconciliation
    where brand_id=brand and inventory_item_id='00000000-0000-0000-0000-000000000102';
  if balance<>11 then raise exception 'Opname 10 + purchase 3 - posted sale 2 != 11; actual %',balance; end if;

  if not exists(
    select 1 from pg_class
    where oid='public.inventory_stock_reconciliation'::regclass
      and reloptions @> array['security_invoker=true']::text[]
  ) then raise exception 'Stock reconciliation view must be security_invoker'; end if;
  raise notice 'HSN-P0 PASS: 6 candidates, 3 verified receipts, 3 blocked; duplicate=0; source/deletion safeguards passed; Stock parity=11.';
end;
$test$;
