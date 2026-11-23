-- HSN-426: read-only, unit-aware monthly purchase vs verified BOM usage reporting.
-- Applied to production on 2026-11-23. No transaction or stock rows are modified.
create or replace view public.ui_stock_purchase_usage_monthly_v1
with (security_invoker = true)
as
with eligible_purchase as (
  select
    l.brand_id,
    date_trunc('month', l.movement_date)::date as period_month,
    lower(btrim(l.base_unit)) as base_unit,
    l.inventory_item_id,
    l.qty_delta::numeric as qty,
    l.id
  from public.inventory_stock_ledger_p4_v1 l
  where l.ledger_type = 'PURCHASE'
    and l.qty_delta > 0
    and l.base_unit is not null
    and lower(btrim(l.base_unit)) not in ('', 'purchase_unit', 'unknown', 'unit', '?', '-')
),
eligible_usage as (
  select
    l.brand_id,
    date_trunc('month', l.movement_date)::date as period_month,
    lower(btrim(l.base_unit)) as base_unit,
    l.inventory_item_id,
    (-l.qty_delta)::numeric as qty,
    l.id
  from public.inventory_stock_ledger_p4_v1 l
  join public.sale_items si
    on si.id = l.reference_id
   and l.reference_type = 'sale_item'
  join public.sales s
    on s.id = si.sale_id
   and s.brand_id = l.brand_id
   and s.sold_at = l.movement_date
  join public.product_recipe_verifications rv
    on rv.brand_id = s.brand_id
   and rv.product_id = si.product_id
   and rv.status = 'verified'
   and rv.effective_from is not null
   and rv.effective_from <= s.sold_at
  where l.ledger_type = 'SALE'
    and l.qty_delta < 0
    and l.base_unit is not null
    and lower(btrim(l.base_unit)) not in ('', 'purchase_unit', 'unknown', 'unit', '?', '-')
    and exists (
      select 1
      from public.inventory_recipe_components rc
      where rc.brand_id = s.brand_id
        and rc.product_id = si.product_id
        and rc.inventory_item_id = l.inventory_item_id
        and rc.active
    )
    and not exists (
      select 1
      from public.inventory_recipe_components rc
      where rc.brand_id = s.brand_id
        and rc.product_id = si.product_id
        and rc.active
        and (
          rc.bom_status <> 'verified'
          or rc.qty_per_sale is null
          or rc.qty_per_sale <= 0
        )
    )
),
monthly as (
  select
    brand_id,
    period_month,
    base_unit,
    sum(qty) filter (where source_kind = 'purchase') as purchase_qty,
    sum(qty) filter (where source_kind = 'usage') as usage_qty,
    count(*) filter (where source_kind = 'purchase')::integer as purchase_rows,
    count(*) filter (where source_kind = 'usage')::integer as usage_rows,
    count(distinct inventory_item_id) filter (where source_kind = 'purchase')::integer as purchase_skus,
    count(distinct inventory_item_id) filter (where source_kind = 'usage')::integer as usage_skus
  from (
    select brand_id, period_month, base_unit, inventory_item_id, qty, id, 'purchase'::text as source_kind
    from eligible_purchase
    union all
    select brand_id, period_month, base_unit, inventory_item_id, qty, id, 'usage'::text as source_kind
    from eligible_usage
  ) x
  group by brand_id, period_month, base_unit
)
select
  brand_id,
  period_month,
  base_unit,
  coalesce(purchase_qty, 0)::numeric as purchase_qty,
  coalesce(usage_qty, 0)::numeric as usage_qty,
  coalesce(purchase_rows, 0)::integer as purchase_rows,
  coalesce(usage_rows, 0)::integer as usage_rows,
  coalesce(purchase_skus, 0)::integer as purchase_skus,
  coalesce(usage_skus, 0)::integer as usage_skus,
  (coalesce(purchase_rows, 0) > 0) as has_purchase_data,
  (coalesce(usage_rows, 0) > 0) as has_verified_usage_data,
  case when coalesce(usage_rows, 0) > 0 then 'verified' else 'not_available' end::text as usage_data_status
from monthly;

comment on view public.ui_stock_purchase_usage_monthly_v1 is
'Read-only monthly stock purchase vs verified BOM usage, grouped by base unit. Excludes placeholder units and estimates; usage requires a verified effective product recipe and fully verified active components.';

revoke all on public.ui_stock_purchase_usage_monthly_v1 from anon, public;
grant select on public.ui_stock_purchase_usage_monthly_v1 to authenticated;
