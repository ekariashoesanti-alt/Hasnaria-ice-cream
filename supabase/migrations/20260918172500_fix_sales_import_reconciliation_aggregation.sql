begin;

create or replace view public.sales_import_reconciliation
with (security_invoker=true)
as
with sales_rollup as (
  select
    source_batch_id as batch_id,
    count(*) as posted_transactions,
    coalesce(sum(total_amount),0) as posted_revenue
  from public.sales
  where source_batch_id is not null
  group by source_batch_id
),
item_rollup as (
  select
    s.source_batch_id as batch_id,
    count(si.id) as posted_item_rows,
    count(si.id) filter(where si.product_id is null) as unmapped_item_rows
  from public.sales s
  join public.sale_items si on si.sale_id=s.id
  where s.source_batch_id is not null
  group by s.source_batch_id
)
select
  b.brand_id,
  b.outlet_id,
  b.id as batch_id,
  b.filename,
  b.status,
  b.period_from,
  b.period_to,
  b.transaction_count as expected_transactions,
  coalesce(sr.posted_transactions,0) as posted_transactions,
  b.total_amount as expected_revenue,
  coalesce(sr.posted_revenue,0) as posted_revenue,
  coalesce(ir.posted_item_rows,0) as posted_item_rows,
  coalesce(ir.unmapped_item_rows,0) as unmapped_item_rows,
  coalesce(sr.posted_revenue,0)-b.total_amount as revenue_variance
from public.sales_import_batches b
left join sales_rollup sr on sr.batch_id=b.id
left join item_rollup ir on ir.batch_id=b.id;

grant select on public.sales_import_reconciliation to authenticated;

commit;
