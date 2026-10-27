-- Hasnaria Stage 1: true stock impact preview + Owner evidence audit.
-- NO automatic recipe verification; NO inventory, sale or finance mutations.
-- Production rollout: deploy backend first, verify read-only counts, then frontend.
create or replace view public.ui_stock_recipe_component_impact_v1
with (security_invoker=true) as
with sold as (
  select s.brand_id, date_trunc('month',s.sold_at)::date as period_month,
         si.product_id, count(*)::bigint as sale_item_rows,
         coalesce(sum(si.qty),0)::numeric as sold_units
  from public.sales s join public.sale_items si on si.sale_id=s.id
  where si.product_id is not null
  group by s.brand_id,date_trunc('month',s.sold_at)::date,si.product_id
)
select sold.brand_id, sold.period_month,sold.product_id,
       c.id as component_id,c.inventory_item_id,i.item_name as sku_name,
       coalesce(i.unit,'') as sku_unit,c.qty_per_sale,
       c.bom_status,c.evidence_note,
       sold.sale_item_rows,sold.sold_units,
       (sold.sold_units*c.qty_per_sale)::numeric as estimated_usage,
       coalesce(r.tracking_active,false) as tracking_active,
       case when r.tracking_active then r.system_qty else null end as current_system_qty,
       case when r.tracking_active then r.system_qty - (sold.sold_units*c.qty_per_sale) else null end as hypothetical_remaining_qty
from sold
join public.inventory_recipe_components c
  on c.brand_id=sold.brand_id and c.product_id=sold.product_id and c.active
join public.inventory_items i
  on i.id=c.inventory_item_id and i.brand_id=sold.brand_id
left join public.inventory_stock_reconciliation r
  on r.brand_id=sold.brand_id and r.inventory_item_id=c.inventory_item_id;

revoke all on public.ui_stock_recipe_component_impact_v1 from public,anon;
grant select on public.ui_stock_recipe_component_impact_v1 to authenticated,service_role;
comment on view public.ui_stock_recipe_component_impact_v1 is
  'Read-only product-level consumption scenario, NOT combined cross-product forecast; no Stock posting.';

create table if not exists private.stock_recipe_owner_reviews_v1(
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null,
  product_id uuid not null references public.products(id),
  period_month date not null,
  decision text not null check(decision in ('EVIDENCE_RECORDED','HOLD_FOR_CORRECTION')),
  proposed_effective_from date,
  evidence_reference text not null,
  review_reason text not null,
  source_snapshot jsonb not null,
  reviewed_by uuid not null,
  reviewed_at timestamptz not null default now()
);
create index if not exists idx_stock_recipe_owner_reviews_v1_brand_product_period
  on private.stock_recipe_owner_reviews_v1(brand_id,product_id,period_month,reviewed_at desc);
revoke all on private.stock_recipe_owner_reviews_v1 from public,anon,authenticated;
comment on table private.stock_recipe_owner_reviews_v1 is
  'Append-only Owner evidence decisions. NEVER an approval/posting source; no triggers to Inventory/Finance.';

create or replace function private.owner_stock_recipe_record_review_v1(
 p_product_id uuid,p_period_month date,p_decision text,
 p_proposed_effective_from date,p_evidence_reference text,p_reason text,p_attested boolean
)
returns jsonb
language plpgsql security definer set search_path=''
as $fn$
declare
 v_brand uuid;
 v_count bigint;
 v_snapshot jsonb;
 v_review_id uuid;
begin
 if auth.uid() is null or not private.is_owner() then
   raise exception 'Active Owner login required';
 end if;
 if p_product_id is null or p_period_month is null
    or date_trunc('month',p_period_month)::date <> p_period_month then
   raise exception 'Valid product and first day of period required';
 end if;
 if p_decision not in ('EVIDENCE_RECORDED','HOLD_FOR_CORRECTION') then
   raise exception 'Decision must explicitly document or hold; cannot approve through this action';
 end if;
 if length(btrim(coalesce(p_evidence_reference,''))) not between 12 and 400
    or length(btrim(coalesce(p_reason,''))) not between 30 and 1000 then
   raise exception 'Evidence reference (12-400 chars) and review reason (30-1000 chars) are required';
 end if;
 if p_decision='EVIDENCE_RECORDED' and p_attested is distinct from true then
   raise exception 'Owner must confirm physical source review';
 end if;
 if p_proposed_effective_from is not null and
    (p_proposed_effective_from<p_period_month
     or p_proposed_effective_from>=(p_period_month+interval '1 month')::date
     or p_proposed_effective_from>timezone('Asia/Jakarta',now())::date) then
   raise exception 'Proposed effective date must fall in the selected period and not be in the future';
 end if;
 select p.brand_id into v_brand from public.products p where p.id=p_product_id;
 if v_brand is null or not private.same_brand(v_brand) then
   raise exception 'Product not found or other-brand access denied';
 end if;
 select count(*) into v_count from public.sale_items si
 join public.sales s on s.id=si.sale_id
 where s.brand_id=v_brand and si.product_id=p_product_id
   and s.sold_at>=p_period_month and s.sold_at<(p_period_month+interval '1 month')::date;
 if v_count=0 then raise exception 'No real sales for selected product/period'; end if;

 select coalesce(jsonb_agg(
   jsonb_build_object('component_id',v.component_id,'sku_id',v.inventory_item_id,
     'sku_name',v.sku_name,'unit',v.sku_unit,'qty_per_sale',v.qty_per_sale,
     'bom_status',v.bom_status,'tracked',v.tracking_active,
     'system_qty',v.current_system_qty,'estimated_usage',v.estimated_usage,
     'hypothetical_remaining',v.hypothetical_remaining_qty)
   order by v.component_id::text),'[]'::jsonb)
 into v_snapshot from public.ui_stock_recipe_component_impact_v1 v
 where v.brand_id=v_brand and v.product_id=p_product_id and v.period_month=p_period_month;

 insert into private.stock_recipe_owner_reviews_v1(
  brand_id,product_id,period_month,decision,proposed_effective_from,
  evidence_reference,review_reason,source_snapshot,reviewed_by
 ) values(
  v_brand,p_product_id,p_period_month,p_decision,p_proposed_effective_from,
  btrim(p_evidence_reference),btrim(p_reason),v_snapshot,auth.uid()
 ) returning id into v_review_id;

 return jsonb_build_object(
  'review_id',v_review_id,'decision',p_decision,'period_month',p_period_month,
  'stock_changed',false,'recipe_approved',false,'finance_changed',false,
  'requires_separate_approval',true,'component_rows',jsonb_array_length(v_snapshot)
 );
end;
$fn$;

create or replace function public.owner_stock_recipe_record_review_v1(
 p_product_id uuid,p_period_month date,p_decision text,
 p_proposed_effective_from date,p_evidence_reference text,p_reason text,p_attested boolean
)
returns jsonb language sql set search_path=''
as $fn$
  select private.owner_stock_recipe_record_review_v1(
   p_product_id,p_period_month,p_decision,p_proposed_effective_from,
   p_evidence_reference,p_reason,p_attested
  );
$fn$;

revoke all on function private.owner_stock_recipe_record_review_v1(
 uuid,date,text,date,text,text,boolean) from public,anon,authenticated;
revoke all on function public.owner_stock_recipe_record_review_v1(
 uuid,date,text,date,text,text,boolean) from public,anon;
grant execute on function public.owner_stock_recipe_record_review_v1(
 uuid,date,text,date,text,text,boolean) to authenticated,service_role;
