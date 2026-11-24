-- Exclude unresolved purchase-unit placeholders from unit-aware activity reporting.
create or replace view public.ui_stock_activity_detail_monthly_v1
with (security_invoker = true) as
select
  brand_id,
  date_trunc('month', movement_date)::date as period_month,
  source_movement_type,
  ledger_type,
  coalesce(nullif(btrim(base_unit), ''), 'unit')::text as base_unit,
  count(*)::bigint as movement_rows,
  count(distinct inventory_item_id)::bigint as sku_count,
  coalesce(sum(qty_delta) filter (where qty_delta > 0), 0)::numeric as inbound_qty,
  coalesce(sum(-qty_delta) filter (where qty_delta < 0), 0)::numeric as outbound_qty
from public.inventory_stock_ledger_p4_v1
where base_unit is not null and btrim(base_unit) <> '' and btrim(base_unit) <> 'purchase_unit'
group by brand_id, date_trunc('month', movement_date)::date,
  source_movement_type, ledger_type,
  coalesce(nullif(btrim(base_unit), ''), 'unit');

revoke all on public.ui_stock_activity_detail_monthly_v1 from public, anon;
grant select on public.ui_stock_activity_detail_monthly_v1 to authenticated, service_role;
comment on view public.ui_stock_activity_detail_monthly_v1 is
  'Read-only monthly inventory movement activity split by source type and verified base unit. Excludes purchase_unit placeholders. Inbound/outbound quantities are not aggregated across unlike units; BASELINE is shown separately from transactional receipts.';
