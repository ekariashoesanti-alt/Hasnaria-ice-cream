-- Hasnaria Stock: read-only per-product recipe verification queue.
-- Source: real sale items, product recipe approvals and active ingredient checks.
-- This view DOES NOT approve recipes, sync sales, or mutate inventory.
-- Deploy this DB view before the corresponding Stock UI.
create or replace view public.ui_stock_recipe_review_v1
with (security_invoker = true) as
with sold as (
  select s.brand_id,
         date_trunc('month',s.sold_at)::date as period_month,
         si.product_id,
         count(*)::bigint as sale_item_rows,
         coalesce(sum(si.qty),0)::numeric as sold_units,
         min(s.sold_at)::date as first_sale_date,
         max(s.sold_at)::date as last_sale_date
  from public.sales s
  join public.sale_items si on si.sale_id = s.id
  where si.product_id is not null
  group by s.brand_id,date_trunc('month',s.sold_at)::date,si.product_id
), bom as (
  select c.brand_id,c.product_id,
         count(*) filter (where c.active)::bigint as active_components,
         count(*) filter (where c.active and c.bom_status='verified'
                                and c.qty_per_sale>0)::bigint as verified_components,
         count(*) filter (where c.active and c.bom_status<>'verified')::bigint as pending_components
  from public.inventory_recipe_components c
  group by c.brand_id,c.product_id
)
select sold.brand_id,
       sold.period_month,
       sold.product_id,
       p.name as product_name,
       sold.sale_item_rows,
       sold.sold_units,
       sold.first_sale_date,
       sold.last_sale_date,
       coalesce(bom.active_components,0)::bigint as active_components,
       coalesce(bom.verified_components,0)::bigint as verified_components,
       coalesce(bom.pending_components,0)::bigint as pending_components,
       coalesce(rv.status,'missing')::text as recipe_status,
       rv.effective_from,
       case
         when coalesce(bom.active_components,0)=0 then 'missing_bom'
         when coalesce(bom.active_components,0)<>coalesce(bom.verified_components,0)
           then 'component_pending'
         when rv.status is distinct from 'verified' or rv.effective_from is null
           then 'product_approval_pending'
         when rv.effective_from>sold.first_sale_date
           then 'effective_date_partial'
         else 'eligible'
       end::text as review_state
from sold
join public.products p
  on p.id=sold.product_id and p.brand_id=sold.brand_id
left join bom
  on bom.brand_id=sold.brand_id and bom.product_id=sold.product_id
left join public.product_recipe_verifications rv
  on rv.brand_id=sold.brand_id and rv.product_id=sold.product_id;

revoke all on public.ui_stock_recipe_review_v1 from public,anon;
grant select on public.ui_stock_recipe_review_v1 to authenticated,service_role;
comment on view public.ui_stock_recipe_review_v1 is
  'Authenticated, RLS-invoker read-only per-product Stock recipe review. No inferred quantities or automatic approval.';
