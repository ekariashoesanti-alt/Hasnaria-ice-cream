-- Only disposable CI after pausing private.owner_master_unit_apply/revoke.
-- Verify Owner can still read the review queue but cannot mutate audit rows.
create temporary table p0_master_pause_before as
 select count(*)::bigint as rows_before from private.inventory_master_unit_attestations_v1;
select set_config('app.test_uid','00000000-0000-0000-0000-000000009999',false);
select set_config('app.test_role','owner',false);
set role authenticated;
do $paused$
declare denied boolean:=false; q jsonb;
begin
 begin
  perform public.owner_master_unit_apply_v1(
    '00000000-0000-0000-0000-000000000101',
    'DOCUMENT_UNIT','pcs','fake-token',
    'Invoice supplier SKU 101', 'Emergency-pause unit documentary proof must not be saved');
 exception when others then denied:=position('P0.2 PAUSED' in sqlerrm)>0; end;
 if not denied then raise exception 'P0.2 pause allowed Owner master-unit approval';end if;
 denied:=false;
 begin
  perform public.owner_master_unit_revoke_v1(
     '00000000-0000-0000-0000-000000000401',
     'Emergency-pause revoked a historical master-unit attestation');
 exception when others then denied:=position('P0.2 PAUSED' in sqlerrm)>0; end;
 if not denied then raise exception 'P0.2 pause allowed Owner master-unit revoke';end if;
 q:=public.owner_master_unit_queue_v1(true);
 if q->'items' is null or q->>'mode'<>'document_master_only_no_stock_sale_or_finance_mutation' then
   raise exception 'Emergency pause broke Master SKU Owner read-only queue: %',q;end if;
 raise notice 'HSN P0.2 MASTER EMERGENCY PAUSE PASS: authenticated Owner cannot write; queue readable.';
end;
$paused$;
reset role;
do $check$
begin
 if (select count(*) from private.inventory_master_unit_attestations_v1)
      is distinct from (select rows_before from pg_temp.p0_master_pause_before) then
   raise exception 'Emergency pause modified previous documentary master-unit reviews';
 end if;
end;
$check$;
