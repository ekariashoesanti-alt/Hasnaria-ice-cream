-- Singapore UAT private schema only. NEVER include in production migrations.
-- Purely read-only BOM demand simulation from original source worksheets:
-- October 2026 monthly product sales × unapproved exported Majoo BOM lines.
-- All quantities remain in the *recipe source unit*. Do not translate PACK,
-- PORTION, PCS etc. into procurement pack / weight / physical on-hand values.
-- No inventory_movements, purchases, sales, journal, HPP or stock mutation.
create or replace view hasnaria_uat.bom_demand_component_preview_v2
with (security_invoker = true)
as
select ss.batch_key,
       b.id as monthly_batch_id,
       b.period_month,
       ss.monthly_sales_sha256 as sales_file_sha256,
       l.source_sku as product_sku,
       l.source_product_name as product_name,
       l.quantity as gross_sold_units,
       l.refund_quantity as refunded_sold_units,
       c.source_row_no as recipe_source_row_no,
       c.ingredient_sku,
       im.ingredient_name,
       c.quantity::numeric(24,6) as recipe_quantity_per_sale_raw,
       c.source_unit as recipe_unit,
       im.source_unit as ingredient_master_unit,
       (l.quantity::numeric * c.quantity)::numeric(24,6) as gross_demand_raw_unit,
       (l.refund_quantity::numeric * c.quantity)::numeric(24,6) as possible_refund_raw_unit,
       case
         when upper(btrim(c.source_unit)) in ('PACK','PORSI')
           then 'PACK_OR_PORTION_CONVERSION_REVIEW'
         else 'SOURCE_RECIPE_NOT_APPROVED'
       end as safety_gate,
       false as conversion_verified,
       false as recipe_approved,
       true as simulation_only,
       false as stock_posting_allowed
from hasnaria_uat.source_sets ss
join public.sales_product_report_batches b
  on b.file_sha256=ss.monthly_sales_sha256
join public.sales_product_report_lines l
  on l.batch_id=b.id
join hasnaria_uat.recipe_composition c
  on c.batch_key=ss.batch_key and c.product_sku=l.source_sku
join hasnaria_uat.ingredient_master im
  on im.batch_key=c.batch_key and im.source_sku=c.ingredient_sku;
revoke all on hasnaria_uat.bom_demand_component_preview_v2 from PUBLIC,anon,authenticated;

-- Ingredient group is always (specific ingredient SKU, ORIGINAL UNIT).
-- Never aggregate gram + ML + packs into a single physical-stock number.
create or replace view hasnaria_uat.bom_ingredient_demand_preview_v2
with (security_invoker = true)
as
select batch_key,monthly_batch_id,period_month,sales_file_sha256,
       ingredient_sku,ingredient_name,recipe_unit,ingredient_master_unit,
       count(distinct product_sku)::int as contributing_sku_count,
       sum(gross_demand_raw_unit)::numeric(24,6) as gross_raw_requirement,
       sum(possible_refund_raw_unit)::numeric(24,6) as refund_exposure_raw_unit,
       bool_or(safety_gate='PACK_OR_PORTION_CONVERSION_REVIEW') as pack_or_portion_review,
       true as simulation_only,false as conversion_verified,false as stock_posting_allowed
from hasnaria_uat.bom_demand_component_preview_v2
group by batch_key,monthly_batch_id,period_month,sales_file_sha256,
         ingredient_sku,ingredient_name,recipe_unit,ingredient_master_unit;
revoke all on hasnaria_uat.bom_ingredient_demand_preview_v2 from PUBLIC,anon,authenticated;

-- Exactly one row per sold SKU. Legacy candidates intentionally are NOT
-- expanded into ingredient quantities: they have no approved BOM evidence.
create or replace view hasnaria_uat.bom_sku_readiness_gate_v2
with (security_invoker = true)
as
select k.monthly_batch_id,k.source_sku,k.source_product_name,k.quantity,
       k.source_coverage_status,
       coalesce(count(c.recipe_source_row_no),0)::int as source_bom_component_lines,
       coalesce(bool_or(c.safety_gate='PACK_OR_PORTION_CONVERSION_REVIEW'),false)
         as includes_pack_or_portion,
       case
         when k.source_coverage_status='LEGACY_BOM_REVIEW_ONLY'
           then 'LEGACY_RECIPE_OWNER_VERIFICATION_REQUIRED'
         when k.source_coverage_status='UNRESOLVED'
           then 'NO_SOURCE_RECIPE'
         when coalesce(bool_or(c.safety_gate='PACK_OR_PORTION_CONVERSION_REVIEW'),false)
           then 'EXPORTED_BOM_UNAPPROVED_PACK_REVIEW'
         else 'EXPORTED_BOM_UNAPPROVED'
       end as readiness_reason,
       false as approved_for_stock,
       false as stock_posting_allowed
from hasnaria_uat.sold_product_bom_coverage_v2 k
left join hasnaria_uat.bom_demand_component_preview_v2 c
  on c.monthly_batch_id=k.monthly_batch_id and c.product_sku=k.source_sku
group by k.monthly_batch_id,k.source_sku,k.source_product_name,k.quantity,
         k.source_coverage_status;
revoke all on hasnaria_uat.bom_sku_readiness_gate_v2 from PUBLIC,anon,authenticated;
