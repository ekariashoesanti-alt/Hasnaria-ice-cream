create or replace view public.inventory_stock_reconciliation
with (security_invoker = true)
as
with latest_opname as (
  select distinct on (o.brand_id, o.inventory_item_id)
    o.brand_id,
    o.inventory_item_id,
    o.opname_date,
    o.system_qty as opname_system_qty,
    o.physical_qty,
    o.variance,
    o.created_at
  from public.inventory_stock_opname o
  where o.opname_date <= current_date
  order by o.brand_id, o.inventory_item_id, o.opname_date desc, o.created_at desc
),
base as (
  select
    i.id as inventory_item_id,
    i.brand_id,
    i.item_name,
    i.category,
    coalesce(i.unit, 'pcs') as unit,
    coalesce(i.min_qty, 0) as min_qty,
    coalesce(i.order_qty, 0) as order_qty,
    coalesce(lo.opname_date, current_date) as baseline_date,
    coalesce(lo.physical_qty, i.opening_qty, 0) as baseline_qty,
    (lo.opname_date is not null) as tracking_active,
    lo.opname_date as last_opname_date,
    lo.physical_qty as last_physical_qty,
    lo.opname_system_qty as last_opname_system_qty,
    lo.variance as last_variance
  from public.inventory_items i
  left join latest_opname lo
    on lo.brand_id = i.brand_id
   and lo.inventory_item_id = i.id
),
tracked_base as (
  select * from base where tracking_active
),
purchase_totals as (
  select
    b.brand_id,
    b.inventory_item_id,
    coalesce(sum(l.qty), 0) as purchase_qty
  from tracked_base b
  left join public.inventory_purchase_log l
    on l.brand_id = b.brand_id
   and l.inventory_item_id = b.inventory_item_id
   and l.purchase_date > b.baseline_date
   and l.purchase_date <= current_date
  group by b.brand_id, b.inventory_item_id
),
sales_totals as (
  select
    b.brand_id,
    b.inventory_item_id,
    coalesce(sum(si.qty::numeric * r.qty_per_sale), 0) as sales_usage_qty
  from tracked_base b
  join public.inventory_recipe_components r
    on r.brand_id = b.brand_id
   and r.inventory_item_id = b.inventory_item_id
   and r.active
  join public.sale_items si
    on si.product_id = r.product_id
  join public.sales s
    on s.id = si.sale_id
   and s.brand_id = b.brand_id
   and s.sold_at > b.baseline_date
   and s.sold_at <= current_date
  group by b.brand_id, b.inventory_item_id
)
select
  b.brand_id,
  b.inventory_item_id,
  b.item_name,
  b.category,
  b.unit,
  b.min_qty,
  b.order_qty,
  b.baseline_date,
  b.baseline_qty,
  coalesce(p.purchase_qty, 0) as purchase_qty,
  coalesce(st.sales_usage_qty, 0) as sales_usage_qty,
  b.baseline_qty + coalesce(p.purchase_qty, 0) - coalesce(st.sales_usage_qty, 0) as system_qty,
  b.last_opname_date,
  b.last_physical_qty,
  b.last_opname_system_qty,
  b.last_variance,
  b.tracking_active,
  case
    when not b.tracking_active then 'untracked'
    when b.baseline_qty + coalesce(p.purchase_qty, 0) - coalesce(st.sales_usage_qty, 0) <= 0 then 'critical'
    when b.min_qty > 0 and b.baseline_qty + coalesce(p.purchase_qty, 0) - coalesce(st.sales_usage_qty, 0) < b.min_qty then 'order'
    else 'ok'
  end as status
from base b
left join purchase_totals p
  on p.brand_id = b.brand_id
 and p.inventory_item_id = b.inventory_item_id
left join sales_totals st
  on st.brand_id = b.brand_id
 and st.inventory_item_id = b.inventory_item_id;

grant select on public.inventory_stock_reconciliation to authenticated;

comment on view public.inventory_stock_reconciliation is
  'Reconciled stock optimized for tracked items only. Untracked items do not scan purchase/sales usage; sales usage is computed only for tracked items with active BOM. Future-dated movements remain excluded.';
