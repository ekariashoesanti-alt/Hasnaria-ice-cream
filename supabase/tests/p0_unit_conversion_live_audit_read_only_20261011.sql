-- Hasnaria P0 #2: safe against live Supabase. SELECT-only.
-- This audit checks master units, conversion rules, and September pending
-- Purchase evidence; it NEVER fills unknown factor/unit or posts Stock.

-- A. Master units and placeholders by SKU.
select coalesce(nullif(btrim(unit),''),'[KOSONG]') as stock_master_unit,
       count(*) as sku_count
from public.inventory_items
group by 1 order by sku_count desc,stock_master_unit;

-- B. Conversion workflow statuses: a draft numerical factor is NOT approval.
select status,count(*) as rules,
       count(distinct inventory_item_id) as skus,
       count(*) filter(where units_per_purchase_unit is null
                     or units_per_purchase_unit<=0) as invalid_factor
from public.inventory_unit_conversions group by status order by status;

-- C. Duplicates and master-vs-conversion unit conflict requiring Owner review.
with rules as (
 select c.brand_id,c.inventory_item_id,i.item_name as sku_name,
        i.unit as master_unit,lower(btrim(c.purchase_unit)) as purchase_unit,
        lower(btrim(c.sale_unit)) as sale_unit,
        count(*) as rules,count(*) filter(where c.status='verified') verified,
        count(distinct c.units_per_purchase_unit) as distinct_factors,
        max(c.units_per_purchase_unit) as proposed_factor
 from public.inventory_unit_conversions c
 join public.inventory_items i on i.id=c.inventory_item_id and i.brand_id=c.brand_id
 group by 1,2,3,4,5,6
)
select sku_name,master_unit,purchase_unit,sale_unit,rules,verified,
       distinct_factors,proposed_factor,
       case when lower(btrim(master_unit))<>sale_unit then 'MASTER_UNIT_CONFLICT'
            when verified>1 then 'DUPLICATE_VERIFIED'
            when distinct_factors>1 then 'CONTRADICTORY_FACTORS'
            when rules>1 then 'DUPLICATE_DRAFT'
            else 'REVIEW' end as issue
from rules
where rules>1 or lower(btrim(master_unit))<>sale_unit or verified>1
   or distinct_factors>1
order by issue,sku_name;

-- D. September mapped and unposted Purchase by reason for attention.
with p as (
 select b.brand_id,b.id,b.mapping_status,b.inventory_item_id,
        i.unit as master_unit,b.unit_text,b.total_amount,
        case when r.last_opname_date is null then 'NO_PHYSICAL_BASELINE'
             when b.purchase_date<=r.last_opname_date then 'PRE_OR_ON_OPNAME'
             else 'POST_OPNAME' end as opname_status
 from public.purchase_inventory_bridge b
 join public.inventory_items i on i.id=b.inventory_item_id and i.brand_id=b.brand_id
 left join public.inventory_stock_reconciliation r
   on r.brand_id=b.brand_id and r.inventory_item_id=b.inventory_item_id
 where b.source_period=date '2026-09-01' and b.ready_for_inventory
   and b.mapping_status in ('exact_name','inventory_alias')
   and not exists(select 1 from public.inventory_purchase_log l
                  where l.brand_id=b.brand_id and l.source_history_id=b.id)
)
select mapping_status,opname_status,
       count(*) as pending_rows,sum(total_amount) as pending_purchase_value,
       count(*) filter(where nullif(btrim(coalesce(unit_text,'')),'') is null)
         as missing_purchase_unit,
       count(*) filter(where lower(btrim(coalesce(master_unit,'')))='purchase_unit')
         as placeholder_stock_master
from p
group by 1,2 order by mapping_status,opname_status;

-- E. Unmapped/ambiguous September items require SKU mapping, not unit attest.
select mapping_status,count(*) as purchase_rows,sum(total_amount) as purchase_value
from public.purchase_inventory_bridge
where source_period=date '2026-09-01'
group by mapping_status order by mapping_status;
