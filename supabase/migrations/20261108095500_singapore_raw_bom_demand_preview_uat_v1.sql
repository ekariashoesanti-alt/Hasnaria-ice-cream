-- UAT ONLY: gross monthly ingredient demand in *raw recipe units*.
-- This view intentionally does not choose inventory IDs, approve physical conversions,
-- infer daily consumption, subtract refunds, or write any stock/finance ledgers.
create or replace view hasnaria_uat.raw_bom_demand_preview_v1
with (security_invoker=true)
as
select
  ss.batch_key,
  ss.monthly_sales_sha256 as sales_file_sha256,
  c.ingredient_sku,
  im.ingredient_name,
  c.source_unit as recipe_unit,
  count(distinct c.product_sku)::integer as sold_products_using_ingredient,
  sum(l.quantity)::numeric as sold_gross_units_for_ingredient,
  sum(l.quantity::numeric * c.quantity)::numeric(24,6) as gross_required_raw_recipe_unit,
  sum(l.refund_quantity::numeric * c.quantity)::numeric(24,6) as potential_refunded_raw_recipe_unit,
  true as simulation_only,
  false as conversion_verified,
  false as stock_posting_allowed
from hasnaria_uat.source_sets ss
join hasnaria_uat.recipe_composition c on c.batch_key=ss.batch_key
join hasnaria_uat.ingredient_master im
  on im.batch_key=c.batch_key and im.source_sku=c.ingredient_sku
join public.sales_product_report_batches b
  on b.file_sha256=ss.monthly_sales_sha256 and b.period_month='2026-10-01'::date
join public.sales_product_report_lines l
  on l.batch_id=b.id and l.source_sku=c.product_sku
group by ss.batch_key,ss.monthly_sales_sha256,c.ingredient_sku,
  im.ingredient_name,c.source_unit;

revoke all on hasnaria_uat.raw_bom_demand_preview_v1 from public, anon, authenticated;
