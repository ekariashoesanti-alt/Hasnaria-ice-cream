-- Hasnaria stock/sales bridge: no automatic backfill of unverified BOMs.
-- This migration changes read models and the safe sync function, not existing sales/ledger balances.

-- Retain all existing view columns and types (dependent reports must keep working).
-- Previously inner join to registry hid 134 valid master-item movements from Aug/Sep.
create or replace view public.inventory_stock_ledger_p4_v1
with (security_invoker=true)
as
select m.id,m.brand_id,m.outlet_id,m.inventory_item_id,
       r.sku_code,
       coalesce(r.sku_name,i.item_name,'SKU tidak ditemukan')::text as sku_name,
       coalesce(r.base_unit,i.unit,'unit')::text as base_unit,
       m.movement_date,
       (case
         when m.movement_type='BASELINE' then 'OPENING'
         when m.movement_type='PURCHASE_RECEIPT' then 'PURCHASE'
         when m.movement_type in ('OPNAME_CORRECTION','ADJUSTMENT') then 'ADJUSTMENT'
         when m.movement_type in ('SALE_USAGE','SALE','SALE_CONSUMPTION') then 'SALE'
         else 'OTHER'
       end)::text as ledger_type,
       m.movement_type as source_movement_type,
       m.qty_delta,m.unit_cost,m.reference_type,m.reference_id,
       m.source_key,m.system_generated,m.notes,m.created_at
from public.inventory_movements m
left join public.inventory_sku_registry r
  on r.brand_id=m.brand_id and r.inventory_item_id=m.inventory_item_id
left join public.inventory_items i
  on i.id=m.inventory_item_id and i.brand_id=m.brand_id;

-- Source-to-stock reconciliation: audited monthly reference coverage.
-- An item can consume multiple ingredients, so don't equate these totals with quantity.
create or replace view public.ui_stock_sales_link_audit_v1
with (security_invoker=true)
as
with movement_refs as (
  select m.brand_id,m.reference_id as sale_item_id,
         count(*) as movement_rows,
         count(distinct m.inventory_item_id) as moved_skus
  from public.inventory_movements m
  where m.movement_type='SALE_CONSUMPTION'
    and m.reference_type='sale_item'
    and m.system_generated=true
  group by m.brand_id,m.reference_id
), recipe_refs as (
  select r.brand_id,r.product_id,
         count(*) filter(where r.active) as active_components,
         count(*) filter(where r.active and r.bom_status='verified') as verified_components
  from public.inventory_recipe_components r
  group by r.brand_id,r.product_id
), detail as (
  select s.brand_id,date_trunc('month',s.sold_at)::date as period_month,s.sold_at,
         si.id as sale_item_id,si.product_id,
         coalesce(rc.active_components,0) as active_components,
         coalesce(rc.verified_components,0) as verified_components,
         rv.status as recipe_status,rv.effective_from,
         coalesce(mr.movement_rows,0) as movement_rows
  from public.sales s
  join public.sale_items si on si.sale_id=s.id
  left join recipe_refs rc on rc.brand_id=s.brand_id and rc.product_id=si.product_id
  left join public.product_recipe_verifications rv
    on rv.brand_id=s.brand_id and rv.product_id=si.product_id
  left join movement_refs mr on mr.brand_id=s.brand_id and mr.sale_item_id=si.id
)
select d.brand_id,d.period_month,
       count(*)::bigint as sale_item_rows,
       count(*) filter(where d.movement_rows>0)::bigint as linked_sale_item_rows,
       count(*) filter(where d.movement_rows=0)::bigint as unlinked_sale_item_rows,
       count(*) filter(where d.product_id is null)::bigint as unmapped_product_rows,
       count(*) filter(where d.active_components=0)::bigint as no_recipe_rows,
       count(*) filter(where d.active_components>0 and d.verified_components<d.active_components)::bigint as unverified_components_rows,
       count(*) filter(where d.recipe_status='verified' and d.effective_from<=d.sold_at and d.active_components>0 and d.active_components=d.verified_components)::bigint as eligible_verified_rows,
       count(*) filter(where d.recipe_status is distinct from 'verified' or d.effective_from is null)::bigint as awaiting_recipe_approval_rows,
       coalesce(sum(d.movement_rows),0)::bigint as sale_consumption_movements,
       max(d.sold_at) as latest_sale_date
