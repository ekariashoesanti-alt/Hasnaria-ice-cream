-- Stock monthly end-of-period totals from the latest physical checkpoint <= cutoff.
-- Read-only view, security_invoker, no inventory mutations.
-- Never reconstruct periods before a physical checkpoint or mix SKU units.
create or replace view public.ui_stock_month_end_trend_v1
with (security_invoker = true) as
with periods as (
  select generate_series(
    (date_trunc('month', current_date) - interval '23 months')::date,
    date_trunc('month', current_date)::date,
    interval '1 month'
  )::date as period_month
),
sku_period as (
  select i.brand_id,i.id as inventory_item_id,
    btrim(i.unit) as unit,p.period_month,
    least((p.period_month + interval '1 month - 1 day')::date,current_date) as cutoff_date,
    o.opname_date,o.physical_qty,
    coalesce(sum(m.qty_delta) filter (
      where m.movement_date>o.opname_date
        and m.movement_type not in ('BASELINE','OPNAME_CORRECTION')
    ),0)::numeric as movement_delta,
    count(m.id) filter (
      where m.movement_date=o.opname_date
        and m.movement_type in ('PURCHASE_RECEIPT','SALE_CONSUMPTION')
    )::bigint as same_day_movement_rows,
    count(m.id) filter (
      where m.movement_date>o.opname_date
        and m.movement_type='SALE_CONSUMPTION'
        and m.notes='BOM_BASELINE_ESTIMATE_V1'
    )::bigint as estimated_consumption_rows,
    count(m.id) filter (
      where m.movement_date>date_trunc('month',p.period_month)::date
        and m.movement_date<=least((p.period_month + interval '1 month - 1 day')::date,current_date)
        and m.movement_type in ('PURCHASE_RECEIPT','SALE_CONSUMPTION')
    )::bigint as period_movement_rows
  from public.inventory_items i
  cross join periods p
  left join lateral (
    select o2.opname_date,o2.physical_qty
    from public.inventory_stock_opname o2
    where o2.brand_id=i.brand_id and o2.inventory_item_id=i.id
      and o2.opname_date<=least((p.period_month + interval '1 month - 1 day')::date,current_date)
    order by o2.opname_date desc,o2.created_at desc,o2.id desc
    limit 1
  ) o on true
  left join public.inventory_movements m
    on m.brand_id=i.brand_id and m.inventory_item_id=i.id
      and m.movement_date>=o.opname_date
      and m.movement_date<=least((p.period_month + interval '1 month - 1 day')::date,current_date)
  where i.unit is not null and btrim(i.unit)<>'' and btrim(i.unit)<>'purchase_unit'
  group by i.brand_id,i.id,i.unit,p.period_month,o.opname_date,o.physical_qty
),
per_unit as (
  select brand_id,period_month,unit,
    count(*)::bigint as total_unit_skus,
    count(*) filter(where opname_date is not null)::bigint as checkpoint_skus,
    sum(physical_qty+movement_delta) filter(where opname_date is not null)::numeric as recorded_end_qty,
    coalesce(sum(same_day_movement_rows),0)::bigint as ambiguous_same_day_rows,
    coalesce(sum(estimated_consumption_rows),0)::bigint as estimated_usage_rows,
    coalesce(sum(period_movement_rows),0)::bigint as period_movement_rows
  from sku_period
  group by brand_id,period_month,unit
)
select x.brand_id,x.period_month,x.unit,x.total_unit_skus,x.checkpoint_skus,
  case when x.checkpoint_skus=0 then null else x.recorded_end_qty end as recorded_end_qty,
  x.ambiguous_same_day_rows,x.estimated_usage_rows,x.period_movement_rows,
  coalesce(a.sale_item_rows,0)::bigint as sale_rows,
  coalesce(a.unlinked_sale_item_rows,0)::bigint as unlinked_sale_rows,
  case
    when x.checkpoint_skus=0 then 'NO_CHECKPOINT'
    when coalesce(a.unlinked_sale_item_rows,0)>0
      and x.period_movement_rows=0 then 'NO_POSTED_SALES'
    when coalesce(a.unlinked_sale_item_rows,0)>0 then 'PARTIAL_SALES'
    when x.ambiguous_same_day_rows>0 then 'SAME_DAY_AMBIGUOUS'
    when x.estimated_usage_rows>0 then 'ESTIMATED_USAGE'
    when x.checkpoint_skus<x.total_unit_skus then 'PARTIAL_CHECKPOINTS'
    else 'LEDGER_RECORDED'
  end::text as data_status
from per_unit x
left join public.ui_stock_sales_link_audit_v1 a
  on a.brand_id=x.brand_id and a.period_month=x.period_month;

revoke all on public.ui_stock_month_end_trend_v1 from public,anon;
grant select on public.ui_stock_month_end_trend_v1 to authenticated,service_role;
comment on view public.ui_stock_month_end_trend_v1 is
 'Historical per-unit end-of-month balance reconstructed from latest prior physical opname plus posted movements only. No pre-checkpoint extrapolation; missing sales/status explicitly flagged. Unit totals are not physically certified.';
