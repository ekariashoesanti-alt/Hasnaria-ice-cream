-- HSN-P0 emergency view-only hotfix (no stock/finance row writes).
-- All balances are taken from the canonical posted movement ledger. In particular,
-- draft/active BOM consumption is NOT itself a posted stock movement.
-- Breakdown purchase_qty/sales_usage_qty is informative; other future movement
-- types (e.g. WASTE) may affect system_qty without appearing in those two fields.
-- Rollback: supabase/rollback/20261018201000_restore_pre_hotfix_inventory_stock_reconciliation.sql
create or replace view public.inventory_stock_reconciliation
with (security_invoker = true)
as
with ledger as materialized (select * from public.inventory_ledger_balance),
latest_opname as (
  select distinct on (o.brand_id,o.inventory_item_id)
    o.brand_id,o.inventory_item_id,o.opname_date,o.system_qty as opname_system_qty,
    o.physical_qty,o.variance
  from public.inventory_stock_opname o
  where o.opname_date <= current_date
  order by o.brand_id,o.inventory_item_id,o.opname_date desc,o.created_at desc
), posted_breakdown as (
  select l.brand_id,l.inventory_item_id,
    coalesce(sum(m.qty_delta) filter(where m.movement_type='PURCHASE_RECEIPT'),0::numeric) as purchase_qty,
    coalesce(sum(-m.qty_delta) filter(where m.movement_type='SALE_CONSUMPTION'),0::numeric) as sales_usage_qty
  from ledger l
  left join public.inventory_movements m
    on m.brand_id=l.brand_id and m.inventory_item_id=l.inventory_item_id
   and l.tracking_active
   and m.movement_date > l.baseline_date
   and m.movement_date <= current_date
  group by l.brand_id,l.inventory_item_id
)
select
  l.brand_id,l.inventory_item_id,l.item_name,l.category,l.unit,l.min_qty,l.order_qty,
  l.baseline_date,l.baseline_qty,
  coalesce(pb.purchase_qty,0::numeric) as purchase_qty,
  coalesce(pb.sales_usage_qty,0::numeric) as sales_usage_qty,
  l.ledger_qty as system_qty,
  o.opname_date as last_opname_date,
  o.physical_qty as last_physical_qty,
  o.opname_system_qty as last_opname_system_qty,
  o.variance as last_variance,
  l.tracking_active,
  l.status
from ledger l
left join latest_opname o
  on o.brand_id=l.brand_id and o.inventory_item_id=l.inventory_item_id
left join posted_breakdown pb
  on pb.brand_id=l.brand_id and pb.inventory_item_id=l.inventory_item_id;

grant select on public.inventory_stock_reconciliation to authenticated;
comment on view public.inventory_stock_reconciliation is
  'Balances exactly follow inventory_ledger_balance posted movements; purchase/sale columns are breakdown only; opname/audit history unchanged.';