from detail d
group by d.brand_id,d.period_month;

grant select on public.ui_stock_sales_link_audit_v1 to authenticated,service_role;

-- Preserve old generated sales consumption records while a recipe is still DRAFT.
-- No deletion-first. On approved recipes, update existing legacy sale:<item>:<SKU>
-- by reference_id/SKU, avoiding a second source key and double counting.
create or replace function private.sync_sale_item_inventory_movement(p_sale_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
 v_item public.sale_items%rowtype;
 v_brand uuid;
 v_sold_at date;
 v_approved date;
 v_total bigint;
 v_verified bigint;
 v_rec record;
 v_existing uuid;
 v_matches bigint;
begin
 select * into v_item from public.sale_items where id=p_sale_item_id;
 if not found or v_item.product_id is null then return; end if;
 select s.brand_id,s.sold_at into v_brand,v_sold_at
 from public.sales s where s.id=v_item.sale_id;
 if v_brand is null or v_sold_at is null then return; end if;
 select rv.effective_from into v_approved
 from public.product_recipe_verifications rv
 where rv.brand_id=v_brand and rv.product_id=v_item.product_id
   and rv.status='verified' and rv.effective_from<=v_sold_at;
 if v_approved is null then return; end if;

 select count(*) filter(where active),
        count(*) filter(where active and bom_status='verified')
 into v_total,v_verified
 from public.inventory_recipe_components
 where brand_id=v_brand and product_id=v_item.product_id;
 if v_total=0 or v_verified<>v_total then return; end if;

 for v_rec in
   select r.inventory_item_id,r.qty_per_sale
   from public.inventory_recipe_components r
   where r.brand_id=v_brand and r.product_id=v_item.product_id and r.active
 loop
   if v_rec.qty_per_sale is null or v_rec.qty_per_sale<=0 then
      raise exception 'Non-positive verified ingredient quantity for product %',v_item.product_id;
   end if;
   select count(*),min(m.id) into v_matches,v_existing
   from public.inventory_movements m
   where m.brand_id=v_brand and m.reference_type='sale_item'
     and m.reference_id=p_sale_item_id and m.inventory_item_id=v_rec.inventory_item_id
     and m.movement_type='SALE_CONSUMPTION' and m.system_generated;
   if v_matches>1 then
      raise exception 'Duplicate SALE_CONSUMPTION for sale item %, SKU %',
        p_sale_item_id,v_rec.inventory_item_id;
   end if;

   if v_existing is not null then
      update public.inventory_movements
      set movement_date=v_sold_at,
          qty_delta=-(v_item.qty::numeric*v_rec.qty_per_sale),
          notes=v_item.item_name
      where id=v_existing;
   else
      perform private.sync_inventory_baseline(v_rec.inventory_item_id);
      insert into public.inventory_movements
        (brand_id,inventory_item_id,movement_date,movement_type,qty_delta,
         reference_type,reference_id,source_key,system_generated,notes)
      values (v_brand,v_rec.inventory_item_id,v_sold_at,'SALE_CONSUMPTION',
              -(v_item.qty::numeric*v_rec.qty_per_sale),
              'sale_item',p_sale_item_id,
              'SALE_ITEM:'||p_sale_item_id::text||':'||v_rec.inventory_item_id::text,
              true,v_item.item_name)
      on conflict (brand_id,source_key)
        where source_key is not null and btrim(source_key)<>''
      do update set movement_date=excluded.movement_date,
                    qty_delta=excluded.qty_delta,notes=excluded.notes;
   end if;
 end loop;
 -- Removed components are not silently erased; surface these for reconciliation.
 -- Historical bookkeeping and unverified recipes remain unchanged.
end;
$function$;

revoke execute on function private.sync_sale_item_inventory_movement(uuid)
  from public,anon,authenticated;
grant execute on function private.sync_sale_item_inventory_movement(uuid)
  to service_role;

comment on view public.ui_stock_sales_link_audit_v1 is
'Read-only sales_detail-to-inventory bridge audit. Unlinked is not automatically safe to post: recipe verification and effective dates required.';
