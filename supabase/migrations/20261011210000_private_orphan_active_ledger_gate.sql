-- Hasnaria P0 #1: evidence-preserving detection of old broken Purchase UUIDs.
-- ADDITIVE PRIVATE READ-ONLY VIEW. No modification of business data.
-- Existing orphan receipts are retained for forensic attribution; do not
-- relink an invoice evidence row to an unrelated canonical Purchase UUID.
-- A row is CURRENTLY LEDGER-RELEVANT only if its receipt or its linked
-- PURCHASE_RECEIPT movement is after the latest physical baseline.
-- All checks are per brand/SKU and never assume a missing physical baseline
-- is proof of a real current on-hand balance.
create or replace view private.orphan_receipt_active_ledger_gate_v1
with (security_invoker = true)
as
with broken as (
 select l.brand_id,
        l.id as receipt_id,
        l.source_history_id as stale_purchase_uuid,
        l.inventory_item_id,
        i.item_name as sku_name,
        l.purchase_date,
        l.qty as receipt_qty,
        l.unit as receipt_unit,
        l.total_amount as historical_receipt_value,
        coalesce(r.tracking_active,false) as tracking_active,
        r.last_opname_date,
        r.baseline_date,
        coalesce(r.tracking_active,false)
         and l.purchase_date>r.baseline_date
         and l.purchase_date<=current_date as receipt_after_baseline
 from public.inventory_purchase_log l
 join public.inventory_items i
   on i.brand_id=l.brand_id and i.id=l.inventory_item_id
 left join public.offline_purchase_history p
   on p.brand_id=l.brand_id and p.id=l.source_history_id
 left join public.inventory_stock_reconciliation r
   on r.brand_id=l.brand_id and r.inventory_item_id=l.inventory_item_id
 where l.source_history_id is not null and p.id is null
)
select b.*,
       coalesce(m.receipt_movement_count,0) as receipt_movement_count,
       coalesce(m.movement_qty,0) as movement_qty,
       coalesce(m.movement_matching_keys,0) as movement_matching_keys,
       coalesce(m.active_movement_count,0) as active_movement_count,
       (b.receipt_after_baseline
        or coalesce(m.active_movement_count,0)>0) as active_ledger_exposure,
       (coalesce(m.receipt_movement_count,0)<>1
         or coalesce(m.movement_matching_keys,0)<>1
         or coalesce(m.movement_qty,0) is distinct from b.receipt_qty)
         as movement_integrity_failed,
       case
         when b.receipt_after_baseline or coalesce(m.active_movement_count,0)>0
           then 'BLOCK_RELEASE_ACTIVE_ORPHAN'
         when coalesce(m.receipt_movement_count,0)<>1
           or coalesce(m.movement_matching_keys,0)<>1
           or coalesce(m.movement_qty,0) is distinct from b.receipt_qty
           then 'BLOCK_RELEASE_RECEIPT_MOVEMENT_MISMATCH'
         when not b.tracking_active then 'HISTORICAL_NO_OPNAME_BASELINE'
         else 'HISTORICAL_PRIOR_TO_PHYSICAL_OPNAME'
       end as gate_status
from broken b
left join lateral (
 select count(*)::bigint as receipt_movement_count,
        coalesce(sum(m.qty_delta),0) as movement_qty,
        count(*) filter (
          where m.brand_id=b.brand_id
            and m.inventory_item_id=b.inventory_item_id
            and m.movement_date=b.purchase_date
            and m.qty_delta=b.receipt_qty
            and m.reference_type='inventory_purchase_log'
        )::bigint as movement_matching_keys,
        count(*) filter (
          where b.tracking_active
            and m.movement_date>b.baseline_date
            and m.movement_date<=current_date
        )::bigint as active_movement_count
 from public.inventory_movements m
 where m.reference_id=b.receipt_id
   and m.movement_type='PURCHASE_RECEIPT'
) m on true;

revoke all on private.orphan_receipt_active_ledger_gate_v1
  from public, anon, authenticated;
comment on view private.orphan_receipt_active_ledger_gate_v1 is
 'P0 #1 read-only gate: old Purchase source UUID is missing, but active ledger movement or missing/incorrect receipt movement is release-blocking; never auto-rebind historical Stock or Finance.';
