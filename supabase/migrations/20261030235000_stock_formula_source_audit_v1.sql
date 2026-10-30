-- HASNARIA / READ-ONLY STOCK AUDIT - 2026-10-30
-- No new physical counts, purchase receipts, sales consumption, or movement writes.
-- Reproduce the stock formula INDEPENDENTLY of inventory_ledger_balance.
-- Incomplete source evidence is explicitly distinguished from arithmetic accuracy.

create or replace view public.ui_stock_formula_verification_v1
with (security_invoker=true) as
with latest_opname as (
  select distinct on (o.brand_id,o.inventory_item_id)
    o.brand_id,o.inventory_item_id,o.opname_date,o.physical_qty,o.created_at
  from public.inventory_stock_opname o
  where o.opname_date<=current_date
  order by o.brand_id,o.inventory_item_id,o.opname_date desc,o.created_at desc,o.id desc
), movement_rebuild as (
  select o.brand_id,o.inventory_item_id,
    coalesce(sum(m.qty_delta) filter (
      where m.movement_date>o.opname_date and m.movement_date<=current_date
        and m.movement_type='PURCHASE_RECEIPT'
    ),0)::numeric as receipts_after_opname,
    coalesce(sum(-m.qty_delta) filter (
      where m.movement_date>o.opname_date and m.movement_date<=current_date
        and m.movement_type='SALE_CONSUMPTION'
    ),0)::numeric as usage_after_opname,
    coalesce(sum(m.qty_delta) filter (
      where m.movement_date>o.opname_date and m.movement_date<=current_date
        and m.movement_type not in (
          'BASELINE','OPNAME_CORRECTION','PURCHASE_RECEIPT','SALE_CONSUMPTION')
    ),0)::numeric as other_movements_after_opname,
    count(m.id) filter (
      where m.movement_date=o.opname_date
        and m.movement_type in ('PURCHASE_RECEIPT','SALE_CONSUMPTION')
    )::bigint as same_day_ambiguous_rows,
    count(m.id) filter (
      where m.movement_date>o.opname_date and m.movement_date<=current_date
        and m.movement_type='SALE_CONSUMPTION'
        and m.notes='BOM_BASELINE_ESTIMATE_V1'
    )::bigint as estimated_bom_usage_rows,
    count(m.id) filter (
      where m.movement_date>o.opname_date and m.movement_date<=current_date
        and m.movement_type not in ('BASELINE','OPNAME_CORRECTION')
    )::bigint as counted_movement_rows
  from latest_opname o
  left join public.inventory_movements m
    on m.brand_id=o.brand_id and m.inventory_item_id=o.inventory_item_id
       and m.movement_date>=o.opname_date and m.movement_date<=current_date
  group by o.brand_id,o.inventory_item_id,o.opname_date
), rebuilt as (
  select i.brand_id,i.id as inventory_item_id,i.item_name,
         coalesce(i.unit,'') as unit,
         o.opname_date,o.physical_qty,
         case when o.opname_date is not null then mr.receipts_after_opname else null end as receipts_after_opname,
         case when o.opname_date is not null then mr.usage_after_opname else null end as usage_after_opname,
         case when o.opname_date is not null then mr.other_movements_after_opname else null end as other_movements_after_opname,
         case when o.opname_date is not null then
           o.physical_qty+mr.receipts_after_opname-mr.usage_after_opname+mr.other_movements_after_opname
         else null end as independently_calculated_qty,
         r.system_qty as existing_ledger_qty,
         (o.opname_date is not null) as has_physical_baseline,
         coalesce(mr.same_day_ambiguous_rows,0)::bigint as same_day_ambiguous_rows,
         coalesce(mr.estimated_bom_usage_rows,0)::bigint as estimated_bom_usage_rows,
         coalesce(mr.counted_movement_rows,0)::bigint as counted_movement_rows
  from public.inventory_items i
  left join latest_opname o
    on o.brand_id=i.brand_id and o.inventory_item_id=i.id
  left join movement_rebuild mr
    on mr.brand_id=i.brand_id and mr.inventory_item_id=i.id
  left join public.inventory_stock_reconciliation r
    on r.brand_id=i.brand_id and r.inventory_item_id=i.id
)
select b.*,
  case when b.has_physical_baseline
    then b.independently_calculated_qty-b.existing_ledger_qty
    else null end as arithmetic_difference,
  case
    when not b.has_physical_baseline then 'NO_PHYSICAL_BASELINE'
    when b.independently_calculated_qty is distinct from b.existing_ledger_qty
      then 'ARITHMETIC_MISMATCH'
    when b.same_day_ambiguous_rows>0 then 'OPNAME_DAY_AMBIGUOUS'
    when b.estimated_bom_usage_rows>0 then 'ESTIMATED_BOM_USAGE'
    when b.independently_calculated_qty<0 then 'NEGATIVE_LEDGER'
    else 'FORMULA_MATCH_SOURCE_NOT_CERTIFIED'
  end::text as audit_status
from rebuilt b;

revoke all on public.ui_stock_formula_verification_v1 from public,anon;
grant select on public.ui_stock_formula_verification_v1 to authenticated,service_role;
comment on view public.ui_stock_formula_verification_v1 is
 'Independent read-only inventory formula rebuild per SKU; zero arithmetic differences do not imply complete purchase/sale data or physical stock certification.';
