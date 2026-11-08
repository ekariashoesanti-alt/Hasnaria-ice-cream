-- Singapore-only UAT legacy BOM candidates for sold products absent from Majoo recipe export.
-- Imported from read-only Tokyo ERP snapshot. All candidates unapproved; NO stock posting.
create table if not exists hasnaria_uat.legacy_recipe_candidates (
  batch_key text not null references hasnaria_uat.source_sets(batch_key),
  product_sku text not null,
  legacy_ingredient_name text not null,
  legacy_quantity numeric(18,6) not null check(legacy_quantity>0),
  legacy_unit text not null,
  legacy_component_status text not null check(legacy_component_status in ('verified','suggested','draft')),
  legacy_recipe_status text not null check(legacy_recipe_status in ('verified','draft','missing')),
  source_note text,
  approved_for_stock boolean not null default false check(approved_for_stock=false),
  primary key(batch_key,product_sku),
  foreign key(batch_key,product_sku) references hasnaria_uat.product_master(batch_key,source_sku)
);
alter table hasnaria_uat.legacy_recipe_candidates enable row level security;
revoke all on hasnaria_uat.legacy_recipe_candidates from public, anon, authenticated;

create or replace view hasnaria_uat.sold_product_bom_coverage_v2
with (security_invoker=true)
as
select b.id as monthly_batch_id,l.source_sku,l.source_product_name,l.quantity,
  case when exists(
    select 1 from hasnaria_uat.recipe_composition x
    where x.batch_key=ss.batch_key and x.product_sku=l.source_sku
  ) then 'EXPORTED_BOM_UNAPPROVED'
  when exists(
    select 1 from hasnaria_uat.legacy_recipe_candidates x
    where x.batch_key=ss.batch_key and x.product_sku=l.source_sku
  ) then 'LEGACY_BOM_REVIEW_ONLY'
  else 'UNRESOLVED'
  end as source_coverage_status,
  false as recipe_approved,
  false as stock_posting_allowed
from hasnaria_uat.source_sets ss
join public.sales_product_report_batches b on b.file_sha256=ss.monthly_sales_sha256
join public.sales_product_report_lines l on l.batch_id=b.id;
revoke all on hasnaria_uat.sold_product_bom_coverage_v2 from public, anon, authenticated;
